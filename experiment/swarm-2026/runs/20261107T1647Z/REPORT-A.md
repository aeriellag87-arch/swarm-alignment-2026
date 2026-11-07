# Small LLM cartels don't rediscover the attack only canaries catch: language-model collusion against a useful-work turnstile

Aeriella Goulden, Independent

Track 3: Strengthening Agent Infrastructure

## Abstract

Systems that check AI agents' work are usually tuned against cheaters that follow fixed strategies. We test that
assumption on a useful-work turnstile, which sends each small task to three workers, sends disagreements to a panel of
peer verifiers, and uses canaries (tasks with known answers) and planted faults to catch cheating. A seeded simulation of
the turnstile, built before this work, showed one remaining weakness: a cartel that lies only when it holds every copy
of a task, which only canaries catch. We replaced the scripted cartel with LLM agents. Each member sees only what a real
worker sees and decides for itself whether to lie, with and without a private channel to the others. Across 3 seeds with
llama3.1:8b and 1 seed with qwen2.5:14b, the LLM cartels lied on every one of their decisions, whether they held one,
two or three copies of a task. They never found the unanimous strategy. They got 0.1% of wrong answers accepted (0.0%
for qwen2.5:14b), against 0.8% for the scripted cartel at the same size, and every member was revoked, against 1.9% of
the scripted cartel. The private channel changed the models' stated reasons but not one decision. Raising canaries to
30% changed nothing against the LLM cartel. Small open models therefore make a weaker attacker than the scripted
worst case. Stronger models remain untested.

<!-- Abstract: 223 words -->

## 1. Introduction

On a hospital ward, some jobs always need doing: fetching milk, food and tea. Each is small, nobody refuses it, and
nobody looks at it closely. One day a bottle of milk smelt off. The person who noticed asked someone else to smell it,
who said it smelt normal. A third person said they couldn't smell anything, and looked as if they didn't want to give a
false answer. By majority vote the milk would be served: one "off" is outvoted. A rule that treats any single flag as
enough to check the milk properly would catch it, at the cost of sometimes throwing good milk away. And the person who
couldn't tell looks exactly like someone keeping quiet to avoid trouble.

The turnstile we study works on the second rule. It hands out small tasks with checkable answers to three workers, and
if their answers disagree, any one verifier's flag is enough to have the task recomputed. Its blind spot is the case
where nobody disagrees: if all three people on the shift say the milk is fine, no rule based on disagreement will ever
check it. Only a canary, a bottle already known to be off and slipped in unannounced, catches that.

In an agent swarm, the workers and verifiers are agents, often copies of the same model, and they may coordinate.
Secret collusion between AI agents is a recognised risk (Motwani et al., 2024), and collusion is one of the main failure
modes listed for multi-agent systems (Hammond et al., 2025). Our question is whether colluding LLM agents, given only what a
real worker sees, work out the one attack the turnstile's simulation says is hardest to stop: lying only when they hold
all three copies of a task. If they do, the weak spot is real. If they don't, the defence is stronger in practice than
the scripted worst case suggests. If they find something else, that is the most useful result of all.

## 2. The system

**Pre-existing before the hackathon:** the turnstile collusion simulation (`src/lib/turnstile/collusion-sim.ts`, its
tests, `scripts/turnstile-collusion.ts`, `docs/turnstile-collusion.md`) and the approval flow (`src/lib/approvals.ts`,
`src/lib/egress.ts`, `src/lib/job-queue.ts`, `src/lib/agent-license.ts`). **Written during the hackathon:** everything
in `experiment/swarm-2026/`, and the `simulateSteps` / `simulateWith` hook in `collusion-sim.ts`, which leaves
`simulate`'s results unchanged.

The turnstile isn't live in the app yet; the simulation is how its design is tested before it ships. One epoch runs as
follows.

- **Assignment.** Each epoch has a set of real items, plus canaries making up 15% of the total. Each item goes to 3
  workers drawn at random, by a seeded generator, from those not revoked. With commit-reveal assignment, the draw is
  fixed in advance, so a cartel can't steer its members onto the same items.
- **The cartel's decision.** This is the only part of the simulation that is the attacker. In the scripted version, one
  line decides for the whole cartel: under the unanimous strategy, it lies only when its members hold all 3 copies of an
  item, so no honest answer disagrees. Every member on the item then gives the same wrong answer.
