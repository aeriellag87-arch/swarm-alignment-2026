import { sha256hex } from "../featherlight/sfnt.ts";

export const PLAYFAIR_ATTESTATION_VERSION = 1 as const;

export type PlayfairTimingWindow = {
  phase: string;
  elapsedMs: number;
  events: number;
};

export type PlayfairAttestation = {
  version: typeof PLAYFAIR_ATTESTATION_VERSION;
  kind: "playfair.turn";
  turn: string;
  previous: string | null;
  queueCommitment: string;
  timings: PlayfairTimingWindow[];
  artifactHash: string;
  commitment: string;
};

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value as Record<string, unknown>)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value ?? null);
}

function digest(value: unknown): string {
  return sha256hex(new TextEncoder().encode(canonical(value)));
}

/**
 * A portable public attestation. It permits independent comparison of two
 * turns without publishing raw tasks, prompts, service logs, keys, or clocks.
 */
export function createPlayfairAttestation(input: {
  turn: string;
  previous?: string | null;
  queueCommitment: string;
  timings: PlayfairTimingWindow[];
  artifactHash: string;
}): PlayfairAttestation {
  const timings = [...input.timings]
    .map((timing) => ({ ...timing, elapsedMs: Math.max(0, Math.floor(timing.elapsedMs)), events: Math.max(0, Math.floor(timing.events)) }))
    .sort((left, right) => left.phase.localeCompare(right.phase));
  const body = {
    version: PLAYFAIR_ATTESTATION_VERSION,
    kind: "playfair.turn" as const,
    turn: input.turn,
    previous: input.previous ?? null,
    queueCommitment: input.queueCommitment,
    timings,
    artifactHash: input.artifactHash,
  };
  return { ...body, commitment: digest(body) };
}

export function verifyPlayfairAttestation(attestation: PlayfairAttestation): boolean {
  const { commitment, ...body } = attestation;
  return attestation.version === PLAYFAIR_ATTESTATION_VERSION && commitment === digest(body);
}