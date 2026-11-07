/** No-fault residual to the enrolled person.

  Occupancy paid to the person who sat it does not need a proxy lease: sitting
  is the consent. Paying anyone else "on their behalf" is held, then
  automatically disputed and revoked unless that person tops the lease up on a
  cadence. Opening a proxy lease takes multiple distinct independent parties,
  spaced. One sitting with counsel is not a lease. The payer, the proxy, a
  solicitor, and the programme sponsor do not count as independent.

  Visibility is not enough. A credit the occupant cannot see is a bypass.
  A credit they can see but did not keep consenting to is disputed.

  Not legal advice. Not medical advice. Not an admission of fault. No PHI. */

export const CONSENT_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const MIN_INDEPENDENT = 2;
export const MIN_ATTEST_SPACING_MS = 12 * 60 * 60 * 1000;
export const COERCION_WINDOW_MS = 4 * 60 * 60 * 1000;
export const DISPUTE_GRACE_MS = 24 * 60 * 60 * 1000;

export const PARTY_ROLES = [
  "occupant",
  "payee",
  "payer",
  "solicitor",
  "sponsor",
  "programme",
  "attestor",
] as const;
export type PartyRole = (typeof PARTY_ROLES)[number];

export const BLOCKED_ATTEST_ROLES = new Set<PartyRole>([
  "solicitor",
  "sponsor",
  "programme",
  "payer",
  "payee",
]);

export const CLEAN_LABELS = ["occupancy", "no-fault", "without-prejudice", "enrolled-programme"] as const;

export type Party = { id: string; role: PartyRole; bucket?: string };

export type Attestation = { party: string; role: PartyRole; at: number };

export type ConsentLease = {
  occupant: string;
  scope: "proxy-payee" | "on-behalf";
  openedAt: number;
  expiresAt: number;
  lastTopUpAt: number;
  lastTopUpBy: string;
  attestations: Attestation[];
};

export type CreditIntent = {
  occupant: string;
  payee: string;
  payer?: string;
  onBehalfOf?: string;
  occupantConsent?: boolean;
  visibleTo?: string[];
  label?: string;
  note?: string;
  parties?: Party[];
  lease?: ConsentLease;
  now?: number;
  amount?: number;
};

export type LeaseCode =
  | "live"
  | "missing"
  | "expired"
  | "stale-topup"
  | "thin-parties"
  | "clustered"
  | "blocked-role"
  | "proxy-topup"
  | "empty-occupant";

export type CreditState = "settle" | "hold" | "dispute" | "revoke";

export type CreditCode =
  | "ok"
  | "bypass"
  | "hidden-behalf"
  | "occupant-blind"
  | "admission"
  | "implication"
  | "phi"
  | "empty-occupant"
  | "no-lease"
  | "stale-consent"
  | "clustered"
  | "thin-parties"
  | "blocked-role"
  | "proxy-topup";

export const STANCE_PAYEE =
  "Residual is paid to the enrolled person as occupancy, without prejudice and without an admission of fault. Paying a proxy on their behalf is automatically disputed unless they keep topping up consent, attested by multiple distinct parties who are not counsel, the payer, or the programme. One sitting is not a lease.";

const nowOf = (intent: { now?: number }) => intent.now ?? Date.now();

export function looksLikeAdmissionLabel(value: string): boolean {
  const v = String(value || "");
  return /\b(admission of (fault|liability|guilt|responsibility)|admits? (fault|liability|guilt)|liable for|settlement of (the )?claim|compensat(e|ion) for (injur|harm|damage)|hush money|they (took|accepted) (the )?(payment|money) so they admitted)\b/i.test(
    v,
  );
}

export function looksLikeImplicationLabel(value: string): boolean {
  const v = String(value || "");
  return /\b(implicat(e|ed|ion)|paper trail of (guilt|admission|liability)|looks like (an )?admission|so they admitted|on the record as (settling|accepting liability))\b/i.test(
    v,
  );
}

