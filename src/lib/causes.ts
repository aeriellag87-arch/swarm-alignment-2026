import { emptyPool, parseQuote, spot, type QuoteAsset, type WorkPool } from "./pool.ts";
import { agentRateFor, humanRateFor, liftToFloor, occupationForTask } from "./wage.ts";

/** A cause is a git-bounty DAO: manifesto, treasury pair, AI steward, human overseers. */

export type CauseStatus = "open" | "working" | "fulfilled" | "closed";

export type Cause = {
  id: string;
  title: string;
  manifesto: string;
  quote: QuoteAsset;
  steward: string;
  overseers: string[];
  origin: string;
  publicGood: boolean;
  status: CauseStatus;
  workIds: string[];
  occupancySeconds: number;
  createdAt: number;
};

export type SleeveKind = "human" | "ai" | "mining" | "memory";

export type DaoInstance = {
  id: string;
  name: string;
  origin: string;
  stack: string;
  sleeves: { kind: SleeveKind; contact: string }[];
  capabilities: string[];
  lastSeen: number;
  local: boolean;
};

export type OversightKind = "spawn" | "assign" | "split" | "bid" | "close" | "future";

export type OversightAction = {
  id: string;
  at: number;
  causeId: string;
  actor: string;
  kind: OversightKind;
  need: string;
  status: "pending" | "approved" | "rejected" | "auto";
  workId?: string;
};

export type CloudFuture = {
  id: string;
  causeId: string;
  kind: "occupancy" | "compute" | "spot";
  notional: number;
  premium: number;
  coverage: number;
  occupancySeconds: number;
};

export type BountyDraft = {
  need: string;
  why: string;
  task: "research" | "watch" | "review" | "label";
  humanRate: number;
  agentRate: number;
};

const round = (n: number) => Math.round(n * 1e8) / 1e8;

export function aiMargin(humanRate: number, agentRate: number) {
  return round(Math.max(0, Number(humanRate) - Number(agentRate)));
}

export function occupancyBoost(seconds: number) {
  return 1 + Math.min(2, Math.max(0, seconds) / 3600);
}

export function futureCover(futures: CloudFuture[]) {
  if (!futures.length) return 0;
  return Math.min(
    1.5,
    futures.reduce((a, f) => a + f.coverage / Math.max(1, f.notional), 0),
  );
}

/** Extra work per unit liquid: spot × occupancy towels × cloud/compute cover.
 *  Occupied humans cut cloud insurance; the AI spends the saved margin on more bounties. */
export function leverage(pool: WorkPool | null | undefined, occupancySeconds: number, futures: CloudFuture[]) {
  const s = pool ? spot(pool) : null;
  if (s == null || s <= 0) return 0;
  return round(s * occupancyBoost(occupancySeconds) * (1 + futureCover(futures)));
}

export function causePool(c: Cause, ret = 8): WorkPool {
  return emptyPool({
    quote: c.quote,
    ret,
    creator: c.steward,
    creatorBountyReT: round(Math.max(0.4, ret * 0.1)),
  });
}

export function draftBounties(c: Cause): BountyDraft[] {
  const title = c.title;
  const research = liftToFloor(humanRateFor("GB", "research"), 0, "GB", "research");
  const watch = liftToFloor(humanRateFor("GB", "research"), 0, "GB", "research");
  const review = liftToFloor(humanRateFor("GB", "review"), 0, "GB", "review");
  return [
    {
      task: "research",
      need: `Merge a bounty for ${title}: one cited deliverable a human can accept`,
      why: "Git-bounty shape. Human residual tracks similar full-time work, not a tiny agent copy. Residual can be occupancy or a locked claim.",
      humanRate: research.humanRate,
      agentRate: agentRateFor(research.humanRate),
    },
    {
      task: "watch",
      need: `Occupy a window so ${title} is not sitting on the shared GPU bus`,
      why: "Residual is occupancy: you decide what to watch and do. Agent copies cannot set this hour tiny. Cloud futures pay more when independent towels are down.",
      humanRate: watch.humanRate,
      agentRate: agentRateFor(watch.humanRate),
    },
    {
      task: "review",
      need: `Oversee the steward on ${title}: approve, change, or reject the last spawn`,
      why: "Humans oversee the AI. Sitting on this page is paid watch time. Rejecting still pays occupancy at the going-rate floor.",
      humanRate: review.humanRate,
      agentRate: agentRateFor(review.humanRate),
    },
  ];
}

export function parseStewardJson(text: string): BountyDraft[] {
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start < 0 || end <= start) return [];
  try {
    const raw = JSON.parse(text.slice(start, end + 1)) as Array<Partial<BountyDraft>>;
    if (!Array.isArray(raw)) return [];
    return raw
      .slice(0, 5)
      .map((d): BountyDraft => {
        const task: BountyDraft["task"] =
          d.task === "watch" || d.task === "review" || d.task === "label" ? d.task : "research";
        const lifted = liftToFloor(Number(d.humanRate) || 0, Number(d.agentRate) || 0, "GB", occupationForTask(task));
        return {
          need: String(d.need || "").slice(0, 300),
          why: String(d.why || "Steward draft. Dual rate. Occupancy still pays. Agent copies cannot collapse the human residual.").slice(0, 2000),
          task,
          humanRate: lifted.humanRate,
          agentRate: lifted.agentRate || agentRateFor(lifted.humanRate),
        };
      })
      .filter((d) => d.need.length >= 8);
  } catch {
    return [];
  }
}

export function describeFuture(f: CloudFuture) {
  const kind =
    f.kind === "occupancy" ? "occupancy (towel)" : f.kind === "compute" ? "compute" : "spot cloud";
  return `${kind} · notional ${f.notional} · cover ${f.coverage} · premium ${f.premium}`;
}

export function parseQuoteAsset(v: string | null | undefined): QuoteAsset {
  return parseQuote(v);
}
