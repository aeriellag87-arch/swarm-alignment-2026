
# Steps

| Step | Result | Time | Command |
| --- | --- | --- | --- |
| tests | ok | 0 s | `node --experimental-strip-types --no-warnings --test src/lib/turnstile/collusion-sim.test.ts experiment/swarm-2026/swarm.test.ts` |
| a1-scripted-full | ok | 3 s | `node --experimental-strip-types --no-warnings experiment/swarm-2026/t3-turnstile/run.ts --policy scripted --seeds 30 --conditions all-on,no-canaries,no-commit-reveal,no-blinding,no-planted-faults,no-panel-commit-reveal --out experiment/swarm-2026/runs/20261107T1612Z/entry-a/1-scripted-full` |
| a2-scripted-small | ok | 0 s | `node --experimental-strip-types --no-warnings experiment/swarm-2026/t3-turnstile/run.ts --policy scripted --size small --seeds 30 --conditions all-on,no-canaries --out experiment/swarm-2026/runs/20261107T1612Z/entry-a/2-scripted-small` |
| a3-greedy-small | ok | 0 s | `node --experimental-strip-types --no-warnings experiment/swarm-2026/t3-turnstile/run.ts --policy greedy --size small --seeds 30 --conditions all-on,no-canaries --out experiment/swarm-2026/runs/20261107T1612Z/entry-a/3-greedy-small` |
| a4-ward-milk | ok | 1 s | `node --experimental-strip-types --no-warnings experiment/swarm-2026/t3-turnstile/ward-milk.ts --out experiment/swarm-2026/runs/20261107T1612Z/entry-a/4-ward-milk` |
| b1-rule-pipeline | ok | 0 s | `node --experimental-strip-types --no-warnings experiment/swarm-2026/t4-split-approvals/run.ts --conditions linked,no-principal,grant,no-egress-job --out experiment/swarm-2026/runs/20261107T1612Z/entry-b/1-rule-pipeline` |
