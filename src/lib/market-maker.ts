/** Named principal on a pair.

  The person who funds quote deals as principal — a market maker on occupancy
  residual — not as a broker matching two customers in a security. That person
  is named on the card. Adequate disclosure is required. Disclosure is not a
  licence, not an EMI permission, not a payment-institution stamp, and not a
  way to skip reporting the activity actually needs.

  The Revolut rhyme: pick a box, put it on the tin, name who is in it. They
  spent years as an e-money / payment-service firm with "not a bank" on the
  tin, dealing as principal on FX. The tin had to change when the box did.
  This desk's box is principal market-maker on a residual pair. It is not a
  bank, not an EMI, not a PI, not a licensed broker. */

export const MM_CAPACITY = "principal" as const;
export type MmCapacity = typeof MM_CAPACITY;

export const MM_STANCE =
  "Whoever funds a pair deals as principal — a named market maker on occupancy residual — not as a licensed broker. Disclosure is not a licence. Not a bank, not an EMI, not a payment institution, not investment advice.";

export const MM_STANCE_DETAIL =
  "The public card names who made the market. Hidden, nominee, or on-behalf principals are refused. The card is a disclosure, not an FCA transaction report, not a prospectus, and not a payment-service permission.";

const HIDDEN =
  /^(anon(ymous)?|undisclosed|nominee|n\/a|n\.a\.|unknown|hidden|tbd|on.?behalf|for the client|street|omnibus|-)?$/i;

export function looksHiddenMaker(actor: string | null | undefined): boolean {
  const a = String(actor || "").trim();
  if (!a) return true;
  if (HIDDEN.test(a)) return true;
  if (/\b(undisclosed|nominee|on behalf of|as agent for)\b/i.test(a)) return true;
  return false;
}

export function discloseCapacity(actor: string | null | undefined): {
  ok: boolean;
  actor: string;
  capacity: MmCapacity;
  detail: string;
} {
  const a = String(actor || "").trim();
  if (looksHiddenMaker(a)) {
    return {
      ok: false,
      actor: a,
      capacity: MM_CAPACITY,
      detail: "Market maker must be named on the card. Hidden, nominee, or on-behalf principals are refused.",
    };
  }
  return {
    ok: true,
    actor: a,
    capacity: MM_CAPACITY,
    detail: `${a} deals as principal (market maker), not as a broker.`,
  };
}

export type MakerLine = { actor: string; capacity: MmCapacity; quoteAdded?: number };

export function publicMakers(lp: { actor: string; shares?: number; quoteAdded?: number }[]): MakerLine[] {
  return lp
    .filter((x) => (x.shares ?? 1) > 0 && !looksHiddenMaker(x.actor))
    .map((x) => ({ actor: x.actor, capacity: MM_CAPACITY, quoteAdded: x.quoteAdded }));
}

export function marketMakerReport(lp: { actor: string; shares?: number; quoteAdded?: number }[]): {
  ok: boolean;
  makers: MakerLine[];
  detail: string;
} {
  const hidden = lp.filter((x) => (x.shares ?? 1) > 0 && looksHiddenMaker(x.actor));
  const makers = publicMakers(lp);
  if (hidden.length) {
    return {
      ok: false,
      makers,
      detail: "A live position has no named principal. The pair cannot hide who is making the market.",
    };
  }
  if (!makers.length) {
    return { ok: true, makers, detail: "No quote yet. The first funder will be the named market maker." };
  }
  const names = makers.map((m) => m.actor).join(", ");
  return {
    ok: true,
    makers,
    detail: `Named market maker${makers.length > 1 ? "s" : ""} (principal): ${names}. Not broking a security.`,
  };
}
