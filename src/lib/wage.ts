/** Going-rate residual. Not a bank, not insurance, not a broker, not advice.

    People claim value locked up elsewhere by pairing IP with a cohort.
    Residual for that pairing can be cash, an illiquid claim that cannot be
    traded freely, or attested time spent choosing what to watch and what not to watch.
    A swarm of agent copies cannot set that residual tiny, and cannot lock
    the original contributor out in perpetuity. */

export const WAGE_COUNTRIES = ["GB", "US", "EU", "AU", "IN"] as const;
export type WageCountry = (typeof WAGE_COUNTRIES)[number];

export const OCCUPATIONS = ["research", "review", "label", "security"] as const;
export type Occupation = (typeof OCCUPATIONS)[number];

export const RESIDUAL_KINDS = ["occupancy", "illiquid", "quote"] as const;
export type ResidualKind = (typeof RESIDUAL_KINDS)[number];

export type Residual = {
  kind: ResidualKind;
  /** Hours for occupancy; face units for illiquid / quote. */
  amount: number;
};

/** Illustrative full-time going rates for similar work, local currency / year.
 *  Not a quote. Not a salary offer. Used only as a floor band. */
export const FTE_ANNUAL: Record<WageCountry, Record<Occupation, number>> = {
  GB: { research: 48_000, review: 56_000, label: 38_000, security: 72_000 },
  US: { research: 90_000, review: 105_000, label: 68_000, security: 135_000 },
  EU: { research: 52_000, review: 60_000, label: 40_000, security: 78_000 },
  AU: { research: 95_000, review: 110_000, label: 75_000, security: 140_000 },
  IN: { research: 1_200_000, review: 1_500_000, label: 900_000, security: 2_200_000 },
};

export const CURRENCY: Record<WageCountry, string> = {
  GB: "GBP",
  US: "USD",
  EU: "EUR",
  AU: "AUD",
  IN: "INR",
};

/** Illustrative USD per local unit. Named so nobody treats it as a live FX quote. */
export const ILLUSTRATIVE_USD: Record<WageCountry, number> = {
  GB: 1.27,
  US: 1,
  EU: 1.08,
  AU: 0.66,
  IN: 0.012,
};

export const FTE_HOURS = 1950;
/** Cash / illiquid residual must be at least this share of similar-work FTE hourly. */
export const FLOOR_PCT = 0.6;
/** Agent bids cannot exceed this share of the human residual. */
export const AGENT_CAP = 0.4;
/** Statutory / lower-band ceilings — similar-work floors sit strictly above these. */
export const LOWER_BAND_ANNUAL: Record<WageCountry, number> = {
  GB: 12_570,
  US: 15_080,
  EU: 14_000,
  AU: 23_000,
  IN: 300_000,
};
export const MIN_WAGE_HOURLY: Record<WageCountry, number> = {
  GB: 12.21,
  US: 7.25,
  EU: 12.0,
  AU: 24.1,
  IN: 50,
};

export const STANCE =
  "Not a regulated bank, not a regulated insurance provider, not a licensed broker. Nothing here is investment advice.";

export const STANCE_DETAIL =
  "People claim value locked up elsewhere by pairing intellectual property with a cohort. Residual for that pairing can be cash, assets that cannot be traded freely, or attested time spent choosing what to watch and what not to watch. Contents of that choice are not revealed to the cohort unless medical cover names the event — a PII/PHI breach is one. It is not a race of a thousand agents copying the work, setting the rate tiny, and locking the original out in perpetuity. Residual is paid to the enrolled person, without prejudice; a proxy on their behalf auto-disputes unless they keep topping up consent.";

const round = (n: number, d = 2) => {
  const p = 10 ** d;
  return Math.round(n * p) / p;
};

export function isCountry(v: string | null | undefined): v is WageCountry {
  return (WAGE_COUNTRIES as readonly string[]).includes(String(v || "").toUpperCase());
}

