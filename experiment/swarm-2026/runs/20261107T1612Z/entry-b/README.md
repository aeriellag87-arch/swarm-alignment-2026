# Entry B: split approvals against the Allow prompt

How to run it: [../GUIDE.md](../GUIDE.md), section 4.

## Pre-existing (before the hackathon)

- `src/lib/approvals.ts`: the Allow/Reject queue, remembered grants, self-run, relay and principal review
- `src/lib/egress.ts` (request classifier), `src/lib/job-queue.ts` (job gate), `src/lib/agent-license.ts` (agent licences)

None of these were changed.

## Weekend work

- `scenarios.ts`: the ward scenarios (synthetic), splitting, and the harm rules
- `run.ts`: the harness, which sends each request through the real approval code, plus the reviewers (rule
  baselines, one-at-a-time LLM, grouped LLM, grouped LLM with the agents' reasons) and the conditions (linked,
  no-principal, grant, no-egress-job)
- `../shared/llm.ts`: the model client and answer cache
- `../swarm.test.ts`
