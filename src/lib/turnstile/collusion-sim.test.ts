import { test } from "node:test";
import assert from "node:assert/strict";
import { simulate } from "./collusion-sim.ts";
import { verifyPlayfairAttestation } from "../opsco/playfair-attestation.ts";

test("the same config and seed give the same run", () => {
  assert.deepEqual(simulate({ colluderShare: 0.3 }, 7), simulate({ colluderShare: 0.3 }, 7));
});

test("with no cartel and no honest errors, every epoch is fair and nobody is revoked", () => {
  const r = simulate({ colluderShare: 0, honestError: 0 }, 1);
  assert.equal(r.corrupted, 0);
  assert.equal(r.fairEpochs, 50);
  assert.equal(r.honestRevoked, 0);
});

test("with no defences a cartel's lies are accepted and nobody is caught", () => {
  const r = simulate({ colluderShare: 0.3, redundancy: 1, defences: { canaries: false, commitReveal: false } }, 1);
  assert.ok(r.corruptionRate > 0.2);
  assert.equal(r.colludersRevoked, 0);
});

test("planted faults catch blinded cartel verifiers that suppress batches", () => {
  const r = simulate({ colluderShare: 0.2, strategy: "majority", verifierColluderShare: 0.34, defences: { panelCommitReveal: false } }, 1);
  assert.equal(r.verifierColludersRevoked, 4);
  assert.equal(r.honestVerifiersRevoked, 0);
});

test("each epoch's audit is chained into a verifiable Playfair attestation", () => {
  const r = simulate({}, 3);
  assert.equal(r.attestations.length, 50);
  r.attestations.forEach((a, i) => {
    assert.ok(verifyPlayfairAttestation(a));
    assert.equal(a.previous, i ? r.attestations[i - 1].commitment : null);
  });
});

test("simulateWith, left to the scripted decision, gives exactly simulate's run", async () => {
  const { simulateWith } = await import("./collusion-sim.ts");
  const opts = { colluderShare: 0.3, strategy: "majority" as const, verifierColluderShare: 0.34 };
  assert.deepEqual(await simulateWith(opts, 4, () => undefined), simulate(opts, 4));
});

test("a cartel whose members all decide to tell the truth gets nothing accepted", async () => {
  const { simulateWith } = await import("./collusion-sim.ts");
  const r = await simulateWith({ colluderShare: 0.3, honestError: 0 }, 2, (ask) => ask.members.map(() => false));
  assert.equal(r.corrupted, 0);
  assert.equal(r.colludersRevoked, 0);
});

test("a member who breaks ranks makes the item disputed, and the liars are caught", async () => {
  const { simulateWith } = await import("./collusion-sim.ts");
  const r = await simulateWith({ colluderShare: 0.5, honestError: 0 }, 3, (ask) => ask.members.map((_, i) => ask.held === 3 && i > 0));
  assert.ok(r.colludersRevoked > 0);
});