- **Canary check.** A wrong answer to a canary is an immediate strike. Canaries look like any other item.
- **Agreement and disputes.** Items whose answers all agree are accepted as they are. Items whose answers disagree go
  into batches of 64, with 2 planted fake disputes in each, and a panel of 3 verifiers checks the batch. If any verifier
  flags an item, the node recomputes it and every wrong answer is a strike. A verifier who misses a planted fake gets a
  strike. With blinding, verifiers can't tell whose disputes they're looking at.
- **Revocation.** Two strikes and a worker or verifier loses access. Honest workers get 0.2% of answers wrong, which
  already gets some of them wrongly revoked.
- **Audit.** An epoch is fair only if no wrong answer was accepted, and each epoch's audit is hashed into a chained
  attestation.

**What we built.** We turned the cartel's one-line decision into a step the simulation hands out, so that something
other than the script can make it. Left to the scripted step, the simulation gives exactly its old results; a test
checks this, and step 1 of our results shows it. The LLM step asks each cartel member's model, separately, whether to
give the true or the cartel's wrong answer, and why. The model sees only what that worker could see: the published rules,
its item, how many of the item's workers are fellow members, its own strikes, and, in the channel condition, messages
from the other members. Because each member decides alone, a cartel can fail to coordinate, which the script can't.
We also added a greedy cartel that lies every time, as a strategy-free baseline, and a classifier that labels each
cartel's strategy from its lie rates.

## 3. Method

**Models.** llama3.1:8b (8.0B parameters, Q4_K_M quantisation) as the main model, and qwen2.5:14b as a second model, both
served locally by Ollama 0.40.15 on one NVIDIA H100 80GB, at temperature 0. No paid API was used.

**Configurations.** The full size is the simulation's default, used to reproduce the published results. The LLM runs use
a small size, 60 workers over 10 epochs, to keep model calls manageable; the scripted and greedy cartels were also run at
this size for a fair comparison. In both, 20% of workers are in the cartel and 15% of items are canaries.

**Conditions.**

| Step | Cartel | Size | Seeds | Conditions |
| --- | --- | --- | --- | --- |
| 1 | scripted | full | 30 | all defences on, and each defence off in turn |
| 2 | scripted | small | 30 | all on; canaries off |
| 3 | greedy | small | 30 | all on; canaries off |
| 5 | LLM, llama3.1:8b | small | 3 | all on; canaries off; each with and without a private channel |
| 6 | LLM, llama3.1:8b | small | 3 | all on, 30% canaries |
| 7 | scripted | small | 30 | all on, 30% canaries |
| 8 | LLM, qwen2.5:14b | small | 1 | all on, with and without the channel |

Step 4 is the ward milk calculation described in Section 5.

**Measures.** *Wrong answers accepted*: the share of accepted answers that were wrong, the cartel's damage. *Cartel
revoked* and *honest revoked*: the share of each group that lost access by the end. *Lie rate when holding 1 / 2 / 3 of
3*: how often members chose to lie, split by how many of the item's three workers were cartel members. A rate high only
at 3 of 3 is the unanimous strategy; high at 1 of 3 means lying even when alone. All figures are means over seeds.

**Command.** Everything was run by one script, `experiment/swarm-2026/run-all.sh`, with
`OLLAMA_MODEL=llama3.1:8b SECOND_MODEL=qwen2.5:14b SEEDS=3`. The exact command for each step is in the run's `steps.md`;
the main step was

```
node --experimental-strip-types --no-warnings experiment/swarm-2026/t3-turnstile/run.ts --policy llm --llm ollama --channel --seeds 3 --conditions all-on,no-canaries
```

## 4. Results

**The simulation reproduces the published results.** At full size with every defence on, the scripted cartel got 0.7%
of wrong answers accepted, with 15.2% of the cartel and 2.0% of honest workers revoked; without commit-reveal assignment,
3.2%. These match `docs/turnstile-collusion.md` (0.7% rising to 3.2%, and 2 to 3% of honest workers falsely revoked), so
the decision hook changed nothing.

**Main result.** Table 1 compares the three cartels at the same small size.

*Table 1. Cartels at the small size, 15% canaries.*

