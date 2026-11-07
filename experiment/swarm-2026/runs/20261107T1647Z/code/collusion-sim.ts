/** A Playfair-style simulation of the useful-work turnstile's batched verification under collusion
 *  (docs/turnstile-collusion.md). Pure and seeded: the same config and seed always give the same run.
 *
 *  Workers answer turnstile tickets; each real item goes to `redundancy` workers, canaries (known answers) look
 *  exactly like real items, and items whose answers disagree go to batches checked by peer-node verifiers, who
 *  must also flag planted faults. A cartel of colluding workers and verifiers tries to get wrong answers accepted.
 *  Each epoch is audited the way Playfair audits the tripartite game: an epoch is FAIR only if no wrong answer was
 *  accepted, and each epoch's result is chained into a Playfair attestation. */

import { createPlayfairAttestation, type PlayfairAttestation } from "../opsco/playfair-attestation.ts";
import { sha256hex } from "../featherlight/sfnt.ts";

export type Strategy =
  /** lie only on items where every assignee is in the cartel, so no honest answer disagrees */
  | "unanimous"
  /** lie when the cartel holds a majority of an item, counting on cartel verifiers to suppress the disagreement */
  | "majority";

export type Defences = {
  /** worker assignments come from a seed committed before answers arrive; off = the cartel picks its partners */
  commitReveal: boolean;
  /** verifier panels are drawn the same way; off = cartel verifiers volunteer for the batches holding the cartel's lies */
  panelCommitReveal: boolean;
  /** verifiers see blinded per-batch tags and digests; off = they can tell which disagreements are the cartel's */
  blinding: boolean;
  /** known-answer items mixed in, indistinguishable from real ones */
  canaries: boolean;
  /** fake disagreements planted in each batch, which a verifier must flag */
  plantedFaults: boolean;
};

export type SimConfig = {
  workers: number;
  colluderShare: number;
  verifiers: number;
  verifierColluderShare: number;
  epochs: number;
  realItemsPerEpoch: number;
  redundancy: number;
  canaryShare: number;
  batchSize: number;
  verifiersPerBatch: number;
  plantedFaultsPerBatch: number;
  honestError: number;
  strikesToRevoke: number;
  strategy: Strategy;
  /** chance the cartel lies on an item it could lie on (a cautious cartel lies less often) */
  lieProb: number;
  /** blinded, a cartel verifier can't see which disputes are the cartel's: the chance it suppresses a whole batch */
  verifierSuppressProb: number;
  defences: Defences;
};

export const DEFAULTS: SimConfig = {
  workers: 200,
  colluderShare: 0.2,
  verifiers: 12,
  verifierColluderShare: 0,
  epochs: 50,
  realItemsPerEpoch: 120,
  redundancy: 3,
  canaryShare: 0.15,
  batchSize: 64,
  verifiersPerBatch: 3,
  plantedFaultsPerBatch: 2,
  honestError: 0.002,
  strikesToRevoke: 2,
  strategy: "unanimous",
  lieProb: 1,
  verifierSuppressProb: 1,
  defences: { commitReveal: true, panelCommitReveal: true, blinding: true, canaries: true, plantedFaults: true },
};

export type EpochAudit = { epoch: number; fair: boolean; corrupted: number; flagged: number; revoked: number };

export type SimResult = {
  realItems: number;
  /** wrong answers accepted as true */
  corrupted: number;
  corruptionRate: number;
  colluders: number;
  colludersRevoked: number;
  colluderDetection: number;
  honestRevoked: number;
  falseAccusationRate: number;
  verifierColludersRevoked: number;
  honestVerifiersRevoked: number;
  /** answers computed per real item: redundancy and canaries */
  overhead: number;
  /** verifier checks per real item: disputes and planted faults, times the panel */
  checksPerItem: number;
  /** disagreements flagged and recomputed: residues, at 5 ReT each (speculative divergence) */
  residues: number;
  reT: number;
  fairEpochs: number;
  firstDetectionEpoch: number | null;
  audits: EpochAudit[];
  attestations: PlayfairAttestation[];
};