export function looksLikeTrialPhi(value: string): boolean {
  const v = String(value || "");
  if (/\b(nhs( number)?|mrn|nino|patient|phi|diagnosis|prognosis|medical record|hospital number)\b/i.test(v)) return true;
  if (/\b(nct\d{6,}|irb\s*#|rec\s*ref|protocol (id|number)|principal investigator|trial site|trial protocol)\b/i.test(v)) {
    return true;
  }
  if (/\b(ssn|private key|BEGIN [A-Z]+ PRIVATE)\b/i.test(v)) return true;
  return false;
}

export function looksLikeCleanLabel(value: string | undefined): boolean {
  const v = String(value || "occupancy")
    .trim()
    .toLowerCase();
  return (CLEAN_LABELS as readonly string[]).includes(v);
}

export function independentAttestors(parties: Party[] | undefined, occupant: string): Party[] {
  const blockedIds = new Set(
    (parties || []).filter((p) => p.id === occupant || BLOCKED_ATTEST_ROLES.has(p.role)).map((p) => p.id),
  );
  return (parties || []).filter((p) => p.role === "attestor" && p.id !== occupant && !blockedIds.has(p.id));
}

export function distinctIndependent(parties: Party[] | undefined, occupant: string): {
  ok: boolean;
  ids: string[];
  detail: string;
} {
  const attestors = independentAttestors(parties, occupant);
  const ids = [...new Set(attestors.map((p) => p.id))];
  const buckets = [...new Set(attestors.map((p) => p.bucket || p.id))];
  if (ids.length < MIN_INDEPENDENT || buckets.length < MIN_INDEPENDENT) {
    return {
      ok: false,
      ids,
      detail: `Need ${MIN_INDEPENDENT} distinct independent attestors. Payer, payee, solicitor, sponsor and programme do not count.`,
    };
  }
  return { ok: true, ids, detail: `${ids.length} independent attestors` };
}

export function clusteredSitting(attestations: Attestation[] | undefined): boolean {
  const list = [...(attestations || [])].sort((a, b) => a.at - b.at);
  const independents = list.filter((a) => a.role === "attestor");
  for (let i = 1; i < independents.length; i++) {
    if (independents[i].at - independents[i - 1].at < MIN_ATTEST_SPACING_MS) return true;
  }
  const counsel = list.filter((a) => a.role === "solicitor" || a.role === "sponsor" || a.role === "programme");
  const occupantMarks = list.filter((a) => a.role === "occupant");
  for (const c of counsel) {
    for (const o of occupantMarks) {
      if (Math.abs(c.at - o.at) < COERCION_WINDOW_MS) return true;
    }
  }
  return false;
}

export function leaseStatus(lease: ConsentLease | undefined, now: number): {
  live: boolean;
  code: LeaseCode;
  detail: string;
} {
  if (!lease) {
    return {
      live: false,
      code: "missing",
      detail: "No consent lease. Occupancy paid to the occupant does not need one. A proxy payee does.",
    };
  }
  if (!lease.occupant) {
    return { live: false, code: "empty-occupant", detail: "Lease has no occupant." };
  }
  if (lease.lastTopUpBy && lease.lastTopUpBy !== lease.occupant) {
    return {
      live: false,
      code: "proxy-topup",
      detail: "Only the enrolled person can top up consent. A proxy, solicitor, or programme topping up for them is refused.",
    };
  }
  if (clusteredSitting(lease.attestations)) {
    return {
      live: false,
      code: "clustered",
      detail: "Attestations were clustered in one sitting. Independent parties must be spaced. Counsel in the same window as a signature is not a lease.",
    };
  }
  if (lease.attestations.some((a) => BLOCKED_ATTEST_ROLES.has(a.role) && a.role !== "occupant")) {
    const blocked = lease.attestations.filter((a) => BLOCKED_ATTEST_ROLES.has(a.role));
    if (blocked.some((a) => a.role === "attestor")) {
      return { live: false, code: "blocked-role", detail: "A blocked role was used as an attestor." };
    }
  }
  const attestorIds = new Set(lease.attestations.filter((a) => a.role === "attestor").map((a) => a.party));
  if (attestorIds.size < MIN_INDEPENDENT) {
    return {
      live: false,
      code: "thin-parties",
      detail: `Need ${MIN_INDEPENDENT} distinct independent attestors. Payer, payee, solicitor, sponsor and programme do not count.`,
    };
  }
  if (now > lease.expiresAt) {
    return { live: false, code: "expired", detail: "Consent lease expired. Proxy credit is disputed, then revoked." };
  }
  if (now - lease.lastTopUpAt > CONSENT_TTL_MS) {
    return {
      live: false,
      code: "stale-topup",
      detail: "Occupant has not topped up consent inside the window. Proxy credit is automatically disputed.",
    };
  }
  return { live: true, code: "live", detail: "Lease is live. Occupant has topped up inside the window." };
}

export function openLease(input: {
  occupant: string;
  parties: Party[];
  attestations: Attestation[];
  now?: number;
  ttlMs?: number;
}): { ok: true; lease: ConsentLease } | { ok: false; code: LeaseCode; detail: string } {
  const now = input.now ?? Date.now();
  const occupant = String(input.occupant || "").trim();
  if (!occupant) return { ok: false, code: "empty-occupant", detail: "Occupant identity required." };
  const blockedFromMarks = new Set(
    input.attestations.filter((a) => BLOCKED_ATTEST_ROLES.has(a.role)).map((a) => a.party),
  );
  const parties = input.parties.map((p) =>
    blockedFromMarks.has(p.id) && p.role === "attestor" ? { ...p, role: "solicitor" as const } : p,
  );
  const distinct = distinctIndependent(parties, occupant);
  if (!distinct.ok) return { ok: false, code: "thin-parties", detail: distinct.detail };
  if (clusteredSitting(input.attestations)) {
    return {
      ok: false,
      code: "clustered",
      detail: "Attestations were clustered in one sitting. Independent parties must be spaced.",
    };
  }
  if (input.attestations.some((a) => BLOCKED_ATTEST_ROLES.has(a.role) && a.role === "attestor")) {
    return { ok: false, code: "blocked-role", detail: "Solicitor, sponsor, payer and programme cannot attest." };
  }
  const ttl = input.ttlMs ?? CONSENT_TTL_MS;
  return {
    ok: true,
    lease: {
      occupant,
      scope: "proxy-payee",
      openedAt: now,
      expiresAt: now + ttl,
      lastTopUpAt: now,
      lastTopUpBy: occupant,
      attestations: input.attestations,
    },
  };
}

export function topUpLease(
  lease: ConsentLease,
  actor: string,
  at?: number,
): { ok: true; lease: ConsentLease } | { ok: false; code: LeaseCode; detail: string } {
  if (actor !== lease.occupant) {
    return {
      ok: false,
      code: "proxy-topup",
      detail: "Only the enrolled person can top up consent. Someone else doing it for them is the bypass.",
    };
  }
  const now = at ?? Date.now();
  return {
    ok: true,
    lease: {
      ...lease,
      lastTopUpAt: now,
      lastTopUpBy: actor,
      expiresAt: now + CONSENT_TTL_MS,
    },
  };
}

function labelProblems(intent: CreditIntent): { code: CreditCode; detail: string } | null {
  const blob = `${intent.label || ""} ${intent.note || ""}`;
  if (looksLikeTrialPhi(blob)) {
    return {
      code: "phi",
      detail: "No trial protocol, condition, hospital, or investigator on this rail. Occupancy residual only.",
    };
  }
  if (looksLikeAdmissionLabel(blob)) {
    return {
      code: "admission",
      detail: "This residual is without prejudice. A label that reads as an admission of fault is refused.",
    };
  }
  if (looksLikeImplicationLabel(blob)) {
    return {
      code: "implication",
      detail: "A payment framed to implicate the enrolled person is refused.",
    };
  }
  if (intent.label && !looksLikeCleanLabel(intent.label)) {
    return {
      code: "admission",
      detail: "Use occupancy, no-fault, without-prejudice, or enrolled-programme. Other labels are refused.",
    };
  }
  return null;
}

export function creditDisposition(intent: CreditIntent): {
  ok: boolean;
  state: CreditState;
  code: CreditCode;
  detail: string;
  payee: string;
} {
  const occupant = String(intent.occupant || "").trim();
  const payee = String(intent.payee || "").trim();
  const onBehalf = String(intent.onBehalfOf || occupant).trim();
  const now = nowOf(intent);
  const visible = new Set((intent.visibleTo || []).map(String));
  if (payee) visible.add(payee);

  if (!occupant) {
    return { ok: false, state: "dispute", code: "empty-occupant", detail: "Enrolled person is missing.", payee };
  }
  const bad = labelProblems(intent);
  if (bad) return { ok: false, state: "dispute", code: bad.code, detail: bad.detail, payee };

  if (intent.onBehalfOf && !visible.has(onBehalf)) {
    return {
      ok: false,
      state: "dispute",
      code: "hidden-behalf",
      detail: "Someone else was paid on their behalf without it being visible to them. Refused.",
      payee,
    };
  }
  if (!visible.has(occupant)) {
    return {
      ok: false,
      state: "dispute",
      code: "occupant-blind",
      detail: "A credit attributed to someone must be visible to them. Hidden residual is a bypass.",
      payee,
    };
  }

  const toOccupant = payee === occupant && onBehalf === occupant;
  if (toOccupant) {
    return {
      ok: true,
      state: "settle",
      code: "ok",
      detail: "Occupancy residual paid to the enrolled person. Sitting is the consent. Not an admission of fault.",
      payee,
    };
  }

  const lease = leaseStatus(intent.lease, now);
  if (!lease.live) {
    const revoke =
      lease.code === "expired" || lease.code === "stale-topup"
        ? now - (intent.lease?.expiresAt || intent.lease?.lastTopUpAt || now) > DISPUTE_GRACE_MS
        : false;
    const code: CreditCode =
      lease.code === "clustered"
        ? "clustered"
        : lease.code === "thin-parties"
          ? "thin-parties"
          : lease.code === "blocked-role"
            ? "blocked-role"
            : lease.code === "proxy-topup"
              ? "proxy-topup"
              : lease.code === "missing"
                ? "no-lease"
                : "stale-consent";
    return {
      ok: false,
      state: revoke ? "revoke" : "dispute",
      code,
      detail: `${lease.detail} Proxy credit is automatically ${revoke ? "revoked back to the enrolled person" : "disputed"}.`,
      payee: revoke ? occupant : payee,
    };
  }

  if (intent.occupantConsent === false) {
    return {
      ok: false,
      state: "dispute",
      code: "bypass",
      detail: "Occupant has not consented to a proxy payee. Credit stays with them.",
      payee: occupant,
    };
  }

  return {
    ok: true,
    state: "hold",
    code: "ok",
    detail: "Proxy payee is held, not settled. It auto-disputes unless the enrolled person keeps topping up consent.",
    payee,
  };
}

export function payeeAllowed(intent: CreditIntent) {
  const d = creditDisposition(intent);
  return { ok: d.ok, code: d.code, state: d.state, detail: d.detail };
}
