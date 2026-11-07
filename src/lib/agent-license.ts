/** Agent NFT as a license the principal stakes on egress.

  A license holder mints an agent NFT. That NFT is who may ask for a hop.
  The principal either runs the hop themselves or relays it. If someone else
  runs it, the principal has to watch the request afterwards and decide
  whether it may go through. They are the ones putting the license at risk.
  This is not a framing device and not a UK stamp. */

import { ABSENT_DBS, openDbs, type DbsField, type DbsLevel, type DbsStatus } from "./dbs-license.ts";

const KEY = "ecca.sidecar.agent-nft.v2";
const listeners = new Set<() => void>();

export type AgentNft = {
  tokenId: string;
  principal: string;
  label: string;
  kind: "ai";
  at: number;
  status: "active" | "suspended";
  stakes: Array<{
    hopId: string;
    host: string;
    path: string;
    at: number;
    decision: "self" | "relayed" | "cleared" | "blocked";
  }>;
  dbs: DbsField;
};

type Store = { items: AgentNft[] };

const empty = (): Store => ({ items: [] });
let store: Store = empty();
let loaded = false;

function load(): Store {
  if (loaded) return store;
  loaded = true;
  if (typeof window === "undefined") {
    store = empty();
    return store;
  }
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) || "null") as Store | null;
    store = parsed && Array.isArray(parsed.items)
      ? { items: parsed.items.map((n) => ({ ...n, dbs: n.dbs || ABSENT_DBS })) }
      : empty();
  } catch {
    store = empty();
  }
  return store;
}

function persist() {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY, JSON.stringify(store));
}

function emit() {
  listeners.forEach((fn) => fn());
}

export function subscribeLicenses(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function listLicenses(): AgentNft[] {
  return load().items;
}

export function licenseOf(tokenId: string): AgentNft | null {
  return load().items.find((x) => x.tokenId === tokenId) || null;
}

export function licensesFor(principal: string): AgentNft[] {
  const p = principal.trim().toLowerCase();
  return load().items.filter((x) => x.principal.toLowerCase() === p);
}

export function resetLicenses() {
  store = empty();
  loaded = true;
  persist();
  emit();
}

function tokenIdFor(principal: string, at: number) {
  const raw = `${principal.toLowerCase()}:${at}:${Math.random().toString(16).slice(2)}`;
  let h = 0;
  for (let i = 0; i < raw.length; i++) h = (h * 33 + raw.charCodeAt(i)) >>> 0;
  return `0x${h.toString(16).padStart(8, "0")}${at.toString(16).slice(-8).padStart(8, "0")}`;
}

export function mintAgentNft(input: { principal: string; label?: string }): AgentNft {
  const principal = String(input.principal || "").trim();
  if (!/^0x[0-9a-fA-F]{40}$/.test(principal)) {
    throw new Error("A license holder has to mint from a 0x address.");
  }
  load();
  const nft: AgentNft = {
    tokenId: tokenIdFor(principal, Date.now()),
    principal,
    label: String(input.label || "agent").trim() || "agent",
    kind: "ai",
    at: Date.now(),
    status: "active",
    stakes: [],
    dbs: ABSENT_DBS,
  };
  store.items = [nft, ...store.items].slice(0, 40);
  persist();
  emit();
  return nft;
}

export function stakeLicense(
  tokenId: string,
  hop: { hopId: string; host: string; path: string; decision: AgentNft["stakes"][number]["decision"] },
): AgentNft {
  load();
  const nft = store.items.find((x) => x.tokenId === tokenId);
  if (!nft) throw new Error("No such agent NFT.");
  if (nft.status !== "active") throw new Error("License is suspended. It cannot stake another hop.");
  nft.stakes = [{ ...hop, at: Date.now() }, ...nft.stakes].slice(0, 40);
  persist();
  emit();
  return nft;
}

export function suspendLicense(tokenId: string): AgentNft {
  load();
  const nft = store.items.find((x) => x.tokenId === tokenId);
  if (!nft) throw new Error("No such agent NFT.");
  nft.status = "suspended";
  persist();
  emit();
  return nft;
}

export function activeLicenseFor(principal: string): AgentNft | null {
  return licensesFor(principal).find((x) => x.status === "active") || null;
}

export function setLicenseDbs(
  tokenId: string,
  input: { level: DbsLevel; status: DbsStatus; seed: string },
): AgentNft {
  load();
  const nft = store.items.find((x) => x.tokenId === tokenId);
  if (!nft) throw new Error("No such agent NFT.");
  nft.dbs = openDbs(input);
  persist();
  emit();
  return nft;
}
