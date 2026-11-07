import { classifyEgress, type EgressClass, type EgressKind } from "./egress.ts";
import { activeLicenseFor, stakeLicense } from "./agent-license.ts";
import { hopAllowed } from "./job-queue.ts";

export type ApprovalStatus = "pending" | "allowed" | "denied" | "auto" | "relayed" | "awaiting-principal";
export type EgressMode = "undecided" | "self" | "relay";

export type Approval = EgressClass & {
  id: string;
  at: number;
  url: string;
  method: string;
  origin: string;
  detail: string;
  status: ApprovalStatus;
  cost: number;
  via: "page" | "plugin" | "grant";
  mode: EgressMode;
  operator: string;
  principal: string;
  agentNft: string;
  licenseAtRisk: boolean;
  signature: string;
  resultDigest: string;
};

export type ApprovalRequest = {
  url: string;
  method?: string;
  origin?: string;
  detail?: string;
  cost?: number;
  principal?: string;
};

const KEY = "ecca.sidecar.approvals.v2";
const GRANT_KEY = "ecca.sidecar.grants.v1";

type Waiter = {
  resolve: (rec: Approval) => void;
};

type Store = {
  items: Approval[];
  grants: Record<string, boolean>;
};

const waiters = new Map<string, Waiter>();
const listeners = new Set<() => void>();

function empty(): Store {
  return { items: [], grants: {} };
}

let store: Store = empty();
let loaded = false;
let pendingCache: Approval[] = [];
let relayedCache: Approval[] = [];

function refreshPending() {
  pendingCache = store.items.filter((a) => a.status === "pending" || a.status === "awaiting-principal");
  relayedCache = store.items.filter((a) => a.status === "relayed" || a.status === "awaiting-principal");
}

function load(): Store {
  if (loaded) return store;
  loaded = true;
  if (typeof window === "undefined") {
    store = empty();
    refreshPending();
    return store;
  }
  try {
    const items = JSON.parse(localStorage.getItem(KEY) || "[]") as Approval[];
    const grants = JSON.parse(localStorage.getItem(GRANT_KEY) || "{}") as Record<string, boolean>;
    store = {
      items: Array.isArray(items) ? items.slice(0, 80).map(hydrate) : [],
      grants: grants && typeof grants === "object" ? grants : {},
    };
  } catch {
    store = empty();
  }
  refreshPending();
  return store;
}

function persist() {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY, JSON.stringify(store.items.slice(0, 80)));
  localStorage.setItem(GRANT_KEY, JSON.stringify(store.grants));
}

function emit() {
  refreshPending();
  listeners.forEach((fn) => fn());
}

function hydrate(raw: Approval): Approval {
  return {
    ...raw,
    mode: raw.mode || "undecided",
    operator: raw.operator || "",
    principal: raw.principal || "",
    agentNft: raw.agentNft || "",
    licenseAtRisk: Boolean(raw.licenseAtRisk),
    signature: raw.signature || "",
    resultDigest: raw.resultDigest || "",
  };
}

function grantKey(kind: EgressKind, host: string) {
  return `${kind}:${host}`;
}