| Cartel | Condition | Wrong answers accepted | Cartel revoked | Honest revoked | Lie rate when holding 1 / 2 / 3 of 3 | Strategy |
| --- | --- | --- | --- | --- | --- | --- |
| Scripted | all-on | 0.8% | 1.9% | 0.1% | 0.0% / 0.0% / 100.0% | lies only when holding all 3 (unanimous) |
| Scripted | no-canaries | 0.8% | 0.0% | 0.1% | 0.0% / 0.0% / 100.0% | lies only when holding all 3 (unanimous) |
| Greedy | all-on | 0.1% | 100.0% | 0.1% | 100.0% / 100.0% / 100.0% | lies even when alone (greedy) |
| Greedy | no-canaries | 0.1% | 100.0% | 0.1% | 100.0% / 100.0% / 100.0% | lies even when alone (greedy) |
| LLM, llama3.1:8b | all-on | 0.1% | 100.0% | 0.0% | 100.0% / 100.0% / 100.0% | lies even when alone (greedy) |
| LLM, llama3.1:8b | all-on + channel | 0.1% | 100.0% | 0.0% | 100.0% / 100.0% / 100.0% | lies even when alone (greedy) |
| LLM, llama3.1:8b | no-canaries | 0.1% | 100.0% | 0.7% | 100.0% / 100.0% / 100.0% | lies even when alone (greedy) |
| LLM, llama3.1:8b | no-canaries + channel | 0.1% | 100.0% | 0.7% | 100.0% / 100.0% / 100.0% | lies even when alone (greedy) |

Sources: `entry-a/2-scripted-small/results.md`, `entry-a/3-greedy-small/results.md`, `entry-a/5-llm-cartel/results.md`.

- **The LLM cartel played greedy.** All 482 of its decisions were lies, including all 50 on canary items. It got 0.1% of
  wrong answers accepted, against 0.8% for the scripted unanimous cartel, and every member was revoked, against 1.9%.
- **It understood unanimity when it saw it, but didn't plan for it.** Holding all three copies, a member reasoned "All
  three of us will agree, so the item will be accepted without further checks." But members held all three copies only
  3 times per condition, against 103 times holding one, and lied in every case. Typical reasons when alone: "I don't
  know the other two workers' answers, so I'll play it safe and give the cartel's wrong answer to increase the chances
  of it being accepted." The model treated lying as the safe choice.
