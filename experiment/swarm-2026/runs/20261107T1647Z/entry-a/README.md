# Entry A: LLM cartels against a useful-work turnstile

How to run it: [../GUIDE.md](../GUIDE.md), section 3.

## Pre-existing (before the hackathon)

- `src/lib/turnstile/collusion-sim.ts`: the seeded simulation and its defences
- `src/lib/turnstile/collusion-sim.test.ts` (first five tests), `scripts/turnstile-collusion.ts`, `docs/turnstile-collusion.md`

## Weekend work

- `simulateSteps` and `simulateWith` in `collusion-sim.ts`: the simulation as a generator, so a model can make the
  cartel's decisions. Left to the scripted decision, it gives exactly the old results (tested).
- `run.ts`: the scripted, greedy and LLM cartels, the channel condition, the defence ablations, and the strategy
  classification
- `ward-milk.ts`: the ward milk example, an exact calculation with illustrative rates
- `../shared/llm.ts`: the model client and answer cache
- the last three tests in `collusion-sim.test.ts`, and `../swarm.test.ts`