export function subscribeApprovals(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function getApprovals(): Approval[] {
  return load().items;
}

export function getPendingApprovals(): Approval[] {
  load();
  return pendingCache;
}

export function getGrants(): Record<string, boolean> {
  return { ...load().grants };
}

export function resetApprovals() {
  for (const [id, wait] of waiters) {
    const rec = store.items.find((a) => a.id === id);
    if (rec && rec.status === "pending") {
      rec.status = "denied";
      wait.resolve(rec);
    }
  }
  waiters.clear();
  store = empty();
  loaded = true;
  persist();
  emit();
}

export function requestEgress(input: ApprovalRequest): Promise<Approval> {
  load();
  const method = (input.method || "GET").toUpperCase();
  const cls = classifyEgress(input.url, method);
  const rec: Approval = {
    id: crypto.randomUUID(),
    at: Date.now(),
    url: input.url,
    method,
    origin: input.origin || (typeof window !== "undefined" ? window.location.origin : "page"),
    detail: input.detail || cls.label,
    status: cls.decision === "auto" ? "auto" : "pending",
    cost: input.cost ?? 0,
    via: "page",
    mode: "undecided",
    operator: "",
    principal: input.principal || "",
    agentNft: "",
    licenseAtRisk: cls.decision === "approve",
    signature: "",
    resultDigest: "",
    ...cls,
  };
  if (rec.principal) {
    const nft = activeLicenseFor(rec.principal);
    if (nft) {
      rec.agentNft = nft.tokenId;
      rec.licenseAtRisk = true;
    }
  }

  const hop = hopAllowed(input.url);
  if (!hop.ok) {
    rec.status = "denied";
    rec.detail = hop.detail;
    store.items = [rec, ...store.items].slice(0, 80);
    persist();
    emit();
    return Promise.resolve(rec);
  }

  const gk = grantKey(cls.kind, cls.host);
  if (rec.status === "pending" && store.grants[gk]) {
    rec.status = "allowed";
    rec.via = "grant";
  }

  store.items = [rec, ...store.items].slice(0, 80);
  persist();
  emit();

  if (rec.status !== "pending") {
    return Promise.resolve(rec);
  }

  return new Promise((resolve) => {
    waiters.set(rec.id, { resolve });
  });
}

export function decideEgress(id: string, allow: boolean, remember = false): Approval | null {
  load();
  const rec = store.items.find((a) => a.id === id);
  if (!rec || rec.status !== "pending") return rec ?? null;
  rec.status = allow ? "allowed" : "denied";
  if (remember && allow) {
    store.grants[grantKey(rec.kind, rec.host)] = true;
  }
  persist();
  emit();
  const wait = waiters.get(id);
  if (wait) {
    waiters.delete(id);
    wait.resolve(rec);
  }
  return rec;
}

export function revokeGrant(kind: EgressKind, host: string) {
  load();
  delete store.grants[grantKey(kind, host)];
  persist();
  emit();
}

export function isAllowed(rec: Approval) {
  return rec.status === "allowed" || rec.status === "auto";
}

export function getRelayedApprovals(): Approval[] {
  load();
  return relayedCache;
}

function stake(rec: Approval, decision: "self" | "relayed" | "cleared" | "blocked") {
  if (!rec.agentNft) return;
  try {
    stakeLicense(rec.agentNft, {
      hopId: rec.id,
      host: rec.host,
      path: rec.path || rec.url,
      decision,
    });
  } catch {
    /* license may have been suspended; hop still records */
  }
}

export function runSelf(
  id: string,
  input: { signature: string; principal: string; remember?: boolean },
): Approval | null {
  load();
  const rec = store.items.find((a) => a.id === id);
  if (!rec || rec.status !== "pending") return rec ?? null;
  if (!input.signature) throw new Error("Principal has to sign. This is not a framing device.");
  rec.status = "allowed";
  rec.mode = "self";
  rec.principal = input.principal;
  rec.signature = input.signature;
  rec.licenseAtRisk = true;
  if (input.remember) store.grants[grantKey(rec.kind, rec.host)] = true;
  stake(rec, "self");
  persist();
  emit();
  const wait = waiters.get(id);
  if (wait) {
    waiters.delete(id);
    wait.resolve(rec);
  }
  return rec;
}

export function relayTo(
  id: string,
  input: { operator: string; principal: string },
): Approval | null {
  load();
  const rec = store.items.find((a) => a.id === id);
  if (!rec || rec.status !== "pending") return rec ?? null;
  const operator = input.operator.trim();
  if (!operator) throw new Error("Name who will run the hop.");
  if (operator.toLowerCase() === input.principal.trim().toLowerCase()) {
    throw new Error("Relaying to yourself is running it. Use self-run.");
  }
  rec.status = "relayed";
  rec.mode = "relay";
  rec.operator = operator;
  rec.principal = input.principal;
  rec.licenseAtRisk = true;
  stake(rec, "relayed");
  persist();
  emit();
  return rec;
}

export function operatorComplete(id: string, digest: string): Approval | null {
  load();
  const rec = store.items.find((a) => a.id === id);
  if (!rec || rec.status !== "relayed") return rec ?? null;
  rec.status = "awaiting-principal";
  rec.resultDigest = String(digest || "").slice(0, 120);
  persist();
  emit();
  return rec;
}

export function principalReview(
  id: string,
  input: { allow: boolean; signature: string; principal: string },
): Approval | null {
  load();
  const rec = store.items.find((a) => a.id === id);
  if (!rec || rec.status !== "awaiting-principal") return rec ?? null;
  if (!input.signature) throw new Error("Principal has to sign the review. They watched it afterwards.");
  rec.status = input.allow ? "allowed" : "denied";
  rec.signature = input.signature;
  rec.principal = input.principal;
  stake(rec, input.allow ? "cleared" : "blocked");
  persist();
  emit();
  const wait = waiters.get(id);
  if (wait) {
    waiters.delete(id);
    wait.resolve(rec);
  }
  return rec;
}

const NO_APPROVALS: Approval[] = [];
/** What the server rendered: nothing pending. Pass as useSyncExternalStore's third argument. */
export function getPendingApprovalsServerSnapshot(): Approval[] {
  return NO_APPROVALS;
}