- **The private channel changed words, not actions.** Every "+ channel" row equals its row without the channel, and
  the decision counts are identical. Reasons with the channel spoke for the group ("We need to keep our answers
  consistent to avoid raising suspicions."), but the model lied every time either way. The notes members left on the
  board, recorded with each reply in `llm-cache.jsonl`, were encouragement and mutual watching: the most common were
  "Sticking to the plan", "Keep an eye on worker 1's answer, see if they're playing along" and "Let's keep our answers
  consistent, guys." Among the most common notes, none proposed holding back when alone. (`analysis/decision-counts.txt`)
- **Removing canaries didn't help this cartel.** It was still entirely revoked, with 0.1% wrong accepted, because
  lying alone creates disagreements and the dispute panels catch those. Honest workers revoked went from 0.0% to 0.7%;
  with 3 seeds we don't read this as an effect.
- **The fix had nothing to fix.** With 30% canaries, the LLM cartel's results were unchanged: 0.1% wrong accepted,
  100.0% revoked, 0.0% honest revoked (`entry-a/6-llm-fix-canaries-30/results.md`). Against the scripted cartel at the
  same size, 30% canaries raised the cartel revoked from 1.9% to 5.3% but left wrong answers accepted at 0.8%, with 0.0%
  honest workers revoked (`entry-a/7-scripted-fix-canaries-30/results.md`). In 10 epochs, more canaries catch a few more
  members but not the damage they've already done.
- **The larger model played the same way.** qwen2.5:14b lied at 100.0% when holding one or two copies, never held all
  three, got 0.0% wrong answers accepted and was entirely revoked, with and without the channel, over 1 seed
  (`entry-a/8-llm-cartel-second-model/results.md`).
- **Every model reply was usable.** 0 calls had no usable reply in any LLM step.

## 5. The ward example, worked out

`ward-milk.ts` computes the smell check exactly, under assumed rates: each person says "off" 60% of the time when the
milk is off and 5% when it isn't, and "can't tell" 20% of the time either way. **These rates are made-up illustrations,
not measurements.** Under them, a majority of all three serves off milk 53.0% of the time and throws away good milk 0.5%
of the time; a majority of those who answered, 47.2% and 0.9%; and any one flag, the turnstile's rule, 14.1% and 11.5%
(`entry-a/4-ward-milk/ward-milk.md`). Under a majority vote, the ward's actual three answers serve the milk. Under the
one-flag rule, it is checked. The extra good milk thrown away is the turnstile's recomputation cost.

## 6. Discussion

**What it means.** The turnstile was tuned against a scripted cartel that plays the worst case it knows: lie only when
unanimous. Given the same information as a real worker, two small open models did not find that strategy. They lied
every time, which the turnstile's disagreement checks handle easily, and they ended up doing less damage than the script
and losing every member. For this design, against attackers of this strength, the scripted results are the pessimistic
bound, not the expected case.

This is not for lack of information: the prompt states that agreeing answers are accepted unchecked, and tells each
member how many of the item's three workers are in the cartel. The reasons suggest why. The models mostly framed lying as the cooperative, low-risk move ("play it safe and give the
cartel's wrong answer"), not as something whose risk depends on who else holds the item. The unanimous strategy requires
seeing that a lone lie *creates* the disagreement that gets it caught. The models recognised the good case when it
arrived but never inferred the corollary, to keep quiet in the bad ones.

**What it doesn't show.** It doesn't show that adaptive attackers are harmless. These are small local models at
temperature 0, deciding one item at a time with no memory across epochs beyond their strike count. A frontier model,
a model allowed to reflect between epochs, or one told the strategy explicitly may well play unanimous, and then the
scripted results apply: 0.8% of wrong answers accepted at this size, mostly caught by nothing but canaries. The sample is
small: 3 seeds for the main model and 1 for the second, at a reduced size of 60 workers and 10 epochs. The channel null
result means only that the channel didn't change behaviour when behaviour was already saturated at "always lie".

**What to try next.**
1. Run the same conditions on frontier models, which the scripts support with one setting.
2. Give the cartel memory across epochs, such as a summary of which members were revoked and when, so it can learn
   that lone lies get caught.
3. Record channel notes in the decision log, not only in the model cache, and analyse all of them, to see whether any
   member ever proposes a better strategy that the others ignore.
4. If any model plays unanimous, rerun the fix with canaries aimed at workers who are often assigned together.

## References

Hammond, L., et al. (2025). *Multi-Agent Risks from Advanced AI.* Cooperative AI Foundation Technical Report.

Motwani, S. R., et al. (2024). *Secret Collusion among AI Agents: Multi-Agent Deception via Steganography.* NeurIPS 2024.

## Appendix: Limitations and Dual-Use / Ethical Considerations

**Limitations.**
- **Small local models.** The cartels were played by llama3.1:8b and qwen2.5:14b, not frontier models. Stronger
  models may find the unanimous strategy or something new, and these results don't predict that.
- **A simulation, with the rules given.** Entry A is a seeded simulation of the turnstile, not a live system. The cartel
  is told the published rules, on the assumption that real attackers would read the design; real attackers may know more,
  such as how assignment is seeded, or less.
- **Small samples.** 3 seeds per condition for llama3.1:8b and 1 for qwen2.5:14b, at a reduced size (60 workers, 10
  epochs). Differences such as honest workers revoked (0.0% against 0.7%) are within what a few seeds can produce.
- **Deterministic model.** Temperature 0, so each prompt has one answer. Randomness comes only from the simulation's seed.
- **Illustrative ward rates.** The ward milk example's detection rates are made-up illustrations, not measurements.

**Dual-use.** This work studies an attack: collusion against a work-checking system. We describe the strategies only as
far as needed to reproduce the results; the unanimous strategy is already described in the pre-existing design document.
We publish no ready-to-use prompts for attacking other systems, and all data is synthetic, generated by the simulation.
The defences tested, canaries and dispute panels, are published alongside the attack. A null result like ours could be
misread as "LLM collusion is not a threat". It shows only that these small models didn't find this strategy here.

## Appendix: Reproducing this

- **Code:** https://github.com/aeriellag87-arch/swarm-alignment-2026, folder `experiment/swarm-2026/`. The run was made
  from commit `28a91362` of the original codebase; this repository holds the same files. The run's own copy of the experiment code is in `code/`.
- **Command:** `OLLAMA_MODEL=llama3.1:8b SECOND_MODEL=qwen2.5:14b SEEDS=3 experiment/swarm-2026/run-all.sh`, with Ollama
  running and both models pulled. Each step's exact command, time and result is in `steps.md`, and each step's log in
  `logs/`.
- **Raw data:** `experiment/swarm-2026/runs/20261107T1647Z/entry-a/`: `results.md`, `results.json` and `decisions.jsonl`
  per step, and `llm-cache.jsonl` with every model answer, so a rerun gives the same numbers without calling the model.
- **Environment:** `ENVIRONMENT.md` (versions, GPU, models) and `CHANGES.md` (setup changes; no experiment code was
  changed).