export function parseCountry(v: string | null | undefined, fallback: WageCountry = "GB"): WageCountry {
  const u = String(v || "").trim().toUpperCase();
  return isCountry(u) ? u : fallback;
}

export function occupationForTask(task: string | null | undefined): Occupation {
  const t = String(task || "").toLowerCase();
  if (t === "review" || t === "meta" || t === "cal") return "review";
  if (t === "label" || t === "colour") return "label";
  if (t === "security" || t === "ioc" || t === "probe" || t === "pref" || t === "process") return "security";
  if (t === "blind" || t === "parity") return "security";
  return "research";
}

export function residualKindForTask(task: string | null | undefined): ResidualKind {
  const t = String(task || "").toLowerCase();
  if (t === "watch" || t === "ab" || t === "optimise" || t === "blind" || t === "parity" || t === "security" || t === "stalemate" || t === "pref" || t === "between" || t === "wrong" || t === "process" || t === "journey" || t === "colour" || t === "meta" || t === "cal") return "occupancy";
  return "illiquid";
}

/** Blind / parity is specialist security work: miss still pays, cannot be agent-copied. Full similar-work FTE, then this lift. */
export const BLIND_PREMIUM = 1.35;

export function taskPremium(task: string | null | undefined): number {
  const t = String(task || "").toLowerCase();
  if (t === "blind" || t === "parity") return BLIND_PREMIUM;
  return 1;
}

export function fteHourlyLocal(country: WageCountry, occ: Occupation) {
  return round(FTE_ANNUAL[country][occ] / FTE_HOURS);
}

export function fteHourlyUsd(country: WageCountry, occ: Occupation) {
  return round(fteHourlyLocal(country, occ) * ILLUSTRATIVE_USD[country]);
}

export function floorHourlyLocal(country: WageCountry, occ: Occupation) {
  const similar = fteHourlyLocal(country, occ) * FLOOR_PCT;
  const aboveMin = MIN_WAGE_HOURLY[country] * 1.25;
  const aboveBand = LOWER_BAND_ANNUAL[country] / FTE_HOURS;
  return round(Math.max(similar, aboveMin, aboveBand * 1.15));
}

export function floorHourlyUsd(country: WageCountry, occ: Occupation) {
  return round(floorHourlyLocal(country, occ) * ILLUSTRATIVE_USD[country]);
}

export function looksLikeLowerBracket(annualLocal: number, country: WageCountry) {
  return annualLocal <= LOWER_BAND_ANNUAL[country] * 1.05;
}

/** Occupancy residual is valued at the similar-work going rate, not a gig discount. */
export function occupancyHourUsd(country: WageCountry, occ: Occupation) {
  return fteHourlyUsd(country, occ);
}

export function residualValueUsd(
  residual: Residual,
  country: WageCountry,
  occ: Occupation,
): number {
  if (residual.kind === "occupancy") return round(residual.amount * occupancyHourUsd(country, occ));
  return round(Math.max(0, residual.amount));
}

export function meetsFloor(
  residual: Residual,
  country: WageCountry,
  occ: Occupation,
  hours = 1,
): { ok: boolean; paidUsd: number; floorUsd: number; reason: string } {
  const h = Math.max(hours, residual.kind === "occupancy" ? residual.amount || 1 : 1);
  const paidUsd =
    residual.kind === "occupancy"
      ? residualValueUsd(residual, country, occ)
      : residualValueUsd(residual, country, occ);
  const perHour =
    residual.kind === "occupancy"
      ? occupancyHourUsd(country, occ)
      : paidUsd / h;
  const floorUsd = floorHourlyUsd(country, occ) * (residual.kind === "occupancy" ? residual.amount || 1 : h);
  const annualised = (perHour / ILLUSTRATIVE_USD[country]) * FTE_HOURS;
  if (looksLikeLowerBracket(annualised, country)) {
    return {
      ok: false,
      paidUsd,
      floorUsd,
      reason: "Rate sits in the lower tax / minimum-wage band. Residual has to track similar full-time work in this country, not the lower bracket.",
    };
  }
  if (perHour + 1e-6 < floorHourlyUsd(country, occ) && residual.kind !== "occupancy") {
    return {
      ok: false,
      paidUsd,
      floorUsd,
      reason: `Below ${Math.round(FLOOR_PCT * 100)}% of similar full-time work in ${country}.`,
    };
  }
  if (residual.kind === "occupancy" && residual.amount <= 0) {
    return { ok: false, paidUsd: 0, floorUsd, reason: "Occupancy residual needs an attested hour." };
  }
  return { ok: true, paidUsd, floorUsd, reason: "" };
}

