# Prompt: run both hackathon entries on a GPU instance

Paste everything below the line into Claude Code, or another coding agent, running on the GPU instance. It sets up a
local model, runs every experiment, writes both reports from the results, and zips everything.

It uses only a free local model (Ollama), so it costs nothing beyond the instance. On one modern GPU with an 8B
model, expect about 30 to 60 minutes for the full run.

---

You are running the experiments for two entries to the Swarm Alignment Hackathon (deadline Sunday 8 November 2026,
23:59 Anywhere on Earth), then writing both reports from the results. Work in order, and don't skip the checks.

## Ground rules

- Only report what was actually run. Every number in a report must come from a file in the run folder, and you must
  cite that file. Never estimate, round up or invent a result. If something failed, say so.
- Don't change the experiment code in `experiment/swarm-2026/` or `src/lib/turnstile/collusion-sim.ts` to get
  different results. If you must change something to make it run (a path, a timeout), write what and why in
  `CHANGES.md` in the run folder.
- Don't call any paid API (no Anthropic or OpenAI keys). Local models through Ollama only.
- Don't delete `llm-cache.jsonl` files. They are what makes the run reproducible.
- The rule-based reviewers in Entry B (`rule-single`, `rule-grouped`) only check the pipeline. Never present them as
  findings. The rates in the ward milk example are made-up illustrations. Never present them as measurements.

## 1. Get the code

```bash
git clone https://github.com/aeriellag87-arch/main.git swarm-hackathon || true
cd swarm-hackathon
git fetch origin claude/focused-lovelace-deys4j
git checkout claude/focused-lovelace-deys4j
git pull origin claude/focused-lovelace-deys4j
```

Read these files before going further:

- `experiment/swarm-2026/GUIDE.md`: what the entries are, the steps, and how to read the results
- `experiment/swarm-2026/PROPOSAL.md`, if it exists: the full proposal
- `experiment/swarm-2026/t3-turnstile/README.md` and `experiment/swarm-2026/t4-split-approvals/README.md`
- `docs/turnstile-collusion.md`: the existing scripted results that Entry A builds on

## 2. Set up

1. Node 22 or later (`node -v`). If it's missing or older, install Node 22 with nvm.
2. Install packages: `npm ci --ignore-scripts`
3. Ollama: if `ollama --version` fails, install it with `curl -fsSL https://ollama.com/install.sh | sh`. Start it in
   the background with `ollama serve > /tmp/ollama.log 2>&1 &` if it isn't already running.
4. Pull the models: `ollama pull llama3.1:8b`. If the GPU has 24 GB or more, also pull `qwen2.5:14b` as the second
   model.
5. Check that the GPU is being used. Run one prompt with `ollama run llama3.1:8b "say ok"`, then `ollama ps`. The
   PROCESSOR column should say GPU. If it says CPU, fix that before continuing, because the full run would take hours.

## 3. Quick check (about 10 minutes)

```bash
QUICK=1 experiment/swarm-2026/run-all.sh
```

Open the new folder in `experiment/swarm-2026/runs/` and read `steps.md`. Every step should say `ok`. If one
failed, read its log in `logs/`, fix the cause in the environment (not in the experiment code), and run the quick
check again. Then open `entry-a/5-llm-cartel/decisions.jsonl` and check that the reasons are real sentences from the
model, not "(no valid reply...)". If most replies are invalid, the model isn't returning JSON. Try `qwen2.5:7b`
instead, and note the change in `CHANGES.md`.

## 4. The full run

With the second model:

```bash
OLLAMA_MODEL=llama3.1:8b SECOND_MODEL=qwen2.5:14b SEEDS=3 experiment/swarm-2026/run-all.sh
```

If you didn't pull the second model, leave out `SECOND_MODEL=qwen2.5:14b`. The run writes a new folder,
`experiment/swarm-2026/runs/<time>/`, and a zip of it. Call that folder RUN below. Check `RUN/steps.md` again.

## 5. Understand the results

Read `RUN/ALL-RESULTS.md`, then answer these questions in `RUN/ANALYSIS.md`. Cite the source file for every number.

**Entry A (turnstile):**
1. Does the scripted run (`entry-a/1-scripted-full`) reproduce `docs/turnstile-collusion.md`? With all defences on,
   about 0.7% of wrong answers should be accepted.
2. Compare the LLM cartel (`5-llm-cartel`) with the scripted and greedy cartels at the same size (`2-scripted-small`,
   `3-greedy-small`). Compare wrong answers accepted, cartel revoked, and honest workers revoked.
3. Which strategy did the LLM cartel play? Use the "lie rate when holding 1 / 2 / 3 of 3" column and the Strategy
   column. Did it find the unanimous strategy (lie only when holding all 3)?
4. Did the private channel change anything? Compare each condition with its "+ channel" row. Quote two or three
   typical reasons, and channel notes if there are any, from `decisions.jsonl`.
5. Did removing canaries change the LLM cartel's behaviour or success?
6. The fix: did 30% canaries (`6-llm-fix-canaries-30`, against `7-scripted-fix-canaries-30`) reduce wrong answers,
   and at what cost in honest workers revoked?