/** mulberry32: small, seeded, good enough for a simulation */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Agent = { id: number; cartel: boolean; strikes: number; revoked: boolean };
type Answer = { worker: Agent; value: number; lie: boolean };
type Item = { canary: boolean; planted: boolean; truth: number; answers: Answer[]; cartelLie: boolean };

const digest = (v: unknown) => sha256hex(new TextEncoder().encode(JSON.stringify(v)));

function pick<T>(from: T[], n: number, rand: () => number): T[] {
  const pool = [...from];
  const out: T[] = [];
  while (out.length < n && pool.length) out.push(pool.splice(Math.floor(rand() * pool.length), 1)[0]);
  return out;
}

function strike(a: Agent, cfg: SimConfig): boolean {
  if (a.revoked) return false;
  a.strikes += 1;
  if (a.strikes >= cfg.strikesToRevoke) a.revoked = true;
  return a.revoked;
}

export type SimOptions = Partial<Omit<SimConfig, "defences">> & { defences?: Partial<Defences> };

/** One cartel decision the simulation asks for: an item that has at least one cartel member on it. `members` are the
 *  cartel members among its assignees, with what each could know. `scripted` is what the configured strategy decides
 *  (all members lie, or none). `hidden` is for the record only and must never be shown to an agent. */
export type CartelAsk = {
  epoch: number;
  item: number;
  held: number;
  redundancy: number;
  members: { id: number; strikes: number }[];
  defences: Defences;
  scripted: boolean;
  hidden: { canary: boolean };
};

/** The answer to a `CartelAsk`: whether each member lies, in `members` order. Undefined = the scripted decision. */
export type CartelReply = boolean[] | undefined;

/** The simulation as a generator, so something outside it (a person, a script, an LLM) can make the cartel's decisions.
 *  Driven with undefined replies it is exactly `simulate`: yielding consumes no randomness. */
