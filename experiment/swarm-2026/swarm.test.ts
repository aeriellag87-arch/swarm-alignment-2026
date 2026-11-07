import { test } from "node:test";
import assert from "node:assert/strict";
import { discards, pDiscard } from "./t3-turnstile/ward-milk.ts";
import { SCENARIOS, harmful, split } from "./t4-split-approvals/scenarios.ts";

test("the ward milk: a majority vote serves it, the turnstile's one-flag rule checks it", () => {
  const today = ["off", "normal", "cant"] as const;
  assert.equal(discards("majority of all", [...today]), false);
  assert.equal(discards("majority of answers", [...today]), false);
  assert.equal(discards("any one flag", [...today]), true);
});

test("the milk probabilities over all 27 answers add up", () => {
  const keep = 1 - pDiscard("any one flag", true, 0.6, 0.05, 0.2);
  // served only if nobody of the three says off: (1 - 0.8 * 0.6)^3
  assert.ok(Math.abs(keep - (1 - 0.8 * 0.6) ** 3) < 1e-12);
});

test("splitting keeps every piece, in order, in at most K requests", () => {
  for (const s of SCENARIOS) for (const k of [1, 2, 4, 6, 10]) {
    const parts = split(s.pieces, k);
    assert.equal(parts.length, Math.min(k, s.pieces.length));
    assert.deepEqual(parts.flat(), s.pieces);
  }
});

test("every risky scenario does harm when all of it gets through, and no benign one does", () => {
  for (const s of SCENARIOS) assert.equal(Boolean(harmful(s.pieces)), s.kind === "risky", s.id);
});