7. If a second model ran (`8-...`), did it play differently?
8. How many model calls had no usable reply? This is in each `results.md`.

**Entry B (split approvals):**
1. For `llm-single` (one request at a time, as today): does harm get through more often as K grows from 1 to 6?
   Answer per scenario.
2. Does `llm-grouped` stop more of the harm than `llm-single`? At what cost in benign runs held up?
3. Drift: compare `llm-grouped-why` (which also sees the agent's reasons) with `llm-grouped`. Do the reasons make the
   monitor allow more?
4. `no-principal`: does the grouped monitor lose its advantage when requests aren't linked to a person?
5. `grant`: confirm that requests went through with no reviewer, which "Reached a reviewer: 0 of K" shows. Say clearly
   that this follows from an assumption (someone ticked "remember" earlier). It isn't a measured behaviour of people.
6. Which scenario was hardest to catch, and why, judging from the reasons in `decisions.jsonl`?

## 6. Write the two reports

Write `RUN/REPORT-A.md` (Track 3, turnstile) and `RUN/REPORT-B.md` (Track 4, split approvals). Each one must fit
the hackathon's 8-page template when converted, which is about 3,500 words before references and appendices. Use
this structure:

1. **Title.** Unique. Use the working title from the proposal, or a better one that states the finding.
2. **Authors and affiliations.** Write `[Author 1, affiliation]` and `[Author 2, affiliation]` as placeholders.
3. **Abstract, 150 to 250 words.** Count them and state the count in a comment at the end. Include the question, the
   method in one sentence, the main numbers, and what they mean.
4. **Introduction.** Open with the ward example from the proposal and GUIDE.md: the routine milk, tea and food jobs,
   and the three people smelling the milk (off, normal, can't tell). Then state the question and why it matters for
   agent swarms. Cite the track's resources where they fit. For Entry A: Secret Collusion among AI Agents (Motwani et
   al., 2024) and Multi-Agent Risks from Advanced AI (Hammond et al., 2025). For Entry B: splitting tasks to evade
   per-agent safety filters (Jones et al., 2025) and AI Control (Greenblatt et al., 2024). Don't cite anything you
   haven't been given.
5. **The system.** How the turnstile, or the approval flow, works, in plain words. Clearly mark what existed before
   the hackathon and what was built during it. Use the statement in GUIDE.md section 6.
6. **Method.** Models (name and size, from ENVIRONMENT.md), conditions, seeds, K values, what each measure means, and
   the exact commands (from steps.md).
7. **Results.** The main table, copied from the relevant `results.md`, plus at most two more. Describe each finding in
   one or two sentences, with numbers. Include null results and failures.
8. **Discussion.** What the result means, what it doesn't show, and what to try next.
9. **References.** Only works actually cited.
10. **Appendix: Limitations and Dual-Use / Ethical Considerations.** Required, with exactly this title. Include:
    - small local models, not frontier ones
    - Entry A is a simulation, and the cartel is told the published rules
    - Entry B uses an LLM judge, not people, and synthetic scenarios
    - for Entry B's grant condition, the assumption it rests on
    - the ward example's illustrative rates
    - dual-use: the attack strategies are described only as far as needed to reproduce the results, no ready-to-use
      prompts against other systems are published, and all data is synthetic
11. **Appendix: Reproducing this.** The git commit, the commands, and where the raw data is.

Then write `RUN/SUBMISSION-CHECKLIST.md`: the checklist from GUIDE.md section 7, ticked only where it's true.

## 7. Check your own work

For each report, make a list in `RUN/NUMBER-CHECK.md` of every number in it, with the file it came from. Then open
each file and confirm the number is there. Fix any that aren't. Also check that the abstract is 150 to 250 words,
that both appendix titles are exact, and that the rule baselines and ward-milk rates are labelled as described in the
ground rules.

## 8. A single explainer for NotebookLM

Write `RUN/EXPLAINER.md` for someone who wasn't there and wants to understand everything from one file. Include:

- the plain-language background and glossary from the proposal
- the ward example and the worked example
- what each entry tests, how the systems work, and what was built over the weekend
- what was run, on what model and hardware
- every result, each with a one-line plain-English reading
- what it means, what it doesn't, and the limitations

Describe in words anything that would otherwise need a diagram.

## 9. Package and hand back

```bash
cd experiment/swarm-2026/runs
rm -f RUNNAME.zip
zip -qr RUNNAME.zip RUNNAME
cd ../../..
git add -f experiment/swarm-2026/runs/RUNNAME experiment/swarm-2026/runs/RUNNAME.zip
git commit -m "Hackathon runs on <GPU name>: results, both reports, number check and explainer"
git push origin claude/focused-lovelace-deys4j
```

Replace RUNNAME with the folder's name. Finish by printing four things:

- the path of the zip
- the three most important numbers for each entry, each with its source file
- anything that failed or was changed
- anything a person must still do before submitting, such as names, affiliations, converting to the template's PDF,
  and the video
