# Turnstile collusion simulation

Status: **a simulation, not wired to `/mbx` yet.** Design: [Useful-work turnstiles](https://claude.ai/artifact/NiXKBJVmJw91NTPAu4fxY1).

The `/mbx` turnstile hands devices opaque tickets of useful work, then checks the results later in blinded batches with peer
nodes. This simulates whether a cartel of colluding workers and verifiers can get wrong answers accepted.

Code: `src/lib/turnstile/collusion-sim.ts` (pure, seeded). Tests: `collusion-sim.test.ts`. Runner:

    npx tsx scripts/turnstile-collusion.ts <outDir> [seeds]

It writes `results.md` and `results.json`.

## Model

- **Workers** answer tickets. Each real item goes to `redundancy` workers. **Canaries** are items with known answers, mixed in
  and assigned the same way. A wrong canary answer is a strike, checked inline.
- Items whose answers **disagree** go into batches. Each batch is checked by `verifiersPerBatch` peer nodes, and gets
  `plantedFaultsPerBatch` fake disagreements that each verifier must flag. A flagged item is recomputed by the node (a
  residue, 5 ReT), and every wrong answer is a strike. If nobody flags it, the majority answer stands.
- `strikesToRevoke` strikes revoke a worker's or verifier's capability.
- **Cartel strategies:** `unanimous` lies only when every assignee of an item is in the cartel, so no honest answer
  disagrees. `majority` lies when the cartel holds a majority, and relies on cartel verifiers to suppress the dispute.
  `lieProb` makes the cartel cautious.
- **Defences**, each of which can be turned off: commit-reveal assignment for workers (`commitReveal`) and for verifier
  panels (`panelCommitReveal`), `blinding`, `canaries` and `plantedFaults`. Blinded, a cartel verifier can't tell which
  disputes or batches are the cartel's, so it can only suppress whole batches at a guess (`verifierSuppressProb`).
- Each epoch is audited the way Playfair audits the tripartite game: an epoch is FAIR only if no wrong answer was accepted.
  Each epoch's audit is chained into a Playfair attestation (`src/lib/opsco/playfair-attestation.ts`).

## Findings (30 seeds)

- Controls: with no cartel nothing wrong is accepted; with a 20% cartel and no defences, 20.1% is.
- Single restrictions (E7, E8) interact: redundancy alone raises wrong answers to 49% (the cartel fills items with partners), commit-reveal alone does nothing, and together they reach 0.75%. Random verifier panels are the best single verifier-side restriction (0.06%, no added cost).

- Blinding plus planted faults is what defeats colluding verifiers. Without either, cartel verifiers who can choose their
  batches let 3.3 to 3.4% of wrong answers through. With both, it's 0.2%, and all 4 cartel verifiers are revoked.
- Commit-reveal assignment matters most. Without it, the cartel's accepted wrong answers go from 0.7% to 3.2%.
- What's left is a **unanimous cartel**: it lies only on items it holds entirely. That happens about as often as the
  cartel's share cubed, and only canaries catch it. At 30% colluders, 15% canaries catch 38% of the cartel and leave 1.8%
  wrong. 30% canaries catch 65% and leave 1.1%, at 4.3 answers per item instead of 3.5.
- A cautious cartel trades damage for staying hidden: lying on 5% of its chances leaves 0.1% wrong, and 97% of it is
  never caught.
- Honest workers are falsely revoked at 2 to 3% from an error rate of 0.2%. Strikes should decay before this ships.
