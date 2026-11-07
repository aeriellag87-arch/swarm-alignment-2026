/** Work queues: join and wait. Egress is research-only. Approvals dwell.
 *  Lazy images so a claim to have checked can be sampled for rework.
 *  Local party = on-prem agents, delegated, under practice cover.
 *  No-egress sandboxes get ollama/xAI tokens, SLA, structured output —
 *  including an emulation of the unfinished backend (halting / unbounded). */

import type { StudioOrder, StudioTask } from "./studio-store.ts";

export const QUEUE_STANCE =
  "Queues you join and wait on — alone, or with a local party of on-prem agents in a shared secure premises. Work is delegated from a named principal, under practice insurance, up to a coverage amount. Egress jobs are research-only and filterable. If the task does not need egress, the sandbox turns it off and blinds the agent.";

export const DWELL_STANCE =
  "Approvals are timed. A minimum dwell is occupancy. The occupancy clock is painted once every 10 seconds so a live tick cannot pollute the render and timing signal. Images lazy-load so a claim to have checked the annotation screen can be sampled as rework when the image never entered the viewport.";

export const SANDBOX_STANCE =
  "No-egress tasks get ollama or xAI Grok tokens, an SLA on response time, and a structured-format guarantee. The service is as licensed as other commonly used unbounded models — which is to say, not formally tested, because of the halting problem. An LLM can return a structurally sound result that emulates the unfinished backend: it looks like the architecture, or it reasons about what the data would do, until that server is actually coded.";

export const HEAP_STANCE =
  "A TDZ — can't access lexical declaration before initialization — is the engine refusing a read of a binding that is not live yet. On this rail it is also a watcher reading: somebody else may have already filled the heap, or it may remain filled after you are gone if you use certain tools while working. Not a proof. Not a sandbox. Declare first. Do not leave a live tick filling the isolate.";

export const TIMER_RENDER_MS = 10_000;
export const MIN_ANNOTATION_MS = 10_000;
export const MIN_REVIEW_MS = 10_000;

export type EgressFilter = "all" | "required" | "off";
export type QueueKind = "solo" | "local-party";
export type SandboxProvider = "ollama" | "grok";

export type Delegation = {
  from: string;
  premises: string;
  coverLimit: number;
  practice: boolean;
};

export type QueueJoin = {
  orderId: string;
  kind: QueueKind;
  delegation: Delegation;
  joinedAt: number;
  dwellStart: number;
};

export type ImageSample = {
  orderId: string;
  itemId: string;
  src: string;
  viewed: boolean;
  claimed: boolean;
  rework: boolean;
};

export type StructuredResult = {
  ok: true;
  emulated: boolean;
  provider: SandboxProvider;
  slaMs: number;
  schema: string;
  body: Record<string, unknown>;
  detail: string;
};

const KEY = "ecca.sidecar.job-queue.v1";
type Store = { joins: QueueJoin[]; images: ImageSample[] };
let store: Store = { joins: [], images: [] };
let loaded = false;
const listeners = new Set<() => void>();

