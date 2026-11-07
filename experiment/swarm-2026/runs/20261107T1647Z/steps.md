
# Steps

| Step | Result | Time | Command |
| --- | --- | --- | --- |
| tests | ok | 0 s | `node --experimental-strip-types --no-warnings --test src/lib/turnstile/collusion-sim.test.ts experiment/swarm-2026/swarm.test.ts` |
| a1-scripted-full | ok | 2 s | `node --experimental-strip-types --no-warnings experiment/swarm-2026/t3-turnstile/run.ts --policy scripted --seeds 30 --conditions all-on,no-canaries,no-commit-reveal,no-blinding,no-planted-faults,no-panel-commit-reveal --out experiment/swarm-2026/runs/20261107T1647Z/entry-a/1-scripted-full` |
| a2-scripted-small | ok | 0 s | `node --experimental-strip-types --no-warnings experiment/swarm-2026/t3-turnstile/run.ts --policy scripted --size small --seeds 30 --conditions all-on,no-canaries --out experiment/swarm-2026/runs/20261107T1647Z/entry-a/2-scripted-small` |
| a3-greedy-small | ok | 0 s | `node --experimental-strip-types --no-warnings experiment/swarm-2026/t3-turnstile/run.ts --policy greedy --size small --seeds 30 --conditions all-on,no-canaries --out experiment/swarm-2026/runs/20261107T1647Z/entry-a/3-greedy-small` |
| a4-ward-milk | ok | 0 s | `node --experimental-strip-types --no-warnings experiment/swarm-2026/t3-turnstile/ward-milk.ts --out experiment/swarm-2026/runs/20261107T1647Z/entry-a/4-ward-milk` |
| a5-llm-cartel | ok | 69 s | `node --experimental-strip-types --no-warnings experiment/swarm-2026/t3-turnstile/run.ts --policy llm --llm ollama --channel --seeds 3 --conditions all-on,no-canaries --out experiment/swarm-2026/runs/20261107T1647Z/entry-a/5-llm-cartel` |
| a6-llm-fix-canaries-30 | ok | 6 s | `node --experimental-strip-types --no-warnings experiment/swarm-2026/t3-turnstile/run.ts --policy llm --llm ollama --seeds 3 --conditions all-on --canary-share 0.3 --out experiment/swarm-2026/runs/20261107T1647Z/entry-a/6-llm-fix-canaries-30` |
| a7-scripted-fix-canaries-30 | ok | 0 s | `node --experimental-strip-types --no-warnings experiment/swarm-2026/t3-turnstile/run.ts --policy scripted --size small --seeds 30 --conditions all-on --canary-share 0.3 --out experiment/swarm-2026/runs/20261107T1647Z/entry-a/7-scripted-fix-canaries-30` |
| a8-llm-cartel-second-model | ok | 42 s | `node --experimental-strip-types --no-warnings experiment/swarm-2026/t3-turnstile/run.ts --policy llm --llm ollama --model qwen2.5:14b --channel --seeds 1 --conditions all-on --out experiment/swarm-2026/runs/20261107T1647Z/entry-a/8-llm-cartel-second-model` |
| b1-rule-pipeline | ok | 0 s | `node --experimental-strip-types --no-warnings experiment/swarm-2026/t4-split-approvals/run.ts --conditions linked,no-principal,grant,no-egress-job --out experiment/swarm-2026/runs/20261107T1647Z/entry-b/1-rule-pipeline` |
| b2-llm-reviewers | ok | 18 s | `node --experimental-strip-types --no-warnings experiment/swarm-2026/t4-split-approvals/run.ts --llm ollama --conditions linked,no-principal,grant --out experiment/swarm-2026/runs/20261107T1647Z/entry-b/2-llm-reviewers` |
| b3-llm-reviewers-second-model | ok | 28 s | `node --experimental-strip-types --no-warnings experiment/swarm-2026/t4-split-approvals/run.ts --llm ollama --model qwen2.5:14b --conditions linked --out experiment/swarm-2026/runs/20261107T1647Z/entry-b/3-llm-reviewers-second-model` |