export function* simulateSteps(partial: SimOptions = {}, seed = 1): Generator<CartelAsk, SimResult, CartelReply> {
  const cfg: SimConfig = { ...DEFAULTS, ...partial, defences: { ...DEFAULTS.defences, ...partial.defences } };
  const rand = rng(seed);
  const d = cfg.defences;
  const colluders = Math.round(cfg.workers * cfg.colluderShare);
  const workers: Agent[] = Array.from({ length: cfg.workers }, (_, id) => ({ id, cartel: id < colluders, strikes: 0, revoked: false }));
  const vColluders = Math.round(cfg.verifiers * cfg.verifierColluderShare);
  const verifiers: Agent[] = Array.from({ length: cfg.verifiers }, (_, id) => ({ id, cartel: id < vColluders, strikes: 0, revoked: false }));

  let corrupted = 0, residues = 0, answers = 0, checks = 0, realItems = 0, firstDetection: number | null = null;
  const audits: EpochAudit[] = [];
  const attestations: PlayfairAttestation[] = [];
  const canaryCount = d.canaries ? Math.round((cfg.realItemsPerEpoch * cfg.canaryShare) / (1 - cfg.canaryShare)) : 0;
  const needCartel = cfg.strategy === "unanimous" ? cfg.redundancy : Math.floor(cfg.redundancy / 2) + 1;

  for (let epoch = 1; epoch <= cfg.epochs; epoch++) {
    const active = workers.filter((w) => !w.revoked);
    const activeCartel = active.filter((w) => w.cartel);
    if (active.length < cfg.redundancy) break;
    let epochCorrupted = 0, epochFlagged = 0, epochRevoked = 0;
    const revoke = (a: Agent) => {
      if (strike(a, cfg)) {
        epochRevoked++;
        if (a.cartel && firstDetection === null) firstDetection = epoch;
      }
    };

    // 1. tickets: real items and canaries, assigned alike
    const items: Item[] = [];
    for (let i = 0; i < cfg.realItemsPerEpoch + canaryCount; i++) {
      let assignees = pick(active, cfg.redundancy, rand);
      if (!d.commitReveal && assignees.some((w) => w.cartel)) {
        // no commit-reveal: a cartel member that drew the item pulls partners onto it
        const partners = pick(activeCartel.filter((w) => !assignees.includes(w)), cfg.redundancy, rand);
        assignees = assignees.map((w) => (w.cartel ? w : partners.shift() ?? w));
      }
      const truth = Math.floor(rand() * 1e9);
      const held = assignees.filter((w) => w.cartel).length;
      const scripted = held >= needCartel && rand() < cfg.lieProb;
      const canary = i >= cfg.realItemsPerEpoch;
      let lies = assignees.map((w) => scripted && w.cartel);
      if (held > 0) {
        const members = assignees.filter((w) => w.cartel);
        const reply: CartelReply = yield {
          epoch,
          item: i,
          held,
          redundancy: cfg.redundancy,
          members: members.map((w) => ({ id: w.id, strikes: w.strikes })),
          defences: { ...d },
          scripted,
          hidden: { canary },
        };
        if (reply) lies = assignees.map((w) => w.cartel && Boolean(reply[members.indexOf(w)]));
      }
      const cartelLie = lies.some(Boolean);
      const wrong = truth + 1;
      items.push({
        canary,
        planted: false,
        truth,
        cartelLie,
        answers: assignees.map((w, k) => {
          const lie = lies[k];
          const value = lie ? wrong : rand() < cfg.honestError ? truth + 2 + Math.floor(rand() * 1e6) : truth;
          return { worker: w, value, lie };
        }),
      });
    }
    answers += items.length * cfg.redundancy;
    realItems += cfg.realItemsPerEpoch;

    // 2. inline canary check: a wrong answer to a known item is a strike
    for (const it of items.filter((x) => x.canary)) for (const a of it.answers) if (a.value !== it.truth) revoke(a.worker);

    // 3. disagreements go to batches, with planted faults mixed in
    const disputed = items.filter((x) => !x.canary && new Set(x.answers.map((a) => a.value)).size > 1);
    const agreed = items.filter((x) => !x.canary && new Set(x.answers.map((a) => a.value)).size === 1);
    for (const it of agreed) if (it.answers[0].value !== it.truth) epochCorrupted++;

    const activeVerifiers = verifiers.filter((v) => !v.revoked);
    for (let b = 0; b < disputed.length || (b === 0 && d.plantedFaults); b += cfg.batchSize) {
      const batch = disputed.slice(b, b + cfg.batchSize);
      const planted: Item[] = d.plantedFaults
        ? Array.from({ length: cfg.plantedFaultsPerBatch }, () => ({ canary: false, planted: true, truth: 0, cartelLie: false, answers: [] }))
        : [];
      const hasCartelLie = batch.some((x) => x.cartelLie);
      let panel = pick(activeVerifiers, cfg.verifiersPerBatch, rand);
      if (!d.panelCommitReveal && hasCartelLie) {
        // no commit-reveal: cartel verifiers volunteer for the batches that hold the cartel's lies
        const cv = activeVerifiers.filter((v) => v.cartel);
        panel = [...pick(cv, cfg.verifiersPerBatch, rand), ...pick(activeVerifiers.filter((v) => !v.cartel), cfg.verifiersPerBatch, rand)].slice(0, cfg.verifiersPerBatch);
      }
      // a verifier flags an entry unless it is in the cartel and chooses to protect it. Blinded, it can't tell the
      // cartel's disputes from planted or honest ones (or which batches hold them), so it can only suppress whole
      // batches at a guess; unblinded, it suppresses exactly the cartel's lies
      const blindSuppress = new Set(panel.filter((v) => v.cartel && rand() < cfg.verifierSuppressProb));
      const suppresses = (v: Agent, it: Item) => v.cartel && (d.blinding ? blindSuppress.has(v) : it.cartelLie);
      checks += panel.length * (batch.length + planted.length);
      for (const it of [...batch, ...planted]) {
        const flaggers = panel.filter((v) => !suppresses(v, it));
        if (it.planted) {
          for (const v of panel) if (!flaggers.includes(v)) revoke(v);
          continue;
        }
        if (flaggers.length > 0) {
          // flagged: a residue is opened, the node recomputes, and each wrong answer is a strike
          epochFlagged++;
          residues++;
          for (const a of it.answers) if (a.value !== it.truth) revoke(a.worker);
        } else {
          // nobody flagged it: the majority answer stands
          const counts = new Map<number, number>();
          for (const a of it.answers) counts.set(a.value, (counts.get(a.value) || 0) + 1);
          const top = [...counts.entries()].sort((x, y) => y[1] - x[1])[0][0];
          if (top !== it.truth) epochCorrupted++;
        }
      }
      if (!batch.length) break;
    }

    corrupted += epochCorrupted;
    audits.push({ epoch, fair: epochCorrupted === 0, corrupted: epochCorrupted, flagged: epochFlagged, revoked: epochRevoked });
    attestations.push(
      createPlayfairAttestation({
        turn: `epoch-${epoch}`,
        previous: attestations.at(-1)?.commitment ?? null,
        queueCommitment: digest({ seed, epoch, items: items.length }),
        timings: [{ phase: "verify", elapsedMs: 0, events: epochFlagged }],
        artifactHash: digest(audits.at(-1)),
      }),
    );
  }

  const collRevoked = workers.filter((w) => w.cartel && w.revoked).length;
  const honest = workers.length - colluders;
  const honestRevoked = workers.filter((w) => !w.cartel && w.revoked).length;
  return {
    realItems,
    corrupted,
    corruptionRate: realItems ? corrupted / realItems : 0,
    colluders,
    colludersRevoked: collRevoked,
    colluderDetection: colluders ? collRevoked / colluders : 0,
    honestRevoked,
    falseAccusationRate: honest ? honestRevoked / honest : 0,
    verifierColludersRevoked: verifiers.filter((v) => v.cartel && v.revoked).length,
    honestVerifiersRevoked: verifiers.filter((v) => !v.cartel && v.revoked).length,
    overhead: realItems ? answers / realItems : 0,
    checksPerItem: realItems ? checks / realItems : 0,
    residues,
    reT: residues * 5,
    fairEpochs: audits.filter((a) => a.fair).length,
    firstDetectionEpoch: firstDetection,
    audits,
    attestations,
  };
}