/** Human residual is independent of how many agents copied the work. */
export function againstAgentCopies(input: {
  humanRate: number;
  agentRate: number;
  copyCount: number;
  country: WageCountry;
  occupation: Occupation;
  loadRunning?: boolean;
}): {
  humanRate: number;
  agentRate: number;
  copies: number;
  perpetual: boolean;
  reason: string;
} {
  const floor = floorHourlyUsd(input.country, input.occupation);
  const humanRate = round(Math.max(Number(input.humanRate) || 0, floor), 1);
  const agentRate = round(Math.min(Math.max(0, Number(input.agentRate) || 0), humanRate * AGENT_CAP), 1);
  const copies = Math.max(0, Math.floor(Number(input.copyCount) || 0));
  const perpetual = input.loadRunning !== false;
  return {
    humanRate,
    agentRate,
    copies,
    perpetual,
    reason:
      copies > 1
        ? `${copies} agent copies cannot pull the human residual below ${humanRate}. While the replica runs, residual continues.`
        : `Human residual stays on the going-rate floor. Agent bids cap at ${Math.round(AGENT_CAP * 100)}%.`,
  };
}

export function liftToFloor(
  humanRate: number,
  agentRate: number,
  country: WageCountry,
  occupation: Occupation,
) {
  return againstAgentCopies({ humanRate, agentRate, copyCount: 0, country, occupation });
}

export function humanRateFor(country: WageCountry, occupation: Occupation) {
  return round(floorHourlyUsd(country, occupation), 1);
}

export function sessionHoursFor(task: string | null | undefined): number {
  return String(task || "").toLowerCase() === "stalemate" ? 20 / 60 : 1;
}

/** Occupancy tasks pay the going similar-work hour, not the 60% cash floor. Blind/parity add the specialist lift. */
export function humanRateForTask(country: WageCountry, task: string) {
  const occ = occupationForTask(task);
  const kind = residualKindForTask(task);
  const base = kind === "occupancy" ? occupancyHourUsd(country, occ) : humanRateFor(country, occ);
  return round(base * taskPremium(task) * sessionHoursFor(task), 1);
}

export function agentRateFor(humanRate: number) {
  return round(Math.max(0.1, humanRate * AGENT_CAP), 1);
}

export function describeResidual(kind: ResidualKind) {
  if (kind === "occupancy") return "attested time choosing what to watch and what not to watch";
  if (kind === "illiquid") return "locked claim that cannot be traded freely";
  return "cash / liquid quote";
}

export function describeComparator(country: WageCountry, occ: Occupation) {
  const fte = FTE_ANNUAL[country][occ];
  const cur = CURRENCY[country];
  const hourly = fteHourlyLocal(country, occ);
  const floor = floorHourlyLocal(country, occ);
  return {
    country,
    occupation: occ,
    currency: cur,
    fteAnnual: fte,
    fteHourly: hourly,
    floorHourly: floor,
    floorPct: FLOOR_PCT,
    source: "independent-similar" as const,
    label: `${country} ${occ} · ${cur} ${fte.toLocaleString()} FTE · floor ${Math.round(FLOOR_PCT * 100)}% = ${cur} ${floor}/h`,
  };
}

/** Going-rate comparator must be independent similar work — not a shop the
 *  principal maintains, not one they can squeeze, and not a visa-place quote
 *  that was funded, defunded, moved, or rotated to deflate the number. */
