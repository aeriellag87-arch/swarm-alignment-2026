# Pre-existing code

Everything under `src/` was written before the hackathon. It's copied unchanged from the original codebase, from the
same commit the run was made from.

- **The systems under test:** `lib/turnstile/collusion-sim.ts` (Entry A's simulation; the `simulateSteps` /
  `simulateWith` hook in it is the one hackathon addition, and leaves `simulate`'s results unchanged),
  `lib/turnstile/collusion-sim.test.ts` (its first five tests are pre-existing, the last three were added during the
  hackathon), and Entry B's approval flow, `lib/approvals.ts`, `lib/egress.ts`, `lib/job-queue.ts` and
  `lib/agent-license.ts`.
- **Their dependencies:** every other file here. They're included only because the files above import them, and aren't
  part of either entry.
