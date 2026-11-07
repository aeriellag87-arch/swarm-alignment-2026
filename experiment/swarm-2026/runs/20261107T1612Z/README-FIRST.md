# Read this first

This zip holds both hackathon entries: the full proposal and write-up, the guide, the code, and every result that can
be produced **without a language model**. These were run on 7 November 2026, in a cloud container with no GPU.

**Not in this zip yet: the LLM results.** The main result of each entry needs a model: the LLM cartel for Entry A,
and the LLM reviewers for Entry B. Those runs happen on the GPU instance. To produce them, paste `GPU-PROMPT.md` into a
coding agent on that machine. It writes a new zip like this one, with the LLM results, both finished reports, a check
of every number, and an explainer.

## What's here

| File or folder | What it is |
| --- | --- |
| `PROPOSAL.md` and `PROPOSAL.pdf` | The full write-up: background, glossary, the ward example, the worked example, both entries in full, how to run them, draft abstracts and appendices, and likely judge questions. The PDF has the diagrams; the markdown describes each diagram in words. Feed either to NotebookLM. |
| `GUIDE.md` | Step-by-step: setup, commands, timeline, report outline, submission checklist and video scripts |
| `GPU-PROMPT.md` | The prompt for the GPU instance |
| `ALL-RESULTS.md` | Every result table from this run, in one file |
| `ENVIRONMENT.md`, `steps.md`, `logs/` | How the run was made: commit, versions, each command, its time and its output |
| `entry-a/` | Turnstile results: scripted cartel, full size and small size; greedy cartel; the ward milk example |
| `entry-b/` | Approval-flow pipeline check, with rule reviewers under all four conditions |
| `code/` | The experiment code, as it was when this ran |
| `run-all.sh` | The script that produced all of this |

## What these model-free results show

**Entry A.**
- The scripted cartel reproduces the published results. With every defence on, 0.7% of wrong answers are accepted.
  Without commit-reveal it's 3.2%. Source: `entry-a/1-scripted-full/results.md`.
- A greedy cartel, which lies every time, gets only 0.1% accepted, and every member is revoked. The unanimous
  strategy, lying only when holding all 3 copies, gets 0.8% at the same small size, and only 1.9% of its members are
  revoked. Sources: `entry-a/3-greedy-small/results.md` and `entry-a/2-scripted-small/results.md`.
- So the defences beat a naive attacker. The open question for the LLM run is whether a model finds the unanimous
  strategy for itself.

**The ward milk example.** With today's three answers (off, normal, can't tell), a majority vote serves the milk, and
the turnstile's one-flag rule checks it. The percentages use made-up detection rates, as illustrations only. Source:
`entry-a/4-ward-milk/ward-milk.md`.

**Entry B.** The rule reviewers read hidden tags, so these results only show the pipeline works. They aren't
findings. They do confirm two facts about the approval code:
- With a remembered grant, every split request goes through with no reviewer at all: harm in 10 of 10 risky runs.
- With no principal named, grouping is lost: the grouped rule falls from 0 of 10 to 5 of 10.

Source: `entry-b/1-rule-pipeline/results.md`.