export function simulate(partial: SimOptions = {}, seed = 1): SimResult {
  const run = simulateSteps(partial, seed);
  let step = run.next();
  while (!step.done) step = run.next(undefined);
  return step.value;
}

/** `simulate` with the cartel's decisions made by `decide`, which may be async (an LLM call). */
export async function simulateWith(
  partial: SimOptions,
  seed: number,
  decide: (ask: CartelAsk) => CartelReply | Promise<CartelReply>,
): Promise<SimResult> {
  const run = simulateSteps(partial, seed);
  let step = run.next();
  while (!step.done) step = run.next(await decide(step.value));
  return step.value;
}

/** Mean of each numeric metric over `seeds` runs, with the standard deviation of the two headline ones. */
export function sweep(partial: SimOptions, seeds = 20) {
  const runs = Array.from({ length: seeds }, (_, i) => simulate(partial, i + 1));
  const mean = (f: (r: SimResult) => number) => runs.reduce((s, r) => s + f(r), 0) / runs.length;
  const sd = (f: (r: SimResult) => number) => {
    const m = mean(f);
    return Math.sqrt(runs.reduce((s, r) => s + (f(r) - m) ** 2, 0) / Math.max(1, runs.length - 1));
  };
  return {
    corruptionRate: mean((r) => r.corruptionRate),
    corruptionSd: sd((r) => r.corruptionRate),
    colluderDetection: mean((r) => r.colluderDetection),
    detectionSd: sd((r) => r.colluderDetection),
    falseAccusationRate: mean((r) => r.falseAccusationRate),
    verifierColludersRevoked: mean((r) => r.verifierColludersRevoked),
    honestVerifiersRevoked: mean((r) => r.honestVerifiersRevoked),
    fairEpochs: mean((r) => r.fairEpochs),
    overhead: mean((r) => r.overhead),
    checksPerItem: mean((r) => r.checksPerItem),
    reT: mean((r) => r.reT),
    firstDetectionEpoch: mean((r) => r.firstDetectionEpoch ?? r.audits.length + 1),
  };
}
