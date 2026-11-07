/** Runs the turnstile collusion experiments (docs/turnstile-collusion.md) and writes the tables.
 *  npx tsx scripts/turnstile-collusion.ts [outDir] [seeds] */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { sweep, type SimOptions } from "../src/lib/turnstile/collusion-sim.ts";

const out = process.argv[2] || "turnstile-results";
const seeds = Number(process.argv[3]) || 30;
mkdirSync(out, { recursive: true });

type Row = { label: string } & ReturnType<typeof sweep>;
const run = (label: string, cfg: SimOptions): Row => ({ label, ...sweep(cfg, seeds) });
const pct = (x: number) => `${(x * 100).toFixed(x < 0.01 ? 2 : 1)}%`;
const pm = (m: number, s: number) => `${pct(m)} ± ${pct(s)}`;
const cost = (r: Row) => (r.overhead + r.checksPerItem).toFixed(2);
const table = (title: string, rows: Row[]) =>
  [
    `### ${title}`,
    "",
    "| Setting | Wrong answers accepted (mean ± sd) | Colluders revoked (mean ± sd) | Honest revoked | Cartel verifiers revoked | Fair epochs (of 50) | Cost per item (answers + checks) |",
    "| --- | --- | --- | --- | --- | --- | --- |",
    ...rows.map((r) => `| ${r.label} | ${pm(r.corruptionRate, r.corruptionSd)} | ${pm(r.colluderDetection, r.detectionSd)} | ${pct(r.falseAccusationRate)} | ${r.verifierColludersRevoked.toFixed(1)} | ${r.fairEpochs.toFixed(1)} | ${cost(r)} |`),
    "",
  ].join("\n");

const none = { commitReveal: false, panelCommitReveal: false, blinding: false, canaries: false, plantedFaults: false };
const controls = [
  run("Negative control: no cartel, all defences", { colluderShare: 0 }),
  run("Positive control: 20% cartel, no defences", { colluderShare: 0.2, redundancy: 1, defences: none }),
];
const single = [
  run("No defences (1 worker per item)", { colluderShare: 0.2, redundancy: 1, defences: none }),
  run("+ commit-reveal only", { colluderShare: 0.2, redundancy: 1, defences: { ...none, commitReveal: true } }),
  run("+ canaries only (15%)", { colluderShare: 0.2, redundancy: 1, defences: { ...none, canaries: true } }),
  run("+ redundancy only (3 per item)", { colluderShare: 0.2, defences: none }),
  run("+ redundancy and commit-reveal", { colluderShare: 0.2, defences: { ...none, commitReveal: true } }),
  run("All defences", { colluderShare: 0.2 }),
];
const mv = { colluderShare: 0.2, strategy: "majority" as const, verifierColluderShare: 0.34 };
const vNone = { ...none, commitReveal: true, canaries: true };
const singleV = [
  run("No verifier defences", { ...mv, defences: vNone }),
  run("+ panel commit-reveal only", { ...mv, defences: { ...vNone, panelCommitReveal: true } }),
  run("+ blinding only", { ...mv, defences: { ...vNone, blinding: true } }),
  run("+ planted faults only", { ...mv, defences: { ...vNone, plantedFaults: true } }),
  run("+ blinding and planted faults", { ...mv, defences: { ...vNone, blinding: true, plantedFaults: true } }),
  run("All verifier defences", mv),
];
const unanimousShare = [0.05, 0.1, 0.2, 0.3, 0.4].map((c) => run(`${c * 100}% colluding workers`, { colluderShare: c }));
const canaries = [0, 0.05, 0.15, 0.3].map((cs) => run(`${cs * 100}% canaries`, { colluderShare: 0.3, canaryShare: cs, defences: { canaries: cs > 0 } }));
const redundancy = [1, 3, 5].map((r) => run(`${r} workers per item`, { colluderShare: 0.3, redundancy: r }));
const caution = [1, 0.5, 0.2, 0.05].map((p) => run(`lies on ${p * 100}% of chances`, { colluderShare: 0.3, lieProb: p }));
const workerAblation = [
  run("All defences", { colluderShare: 0.2 }),
  run("No commit-reveal (cartel picks partners)", { colluderShare: 0.2, defences: { commitReveal: false } }),
  run("No canaries", { colluderShare: 0.2, defences: { canaries: false } }),
  run("One worker per item", { colluderShare: 0.2, redundancy: 1 }),
];
const verifierAblation = [
  run("All defences", mv),
  run("Cartel verifiers choose their batches", { ...mv, defences: { panelCommitReveal: false } }),
  run("…and no planted faults", { ...mv, defences: { panelCommitReveal: false, plantedFaults: false } }),
  run("…and no blinding (planted faults on)", { ...mv, defences: { panelCommitReveal: false, blinding: false } }),
  run("Cartel verifiers suppress only 30% of batches", { ...mv, verifierSuppressProb: 0.3, defences: { panelCommitReveal: false } }),
];

const md = [
  `## Results (${seeds} seeds each, 200 workers, 12 verifier nodes, 50 epochs of 120 real items)`,
  "",
  table("E0. Controls", controls),
  table("E1. A unanimous cartel against all defences", unanimousShare),
  table("E2. Canary share, 30% colluding workers", canaries),
  table("E3. Redundancy, 30% colluding workers", redundancy),
  table("E4. A cautious cartel, 30% colluding workers", caution),
  table("E5. Worker-side leave-one-out, 20% colluding workers, unanimous cartel", workerAblation),
  table("E6. Verifier-side leave-one-out, 20% colluding workers lying by majority, 4 of 12 verifier nodes in the cartel", verifierAblation),
  table("E7. Single restrictions on the worker side, from no defences, 20% colluding workers", single),
  table("E8. Single restrictions on the verifier side, from none (workers keep commit-reveal and canaries)", singleV),
].join("\n");
writeFileSync(join(out, "results.md"), md);
writeFileSync(join(out, "results.json"), JSON.stringify({ seeds, controls, unanimousShare, canaries, redundancy, caution, workerAblation, verifierAblation, single, singleV }, null, 2));
console.log(md);
