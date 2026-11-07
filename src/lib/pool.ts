/** Constant-product work pair: ReT against one liquid quote.

    While the order is open, funders add ETH / WETH / USDC / USDT against a
    fixed ReT reserve. Implied price rises as liquid piles in — that is the
    spike. When the work is done, LPs withdraw their share of quote *and* ReT.
    The person who created a good task keeps a reserved bounty, not an LP share.
    Funders deal as named principals (market makers), not as brokers. */

import { discloseCapacity } from "./market-maker.ts";

export const QUOTES = ["ETH", "WETH", "USDC", "USDT"] as const;
export type QuoteAsset = (typeof QUOTES)[number];

export type LpPosition = {
  actor: string;
  quoteAdded: number;
  shares: number;
  at: number;
};

export type WorkPool = {
  quote: QuoteAsset;
  retReserve: number;
  quoteReserve: number;
  k: number;
  totalShares: number;
  lp: LpPosition[];
  creator: string;
  creatorBountyReT: number;
  closed: boolean;
};

const round = (n: number) => Math.round(n * 1e8) / 1e8;

export function isQuote(v: string): v is QuoteAsset {
  return (QUOTES as readonly string[]).includes(v.toUpperCase());
}

export function parseQuote(v: string | null | undefined, fallback: QuoteAsset = "USDC"): QuoteAsset {
  const u = String(v || "").trim().toUpperCase();
  return isQuote(u) ? u : fallback;
}

export function emptyPool(input: {
  quote?: QuoteAsset | string;
  ret: number;
  creator: string;
  creatorBountyReT?: number;
}): WorkPool {
  const ret = Math.max(0, round(Number(input.ret) || 0));
  const bounty =
    input.creatorBountyReT != null
      ? Math.max(0, round(Number(input.creatorBountyReT) || 0))
      : round(Math.max(0.2, ret * 0.1));
  return {
    quote: parseQuote(input.quote),
    retReserve: ret,
    quoteReserve: 0,
    k: 0,
    totalShares: 0,
    lp: [],
    creator: input.creator || "cohort",
    creatorBountyReT: Math.min(bounty, ret),
    closed: false,
  };
}

/** Quote per ReT. Null until some liquid is in. */
export function spot(p: WorkPool): number | null {
  if (p.retReserve <= 0 || p.quoteReserve <= 0) return null;
  return round(p.quoteReserve / p.retReserve);
}

export function describePair(p: WorkPool): string {
  const s = spot(p);
  if (s == null) return `ReT/${p.quote} · awaiting liquid`;
  return `ReT/${p.quote} · ${s} ${p.quote}/ReT · depth ${p.quoteReserve} ${p.quote}`;
}

export function addQuote(
  p: WorkPool,
  actor: string,
  amount: number,
  at = Date.now(),
): { pool: WorkPool; minted: number; spot: number | null } {
  if (p.closed) throw new Error("pool closed — withdraw instead");
  const named = discloseCapacity(actor);
  if (!named.ok) throw new Error(named.detail);
  const amt = round(Number(amount) || 0);
  if (!(amt > 0)) throw new Error("amount must be positive");
  const next: WorkPool = {
    ...p,
    lp: p.lp.map((x) => ({ ...x })),
  };
  const minted =
    next.totalShares === 0 || next.quoteReserve === 0
      ? amt
      : round((amt / next.quoteReserve) * next.totalShares);
  next.quoteReserve = round(next.quoteReserve + amt);
  next.totalShares = round(next.totalShares + minted);
  next.k = round(next.retReserve * next.quoteReserve);
  const who = named.actor;
  const existing = next.lp.find((x) => x.actor === who);
  if (existing) {
    existing.quoteAdded = round(existing.quoteAdded + amt);
    existing.shares = round(existing.shares + minted);
    existing.at = at;
  } else {
    next.lp.push({ actor: who, quoteAdded: amt, shares: minted, at });
  }
  return { pool: next, minted, spot: spot(next) };
}

export function closePool(p: WorkPool): WorkPool {
  return { ...p, closed: true, lp: p.lp.map((x) => ({ ...x })) };
}

/** After close, LP takes proportional quote + ReT. Creator bounty stays reserved. */
export function withdraw(
  p: WorkPool,
  actor: string,
): { pool: WorkPool; quoteOut: number; retOut: number } {
  if (!p.closed) throw new Error("work still open");
  const who = actor.trim() || "anon";
  const pos = p.lp.find((x) => x.actor === who && x.shares > 0);
  if (!pos || p.totalShares <= 0) throw new Error("no position");
  const fraction = pos.shares / p.totalShares;
  const distributableRet = Math.max(0, p.retReserve - p.creatorBountyReT);
  const quoteOut = round(p.quoteReserve * fraction);
  const retOut = round(distributableRet * fraction);
  const next: WorkPool = {
    ...p,
    quoteReserve: round(p.quoteReserve - quoteOut),
    retReserve: round(p.retReserve - retOut),
    totalShares: round(p.totalShares - pos.shares),
    lp: p.lp.map((x) => (x.actor === who ? { ...x, shares: 0, quoteAdded: 0 } : { ...x })),
  };
  next.k = round(next.retReserve * next.quoteReserve);
  return { pool: next, quoteOut, retOut };
}

export function creatorPayout(p: WorkPool): number {
  return p.closed ? p.creatorBountyReT : 0;
}

export function positionOf(p: WorkPool, actor: string): LpPosition | null {
  return p.lp.find((x) => x.actor === actor && x.shares > 0) || null;
}

/** How hard the implied ReT price has moved since the first drop of liquid. */
export function spike(p: WorkPool): { spot: number | null; k: number; lps: number; quote: number } {
  return { spot: spot(p), k: p.k, lps: p.lp.filter((x) => x.shares > 0).length, quote: p.quoteReserve };
}