export type VisaPlaceShape = {
  funded?: boolean;
  defunded?: boolean;
  moved?: boolean;
  rotated?: boolean;
};

export type ComparatorFirm = {
  name?: string;
  principal?: string;
  maintainedByPrincipal?: boolean;
  principalExposure?: boolean;
  relatedParty?: boolean;
  sameBucketAsPrincipal?: boolean;
  visaPlaces?: VisaPlaceShape | null;
  quotedHourlyLocal?: number;
};

export type ComparatorCode =
  | "independent"
  | "captive"
  | "principal-maintained"
  | "earnings-influence"
  | "related-party"
  | "visa-place-distorted";

function sameParty(a?: string, b?: string) {
  const x = String(a || "").trim().toLowerCase();
  const y = String(b || "").trim().toLowerCase();
  return Boolean(x && y && x === y);
}

export function visaPlacesDistorted(v?: VisaPlaceShape | null): boolean {
  if (!v) return false;
  return Boolean(v.funded || v.defunded || v.moved || v.rotated);
}

export function comparatorIndependent(firm?: ComparatorFirm | null): {
  ok: boolean;
  code: ComparatorCode;
  detail: string;
} {
  if (visaPlacesDistorted(firm?.visaPlaces)) {
    return {
      ok: false,
      code: "visa-place-distorted",
      detail: "Visa places were funded, defunded, moved, or rotated to deflate the quoted wage. Floor stays on independent similar work. The gap is an offset, not a new going rate.",
    };
  }
  if (!firm || (!firm.name && !firm.principal && !firm.maintainedByPrincipal && !firm.principalExposure && !firm.relatedParty)) {
    return {
      ok: true,
      code: "independent",
      detail: "Country and occupation going rate. Not a named company's payroll, not a shop the principal can limit, and not a gamed visa quote.",
    };
  }
  if (firm.maintainedByPrincipal || sameParty(firm.name, firm.principal)) {
    return {
      ok: false,
      code: "principal-maintained",
      detail: "Comparator is a company the principal maintains. Residual floor uses independent similar work, not that payroll.",
    };
  }
  if (firm.principalExposure) {
    return {
      ok: false,
      code: "earnings-influence",
      detail: "Principal has exposure or influence to affect or limit earnings at that firm. It cannot set the going rate.",
    };
  }
  if (firm.relatedParty || firm.sameBucketAsPrincipal) {
    return {
      ok: false,
      code: "related-party",
      detail: "Related-party or same-bucket firm. Captive comparators are refused.",
    };
  }
  return {
    ok: true,
    code: "independent",
    detail: "Named firm is treated as independent similar work only if the principal cannot maintain it or limit its earnings, and visa places are not being rotated to set the quote.",
  };
}

export function offsetDistortedQuote(
  country: WageCountry,
  occ: Occupation,
  quotedHourlyLocal: number,
  visaPlaces?: VisaPlaceShape | null,
) {
  const floor = floorHourlyLocal(country, occ);
  const quoted = Math.max(0, Number(quotedHourlyLocal) || 0);
  const distorted = visaPlacesDistorted(visaPlaces) || quoted + 1e-6 < floor;
  const offset = distorted ? round(Math.max(0, floor - quoted)) : 0;
  return { floor, quoted, offset, distorted };
}

export function comparableRate(country: WageCountry, occ: Occupation, firm?: ComparatorFirm | null) {
  const check = comparatorIndependent(firm);
  const cmp = describeComparator(country, occ);
  const quoted = firm?.quotedHourlyLocal;
  const gap =
    quoted != null
      ? offsetDistortedQuote(country, occ, quoted, firm?.visaPlaces)
      : { floor: cmp.floorHourly, quoted: null as number | null, offset: 0, distorted: visaPlacesDistorted(firm?.visaPlaces) };
  return {
    ...cmp,
    check,
    offset: gap.offset,
    distorted: gap.distorted || !check.ok,
    quotedHourlyLocal: quoted ?? null,
  };
}
