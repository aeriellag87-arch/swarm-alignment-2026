/** DBS status on a licence: verifiable, as words.

  Not a DBS, AccessNI or Disclosure Scotland product. The certificate
  number stays off the licence. What sits in the conditions field is
  English: level, live-or-not, and two time-based join keys so a
  verifier can meet the record without the number. The second pointer
  is the next window — you can still join after the first words rotate. */

export const DBS_STANCE =
  "DBS status on this licence is verifiable and written as words. Not a DBS product. The certificate number is not stored. Join keys rotate with time; a second pointer is the next window so the first expiry is not a trap.";

export const WINDOW_MS = 4 * 60 * 60 * 1000;

export const DBS_LEVELS = ["none", "basic", "standard", "enhanced", "enhanced-barred"] as const;
export type DbsLevel = (typeof DBS_LEVELS)[number];

export const DBS_STATUSES = ["absent", "pending", "live", "expired", "withdrawn", "disputed"] as const;
export type DbsStatus = (typeof DBS_STATUSES)[number];

const LEVEL_WORDS: Record<DbsLevel, string> = {
  none: "no disclosure level",
  basic: "basic disclosure",
  standard: "standard disclosure",
  enhanced: "enhanced disclosure",
  "enhanced-barred": "enhanced disclosure with barred lists",
};

const STATUS_WORDS: Record<DbsStatus, string> = {
  absent: "no disclosure on this licence",
  pending: "a check has been asked for and is not yet live",
  live: "a live disclosure, time-bound",
  expired: "the disclosure window has closed",
  withdrawn: "the disclosure was withdrawn",
  disputed: "the occupant disputes the record; occupancy still pays",
};

const TOD = ["dawn", "morning", "noon", "afternoon", "dusk", "evening", "night", "midnight"] as const;
const ORD = ["first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth"] as const;
const COLOUR = ["amber", "willow", "slate", "copper", "ivory", "indigo", "umber", "pearl"] as const;
const GATE = ["gate", "quay", "well", "arch", "stile", "porch", "bridge", "hearth"] as const;

export type DbsField = {
  status: DbsStatus;
  level: DbsLevel;
  conditions: string;
  join: string;
  nextJoin: string;
  windowStart: number;
  windowMs: number;
};

export const ABSENT_DBS: DbsField = {
  status: "absent",
  level: "none",
  conditions: "no disclosure on this licence; no regulated activity; occupancy still pays",
  join: "",
  nextJoin: "",
  windowStart: 0,
  windowMs: WINDOW_MS,
};

function mix(seed: string, at: number): number {
  const raw = `${seed}:${Math.floor(at / WINDOW_MS)}`;
  let h = 2166136261;
  for (let i = 0; i < raw.length; i++) h = Math.imul(h ^ raw.charCodeAt(i), 16777619);
  return h >>> 0;
}

export function joinWords(seed: string, at: number): string {
  const h = mix(String(seed || ""), at);
  const tod = TOD[h % TOD.length];
  const ord = ORD[(h >>> 8) % ORD.length];
  const colour = COLOUR[(h >>> 16) % COLOUR.length];
  const gate = GATE[(h >>> 24) % GATE.length];
  return `${tod} ${ord} ${colour} ${gate}`;
}

export function windowStart(at: number): number {
  return Math.floor(at / WINDOW_MS) * WINDOW_MS;
}

export function conditionsWords(input: {
  status: DbsStatus;
  level: DbsLevel;
  join: string;
  nextJoin: string;
}): string {
  const parts = [STATUS_WORDS[input.status], LEVEL_WORDS[input.level]];
  if (input.status === "live" || input.status === "pending") {
    parts.push(`join at ${input.join}`);
    parts.push(`next join ${input.nextJoin}`);
  }
  if (input.level === "none" || input.status === "absent" || input.status === "expired" || input.status === "withdrawn") {
    parts.push("no regulated activity");
  }
  parts.push("occupancy still pays");
  parts.push("certificate number not on this licence");
  return parts.join("; ");
}

export function openDbs(input: {
  level: DbsLevel;
  status: DbsStatus;
  seed: string;
  now?: number;
}): DbsField {
  const now = input.now ?? Date.now();
  const start = windowStart(now);
  const seed = String(input.seed || "").trim();
  if ((input.status === "live" || input.status === "pending") && seed.length < 8) {
    return { ...ABSENT_DBS, status: "absent", conditions: "refused: join seed too thin, evidence EV-dbs. Occupancy still pays." };
  }
  const join = seed ? joinWords(seed, start) : "";
  const nextJoin = seed ? joinWords(seed, start + WINDOW_MS) : "";
  const status = input.status;
  return {
    status,
    level: input.level,
    join,
    nextJoin,
    windowStart: start,
    windowMs: WINDOW_MS,
    conditions: conditionsWords({ status, level: input.level, join, nextJoin }),
  };
}

export function verifyDbs(field: DbsField | undefined, seed: string, now = Date.now()): {
  ok: boolean;
  detail: string;
} {
  const f = field && field.status ? field : ABSENT_DBS;
  if (f.status === "absent") {
    return { ok: true, detail: f.conditions };
  }
  if (f.status === "withdrawn" || f.status === "expired") {
    return { ok: false, detail: `${STATUS_WORDS[f.status]}. ${f.conditions}` };
  }
  if (f.status === "disputed") {
    return { ok: true, detail: `${STATUS_WORDS.disputed}. ${f.conditions}` };
  }
  const s = String(seed || "").trim();
  if (!s) return { ok: false, detail: "Refused: join seed required to verify a live disclosure, evidence EV-dbs." };
  const start = windowStart(now);
  const current = joinWords(s, start);
  const next = joinWords(s, start + WINDOW_MS);
  const prev = joinWords(s, start - WINDOW_MS);
  const hit = current === f.join || current === f.nextJoin || next === f.nextJoin || prev === f.join;
  if (!hit) {
    return { ok: false, detail: "Refused: join words do not match this window or the next, evidence EV-dbs. Occupancy still pays." };
  }
  if (now - f.windowStart > 2 * f.windowMs) {
    return { ok: false, detail: `${STATUS_WORDS.expired}. Both pointers have rotated. Occupancy still pays.` };
  }
  return { ok: true, detail: f.conditions };
}

export function mayRegulatedWork(field: DbsField | undefined): { ok: boolean; detail: string } {
  const f = field && field.status ? field : ABSENT_DBS;
  if (f.status === "live" && (f.level === "enhanced" || f.level === "enhanced-barred" || f.level === "standard")) {
    return { ok: true, detail: f.conditions };
  }
  return {
    ok: false,
    detail: `Refused: regulated activity needs a live standard or enhanced disclosure, evidence EV-dbs. ${f.conditions}`,
  };
}

export function parseLevel(v: string): DbsLevel {
  const x = String(v || "").trim().toLowerCase();
  return (DBS_LEVELS as readonly string[]).includes(x) ? (x as DbsLevel) : "none";
}

export function parseStatus(v: string): DbsStatus {
  const x = String(v || "").trim().toLowerCase();
  return (DBS_STATUSES as readonly string[]).includes(x) ? (x as DbsStatus) : "absent";
}
