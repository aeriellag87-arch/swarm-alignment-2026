/** A/B wiki copy and a cohort optimiser.
 *  Hourly occupancy, unlimited sitting, paid up to 15 hours per week.
 *  Differences highlighted. GTM-shaped tags for variants.
 *  Optimiser suggests cohort structures without naming anyone. */

export const WEEKLY_HOUR_CAP = 15;
export const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export const AB_STANCE =
  "A/B the wiki: two pages side by side, style and wording. Differences are highlighted. Tags follow a Google Tag Manager shape — container, trigger, variable, tag — so a variant is a named event, not a vibe. Hourly occupancy, sit as long as you need, paid up to 15 hours in a week.";

export const OPT_STANCE =
  "Optimiser / Power-BI-shaped work, also paid. Suggest cohort structures to look for without identifying individuals: filter, anonymise (k-anonymity), select grant criteria — that is targeting. A structure that names a person, a wallet, or a k below 5 is refused.";

export type WikiVariant = {
  id: "a" | "b";
  title: string;
  slug: string;
  wording: string;
  style: string;
};

export type DiffTok = { t: string; ch: "same" | "add" | "del" };

export type GtmRow = {
  kind: "container" | "trigger" | "variable" | "tag";
  name: string;
  value: string;
};

export type CohortFilter = {
  country: string;
  occupation: string;
  training: string;
  kMin: number;
};

export type CohortStructure = {
  label: string;
  k: number;
  criteria: string;
  identifying: boolean;
};

export function weekReset(weekStarted: number, now = Date.now()): boolean {
  return now - weekStarted >= WEEK_MS;
}

export function capHours(weekSeconds: number, addSeconds: number, capHours = WEEKLY_HOUR_CAP): {
  applied: number;
  remaining: number;
  capped: boolean;
} {
  const cap = capHours * 3600;
  const room = Math.max(0, cap - weekSeconds);
  const applied = Math.min(room, Math.max(0, addSeconds));
  return { applied, remaining: room - applied, capped: applied < addSeconds };
}

export function wordDiff(a: string, b: string): { left: DiffTok[]; right: DiffTok[] } {
  const aw = a.split(/(\s+)/);
  const bw = b.split(/(\s+)/);
  const setA = new Set(aw.filter((w) => w.trim()));
  const setB = new Set(bw.filter((w) => w.trim()));
  return {
    left: aw.map((t) => ({ t, ch: !t.trim() || setB.has(t) ? "same" : "del" })),
    right: bw.map((t) => ({ t, ch: !t.trim() || setA.has(t) ? "same" : "add" })),
  };
}

export function gtmForPair(a: WikiVariant, b: WikiVariant): GtmRow[] {
  return [
    { kind: "container", name: "GTM-WIKI-AB", value: `wiki · ${a.slug}` },
    { kind: "trigger", name: "Page View", value: `/${a.slug}/ or /${b.slug}/` },
    { kind: "variable", name: "{{Variant}}", value: "A | B" },
    { kind: "variable", name: "{{Style}}", value: `${a.style} vs ${b.style}` },
    { kind: "tag", name: "Copy / wording", value: "event: wiki_ab_wording" },
    { kind: "tag", name: "Style choice", value: "event: wiki_ab_style" },
  ];
}

const IDENTIFYING = /\b(0x[a-fA-F0-9]{12,}|[A-Z][a-z]+ [A-Z][a-z]+|ssn|passport|email)\b/;

export function isIdentifying(text: string): boolean {
  return IDENTIFYING.test(text);
}

export function anonymiseLabel(raw: string, k: number, kMin = 5): { ok: boolean; label: string; detail: string } {
  if (k < kMin) {
    return { ok: false, label: "", detail: `Refused: k=${k} below ${kMin}, evidence EV-k. Raise the filter.` };
  }
  if (isIdentifying(raw)) {
    return { ok: false, label: "", detail: "Refused: identifying, evidence EV-anon. Suggest a structure, not a person." };
  }
  return { ok: true, label: raw, detail: `k=${k}. No individual.` };
}

export function suggestStructures(filter: CohortFilter): CohortStructure[] {
  const base = [
    { label: `${filter.country} · ${filter.occupation} · ${filter.training} · grant pending`, k: 18, criteria: "training + country, no wallet" },
    { label: `${filter.occupation} · certified · occupancy ≥ 10h`, k: 9, criteria: "occupation + training floor" },
    { label: `${filter.country} · hybrid · MFA enrolled`, k: 7, criteria: "species + MFA, no name" },
    { label: `${filter.country} · named wallet 0xabc`, k: 2, criteria: "wallet" },
  ];
  return base.map((row) => {
    const check = anonymiseLabel(row.label, row.k, filter.kMin);
    return { ...row, identifying: !check.ok };
  });
}

export const DEMO_A: WikiVariant = {
  id: "a",
  title: "NATS: football-timed DDoS is a co-tenancy reading",
  slug: "nats-cotenancy",
  style: "hairline came, Spectral standfirst",
  wording:
    "If DDoSes are causing outages timed with football, the only thing that can be derived is that the path is probably sharing the same infrastructure, or they are co-tenants, or they have shared resource constraints.",
};

export const DEMO_B: WikiVariant = {
  id: "b",
  title: "NATS clocks: shared fabric, not a who",
  slug: "nats-cotenancy",
  style: "heavier relief rule, shorter lede",
  wording:
    "A DDoS outage on a football clock is a capacity reading: shared infrastructure, co-tenants, or a shared resource constraint. Not who. Not intent.",
};
