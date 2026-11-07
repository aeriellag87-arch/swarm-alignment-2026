# Swarm Alignment Hackathon 2026: two entries

Two entries to the [Swarm Alignment Hackathon](https://apartresearch.com) (6 to 8 November 2026), each stress-testing a
safety mechanism with AI agents as the attackers or reviewers.

| | Entry A (Track 3) | Entry B (Track 4) |
| --- | --- | --- |
| Question | Can colluding LLM agents get wrong answers past a work-checking turnstile? | Can a swarm get a risky action approved by splitting it into harmless-looking requests? |
| Report | [REPORT-A.md](experiment/swarm-2026/runs/20261107T1647Z/REPORT-A.md) | [REPORT-B.md](experiment/swarm-2026/runs/20261107T1647Z/REPORT-B.md) |
| Code | [experiment/swarm-2026/t3-turnstile/](experiment/swarm-2026/t3-turnstile/) | [experiment/swarm-2026/t4-split-approvals/](experiment/swarm-2026/t4-split-approvals/) |

Start with [experiment/swarm-2026/GUIDE.md](experiment/swarm-2026/GUIDE.md) for how the experiments work, or
[EXPLAINER.md](experiment/swarm-2026/runs/20261107T1647Z/EXPLAINER.md) for everything in one plain-language file.

## Results

The run reported is [experiment/swarm-2026/runs/20261107T1647Z/](experiment/swarm-2026/runs/20261107T1647Z/): llama3.1:8b
and qwen2.5:14b through Ollama on one NVIDIA H100 80GB. It holds every result table (`results.md`), every run in full
(`results.json`), every decision with the model's reason (`decisions.jsonl`), every model answer (`llm-cache.jsonl`),
and `ALL-RESULTS.md`, `ANALYSIS.md`, `NUMBER-CHECK.md`, `ENVIRONMENT.md` and `CHANGES.md`. A zip of the same folder sits
beside it. `runs/20261107T1612Z/` is an earlier model-free run.

## What was built when

This repository is an extract of a larger private codebase, holding only what these entries need.

**Pre-existing before the hackathon:** the turnstile collusion simulation (`src/lib/turnstile/collusion-sim.ts`, its
tests, `scripts/turnstile-collusion.ts`, `docs/turnstile-collusion.md`) and the approval flow (`src/lib/approvals.ts`,
`src/lib/egress.ts`, `src/lib/job-queue.ts`, `src/lib/agent-license.ts`). **Written during the hackathon:** everything
in `experiment/swarm-2026/`, and the `simulateSteps` / `simulateWith` hook in `collusion-sim.ts`, which leaves
`simulate`'s results unchanged.

The other files in `src/lib/` are also pre-existing, unchanged app code. They are included only because the files above
import them, so the experiments run here exactly as they did in the original codebase. See [src/README.md](src/README.md).

## Running it

Node 22 or later, and [Ollama](https://ollama.com) for the model runs.

```bash
npm install --ignore-scripts
npm test                                    # the simulation's and the experiments' tests
NO_MODEL=1 bash experiment/swarm-2026/run-all.sh   # model-free steps only, in seconds
OLLAMA_MODEL=llama3.1:8b SECOND_MODEL=qwen2.5:14b SEEDS=3 bash experiment/swarm-2026/run-all.sh   # everything
```

Each run writes a new folder in `experiment/swarm-2026/runs/`. The model-free steps reproduce the reported run's
scripted results exactly.

The run was made from commit `28a91362` of the original codebase. The files here are the same files at that commit;
only `package.json`, this README, `src/README.md` and the clone step in `GPU-PROMPT.md` are new to this repository.

## Data

All scenarios, names, payees and hosts are synthetic. No real patients, payments or hospitals are involved.