function load(): Store {
  if (loaded) return store;
  loaded = true;
  if (typeof window === "undefined") return store;
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) || "null") as Store | null;
    if (parsed?.joins) store = parsed;
  } catch {
    store = { joins: [], images: [] };
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

export function subscribeQueue(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function getQueueStore(): Store {
  return load();
}

export type ActiveJob = {
  orderId: string;
  task: StudioTask;
  egress: boolean;
};

let active: ActiveJob | null = null;

export function setActiveJob(job: ActiveJob | null) {
  active = job;
  emit();
}

export function getActiveJob(): ActiveJob | null {
  return active;
}

export function hopAllowed(url: string): { ok: boolean; detail: string } {
  let host = "";
  try {
    host = new URL(url).hostname;
  } catch {
    return { ok: false, detail: "Refused: invalid hop, evidence EV-url." };
  }
  const local = host === "127.0.0.1" || host === "localhost";
  if (!active) {
    return { ok: true, detail: "No active job. Principal still signs unknown hops." };
  }
  if (!active.egress) {
    if (local || host === "api.x.ai") {
      return { ok: true, detail: "Blinded sandbox token: ollama or xAI Grok. SLA and structured format still apply. Not a licensed test." };
    }
    return {
      ok: false,
      detail: "Refused: sandbox egress off, evidence EV-blind. This queue is no-egress. Use ollama or a structured Grok token inside the SLA.",
    };
  }
  if (!mayEgressForTask(active.task)) {
    return { ok: false, detail: "Refused: egress is research-only, evidence EV-task." };
  }
  return { ok: true, detail: "Research egress. Principal signs the hop." };
}

export function resetQueue() {
  store = { joins: [], images: [] };
  loaded = true;
  active = null;
  persist();
  emit();
}

export function orderNeedsEgress(o: Pick<StudioOrder, "task" | "need" | "why" | "items" | "streamUrl"> & { egressRequired?: boolean }): boolean {
  if (o.egressRequired === false) return false;
  if (o.task !== "research") return false;
  if (o.egressRequired === true) return true;
  const blob = `${o.need} ${o.why} ${o.streamUrl || ""} ${o.items.map((i) => `${i.payload} ${i.prompt}`).join(" ")}`;
  return /https?:\/\//i.test(blob) || /\b(fetch|egress|crawl|scrape)\b/i.test(blob);
}

export function mayEgressForTask(task: StudioTask): boolean {
  return task === "research";
}

export function filterOrders<T extends Pick<StudioOrder, "task" | "need" | "why" | "items" | "streamUrl">>(
  orders: T[],
  filter: EgressFilter,
): T[] {
  if (filter === "all") return orders;
  return orders.filter((o) => {
    const need = orderNeedsEgress(o);
    if (filter === "required") return need && mayEgressForTask(o.task);
    return !need;
  });
}

export function dwellMet(startedAt: number, minMs: number, now = Date.now()): boolean {
  return now - startedAt >= minMs;
}

export function dwellLeft(startedAt: number, minMs: number, now = Date.now()): number {
  return Math.max(0, minMs - (now - startedAt));
}

export function joinQueue(input: {
  orderId: string;
  kind: QueueKind;
  from: string;
  premises?: string;
  coverLimit?: number;
}): QueueJoin {
  load();
  const prev = store.joins.find((j) => j.orderId === input.orderId);
  const join: QueueJoin = {
    orderId: input.orderId,
    kind: input.kind,
    delegation: {
      from: input.from.trim() || "unnamed principal",
      premises: input.premises || prev?.delegation.premises || "shared secure premises",
      coverLimit: Math.max(0, input.coverLimit ?? prev?.delegation.coverLimit ?? 100),
      practice: true,
    },
    joinedAt: prev?.joinedAt || Date.now(),
    dwellStart: prev?.dwellStart || Date.now(),
  };
  store.joins = [join, ...store.joins.filter((j) => j.orderId !== input.orderId)];
  persist();
  emit();
  return join;
}

export function joinFor(orderId: string): QueueJoin | null {
  return load().joins.find((j) => j.orderId === orderId) || null;
}

export function imageSrcs(payload: string): string[] {
  return (payload.match(/https?:\/\/\S+\.(png|jpe?g|gif|webp|svg)(\?\S*)?/gi) || []).slice(0, 8);
}

export function queueImage(orderId: string, itemId: string, src: string) {
  load();
  if (store.images.some((i) => i.orderId === orderId && i.itemId === itemId && i.src === src)) return;
  store.images = [{ orderId, itemId, src, viewed: false, claimed: false, rework: false }, ...store.images].slice(0, 80);
  persist();
  emit();
}

export function markImageViewed(orderId: string, itemId: string, src: string) {
  load();
  const existing = store.images.find((i) => i.orderId === orderId && i.itemId === itemId && i.src === src);
  if (existing) existing.viewed = true;
  else store.images = [{ orderId, itemId, src, viewed: true, claimed: false, rework: false }, ...store.images].slice(0, 80);
  persist();
  emit();
}

export function claimChecked(orderId: string, itemId: string): ImageSample[] {
  load();
  const rows = store.images.filter((i) => i.orderId === orderId && i.itemId === itemId);
  for (const r of rows) {
    r.claimed = true;
    r.rework = r.claimed && !r.viewed;
  }
  persist();
  emit();
  return rows;
}

export function reworkSample(orderId: string, itemId: string): boolean {
  return load().images.some((i) => i.orderId === orderId && i.itemId === itemId && i.rework);
}

export function sandboxFor(o: Pick<StudioOrder, "task" | "need" | "why" | "items" | "streamUrl">): {
  egress: boolean;
  provider: SandboxProvider;
  slaMs: number;
  schema: string;
} {
  const egress = orderNeedsEgress(o);
  return {
    egress,
    provider: egress ? "grok" : "ollama",
    slaMs: egress ? 8_000 : 2_500,
    schema: "ecca.work.result.v1",
  };
}

export function emulateUntilBackend(input: {
  need: string;
  provider: SandboxProvider;
  slaMs: number;
}): StructuredResult {
  return {
    ok: true,
    emulated: true,
    provider: input.provider,
    slaMs: input.slaMs,
    schema: "ecca.work.result.v1",
    body: {
      need: input.need,
      architecture: {
        queue: "join-and-wait",
        party: "solo | local-party",
        cover: "practice insurance, named limit",
        egress: "research-only, filterable",
      },
      reasoning:
        "The backend that would run this hop is not finished. This result is structurally sound and emulates what that hop would return: the data shape, the known responses, the SLA window. Halting is undecidable; unbounded model output is not a licensed test. Commonly used anyway.",
    },
    detail: `${input.provider} structured result inside ${input.slaMs}ms SLA. Emulated until the server is coded.`,
  };
}

export function mayApproveAnnotation(input: {
  dwellStart: number;
  now?: number;
  itemId: string;
  orderId: string;
}): { ok: boolean; detail: string; rework: boolean } {
  const now = input.now ?? Date.now();
  if (!dwellMet(input.dwellStart, MIN_ANNOTATION_MS, now)) {
    const left = Math.ceil(dwellLeft(input.dwellStart, MIN_ANNOTATION_MS, now) / 1000);
    return { ok: false, rework: false, detail: `Minimum dwell ${Math.round(MIN_ANNOTATION_MS / 1000)}s. ${left}s left.` };
  }
  const samples = claimChecked(input.orderId, input.itemId);
  const rework = samples.some((s) => s.rework);
  return {
    ok: true,
    rework,
    detail: rework
      ? "Claimed checked without the image entering the viewport. Sampled for rework / extra time."
      : "Dwell met. Images that loaded were in view.",
  };
}
