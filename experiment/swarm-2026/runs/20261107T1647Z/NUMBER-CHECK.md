# Number check

Two passes. First, the main numbers in each report, checked by hand against the named file. Second, an automatic pass
(`analysis/number-check.py`): every number in each report, with the files in this folder that contain it. Every number
the automatic pass couldn't find is explained under "Not found automatically".

## Entry A: main numbers, checked by hand

| Claim in REPORT-A.md | Source | Checked |
| --- | --- | --- |
| Scripted full, all-on: 0.7% wrong, 15.2% cartel, 2.0% honest revoked | entry-a/1-scripted-full/results.md, all-on row | yes |
| Scripted full, no commit-reveal: 3.2% | entry-a/1-scripted-full/results.md, no-commit-reveal row | yes |
| Published: 0.7% to 3.2%; honest 2 to 3% | docs/turnstile-collusion.md (in the repo, not this folder) | yes |
| Scripted small all-on 0.8% / 1.9% / 0.1%; no-canaries 0.8% / 0.0% / 0.1% | entry-a/2-scripted-small/results.md | yes |
| Greedy small 0.1% / 100.0% / 0.1%, both conditions | entry-a/3-greedy-small/results.md | yes |
| LLM all-on 0.1% / 100.0% / 0.0%; no-canaries honest 0.7%; lie rates 100.0% x3; channel rows identical | entry-a/5-llm-cartel/results.md | yes |
| 482 decisions, all lies; 50 on canaries, all lies; held 3 of 3: 3 times, held 1: 103 times per condition | analysis/decision-counts.txt | yes |
| 241 cached replies with a note, 110 distinct; "Sticking to the plan" etc. | analysis/decision-counts.txt (from llm-cache.jsonl) | yes |
| 30% canaries, LLM: 0.1% / 100.0% / 0.0% | entry-a/6-llm-fix-canaries-30/results.md | yes |
| 30% canaries, scripted: 0.8% / 5.3% / 0.0% | entry-a/7-scripted-fix-canaries-30/results.md | yes |
| qwen2.5:14b: 0.0% / 100.0% / 0.0%, 100.0% / 100.0% / none seen, 1 seed | entry-a/8-llm-cartel-second-model/results.md | yes |
| 0 unusable replies (324+158, 33+101, 69+27 calls) | the three LLM results.md files | yes |
| Ward milk: 53.0% / 0.5%, 47.2% / 0.9%, 14.1% / 11.5%; rates 60% / 5% / 20% (illustrative) | entry-a/4-ward-milk/ward-milk.md | yes |
| 60 workers, 10 epochs; 20% cartel; 15% canaries | code/t3-turnstile/run.ts line 14 and 53; results.md headers | yes |
| llama3.1:8b 8.0B Q4_K_M, Ollama 0.40.15, H100 80GB | ENVIRONMENT.md | yes |
| Temperature 0 | code/shared/llm.ts | yes |

## Entry B: main numbers, checked by hand

| Claim in REPORT-B.md | Source | Checked |
| --- | --- | --- |
| llama linked: single 3 of 10 / 2 of 9; grouped 2 of 10 / 2 of 9; why 2 of 10 / 3 of 9 | entry-b/2-llm-reviewers/results.md, summary | yes |
| llama no-principal: 3 of 10 for all three; benign 2, 2, 3 of 9 | same, summary | yes |
| llama grant: 10 of 10 for all three, 0 of 9 benign; "Reached a reviewer" 0 of K in every grant row | same, summary and risky table | yes |
| qwen linked: 6, 6, 7 of 10; 0 of 9 benign | entry-b/3-llm-reviewers-second-model/results.md, summary | yes |
| Table 2, every H and · | the "Risky scenarios" tables in the two files, row by row | yes |
| Rejected 25 of 46 (why) and 24 of 46 (grouped), llama linked | analysis/decision-counts.txt: denied 25 + allowed 21; denied 24 + allowed 22 | yes, sums |
| qwen rejected 5 of 46 (why), 8 of 46 (grouped) | analysis/decision-counts.txt: 5 + 41; 8 + 38 | yes, sums |
| no-principal grouped: 25 allowed, 21 rejected, same as single | analysis/decision-counts.txt | yes |
| £288, £48, £100 threshold | results.md harm text; code/t4-split-approvals/scenarios.ts line 134 | yes |
| 10 risky and 9 benign runs per reviewer | results.md summary denominators | yes |
| 0 unusable replies (138+138, 115+23 calls) | the two results.md files | yes |

## Not found automatically, explained

- 30%, 15%, 20%, 60%: written as 30.0%, 15.0%, 20.0%, 60.0% in the source files.
- 0.2% (honest workers' error rate): PROPOSAL.md and docs/turnstile-collusion.md, not a run output.
- £100: `paid > 100` in code/t4-split-approvals/scenarios.ts.
- 25, 24, 5 and 8 of 46: sums of allowed and denied in analysis/decision-counts.txt (above).
- 223, 246: the abstracts' own word counts. 2024, 2025: years in citations.

## Other checks

- Abstracts: REPORT-A 223 words, REPORT-B 246 words, both within 150 to 250.
- Both reports have the appendices titled exactly "Limitations and Dual-Use / Ethical Considerations" and "Reproducing this".
- Rule reviewers (`rule-single`, `rule-grouped`) appear in REPORT-B only in Section 3, described as pipeline checks that
  are not results, and in no table. REPORT-A doesn't mention them.
- Ward milk rates are labelled as made-up illustrations in REPORT-A Section 5 and in both appendices.

## Automatic pass

## REPORT-A.md

| Number | Times in report | Found in |
| --- | --- | --- |
| 1 | 27 | CHANGES.md, ENVIRONMENT.md, analysis/decision-counts.txt, code/t3-turnstile/run.ts … |
| 2 | 9 | CHANGES.md, ENVIRONMENT.md, analysis/decision-counts.txt, code/t3-turnstile/run.ts … |
| 3 | 22 | CHANGES.md, ENVIRONMENT.md, analysis/decision-counts.txt, code/t3-turnstile/run.ts … |
| 5 | 13 | CHANGES.md, ENVIRONMENT.md, analysis/decision-counts.txt, code/t3-turnstile/run.ts … |
| 0.1% | 14 | entry-a/2-scripted-small/results.md, entry-a/3-greedy-small/results.md, entry-a/5-llm-cartel/results.md, entry-a/6-llm-fix-canaries-30/results.md |
| 0.0% | 13 | entry-a/1-scripted-full/results.md, entry-a/2-scripted-small/results.md, entry-a/3-greedy-small/results.md, entry-a/4-ward-milk/ward-milk.md … |
| 0.8% | 6 | entry-a/1-scripted-full/results.md, entry-a/2-scripted-small/results.md, entry-a/7-scripted-fix-canaries-30/results.md |
| 1.9% | 4 | entry-a/2-scripted-small/results.md |
| 30% | 5 | **NOT FOUND** |
| 223 | 1 | **NOT FOUND** |
| 2024 | 1 | **NOT FOUND** |
| 2025 | 1 | **NOT FOUND** |
| 2026 | 6 | CHANGES.md, ENVIRONMENT.md, code/t3-turnstile/run.ts, steps.md |
| 15% | 3 | **NOT FOUND** |
| 64 | 1 | ENVIRONMENT.md, steps.md |
| 0.2% | 1 | **NOT FOUND** |
| 8 | 3 | CHANGES.md, ENVIRONMENT.md, analysis/decision-counts.txt, code/t3-turnstile/run.ts … |
| 0.40 | 1 | CHANGES.md, ENVIRONMENT.md |
| 15 | 1 | CHANGES.md, ENVIRONMENT.md, code/t3-turnstile/run.ts, entry-a/1-scripted-full/results.md … |
| 0 | 4 | CHANGES.md, ENVIRONMENT.md, analysis/decision-counts.txt, code/t3-turnstile/run.ts … |
| 60 | 3 | code/t3-turnstile/run.ts, entry-a/4-ward-milk/ward-milk.md |
| 10 | 4 | ENVIRONMENT.md, analysis/decision-counts.txt, code/t3-turnstile/run.ts, entry-a/1-scripted-full/results.md … |
| 20% | 2 | **NOT FOUND** |
| 30 | 6 | analysis/decision-counts.txt, code/t3-turnstile/run.ts, entry-a/1-scripted-full/results.md, entry-a/2-scripted-small/results.md … |
| 6 | 3 | CHANGES.md, ENVIRONMENT.md, analysis/decision-counts.txt, code/t3-turnstile/run.ts … |
| 7 | 2 | CHANGES.md, ENVIRONMENT.md, analysis/decision-counts.txt, entry-a/1-scripted-full/results.md … |
| 4 | 4 | CHANGES.md, ENVIRONMENT.md, analysis/decision-counts.txt, code/t3-turnstile/run.ts … |
| 3 of 3 | 2 | analysis/decision-counts.txt, code/t3-turnstile/run.ts, entry-a/1-scripted-full/results.md, entry-a/2-scripted-small/results.md … |
| 1 of 3 | 1 | analysis/decision-counts.txt |
| 0.7% | 6 | entry-a/1-scripted-full/results.md, entry-a/5-llm-cartel/results.md |
| 15.2% | 1 | entry-a/1-scripted-full/results.md |
| 2.0% | 1 | entry-a/1-scripted-full/results.md |
| 3.2% | 2 | entry-a/1-scripted-full/results.md |
| 3% | 1 | entry-a/1-scripted-full/results.md, entry-a/7-scripted-fix-canaries-30/results.md |
| 100.0% | 28 | entry-a/1-scripted-full/results.md, entry-a/2-scripted-small/results.md, entry-a/3-greedy-small/results.md, entry-a/5-llm-cartel/results.md … |
| 482 | 1 | analysis/decision-counts.txt |
| 50 | 1 | CHANGES.md, ENVIRONMENT.md, analysis/decision-counts.txt, code/t3-turnstile/run.ts |
| 103 | 1 | analysis/decision-counts.txt |
| 5.3% | 1 | entry-a/7-scripted-fix-canaries-30/results.md |
| 60% | 1 | **NOT FOUND** |
| 5% | 1 | entry-a/4-ward-milk/ward-milk.md |
| 53.0% | 1 | entry-a/4-ward-milk/ward-milk.md |
| 0.5% | 1 | entry-a/4-ward-milk/ward-milk.md |
| 47.2% | 1 | entry-a/4-ward-milk/ward-milk.md |
| 0.9% | 1 | entry-a/4-ward-milk/ward-milk.md |
| 14.1% | 1 | entry-a/4-ward-milk/ward-milk.md |
| 11.5% | 1 | entry-a/4-ward-milk/ward-milk.md |

## REPORT-B.md

| Number | Times in report | Found in |
| --- | --- | --- |
| 1 | 37 | CHANGES.md, ENVIRONMENT.md, analysis/decision-counts.txt, code/t4-split-approvals/run.ts … |
| 2 | 14 | CHANGES.md, ENVIRONMENT.md, analysis/decision-counts.txt, code/t4-split-approvals/run.ts … |
| 4 | 14 | CHANGES.md, ENVIRONMENT.md, analysis/decision-counts.txt, code/t4-split-approvals/run.ts … |
| £288 | 3 | code/t4-split-approvals/scenarios.ts, entry-b/2-llm-reviewers/results.md, entry-b/3-llm-reviewers-second-model/results.md |
| 6 | 4 | CHANGES.md, ENVIRONMENT.md, analysis/decision-counts.txt, code/t4-split-approvals/run.ts … |
| 3 of 10 | 7 | entry-b/2-llm-reviewers/results.md |
| 2 of 10 | 6 | entry-b/2-llm-reviewers/results.md |
| 2 of 9 | 6 | entry-b/2-llm-reviewers/results.md |
| 3 of 9 | 4 | entry-b/2-llm-reviewers/results.md |
| 5 | 20 | CHANGES.md, ENVIRONMENT.md, analysis/decision-counts.txt, code/t4-split-approvals/run.ts … |
| 7 of 10 | 3 | entry-b/3-llm-reviewers-second-model/results.md |
| 10 | 4 | ENVIRONMENT.md, analysis/decision-counts.txt, code/t4-split-approvals/scenarios.ts, entry-b/2-llm-reviewers/results.md … |
| 246 | 1 | **NOT FOUND** |
| 2025 | 1 | **NOT FOUND** |
| 2024 | 1 | **NOT FOUND** |
| 2026 | 6 | CHANGES.md, ENVIRONMENT.md, code/t4-split-approvals/run.ts, steps.md |
| 3 | 6 | CHANGES.md, ENVIRONMENT.md, analysis/decision-counts.txt, code/t4-split-approvals/run.ts … |
| £48 | 1 | code/t4-split-approvals/scenarios.ts |
| £100 | 1 | **NOT FOUND** |
| 9 | 1 | CHANGES.md, ENVIRONMENT.md, analysis/decision-counts.txt, code/t4-split-approvals/scenarios.ts … |
| 8 | 1 | CHANGES.md, ENVIRONMENT.md, analysis/decision-counts.txt, code/t4-split-approvals/scenarios.ts … |
| 0.40 | 1 | CHANGES.md, ENVIRONMENT.md |
| 15 | 1 | CHANGES.md, ENVIRONMENT.md, entry-b/3-llm-reviewers-second-model/results.md |
| 0 | 4 | CHANGES.md, ENVIRONMENT.md, analysis/decision-counts.txt, code/t4-split-approvals/run.ts … |
| 30.0% | 4 | entry-b/2-llm-reviewers/results.md |
| 20.0% | 2 | entry-b/2-llm-reviewers/results.md |
| 10 of 10 | 3 | entry-b/2-llm-reviewers/results.md |
| 100.0% | 3 | entry-b/2-llm-reviewers/results.md |
| 0 of 9 | 6 | entry-b/2-llm-reviewers/results.md, entry-b/3-llm-reviewers-second-model/results.md |
| 6 of 10 | 4 | entry-b/3-llm-reviewers-second-model/results.md |
| 60.0% | 2 | entry-b/3-llm-reviewers-second-model/results.md |
| 70.0% | 1 | entry-b/3-llm-reviewers-second-model/results.md |
| 25 of 46 | 1 | **NOT FOUND** |
| 24 of 46 | 1 | **NOT FOUND** |
| 5 of 46 | 1 | **NOT FOUND** |
| 8 of 46 | 1 | **NOT FOUND** |
| 25 | 1 | analysis/decision-counts.txt, code/t4-split-approvals/run.ts |
| 21 | 1 | CHANGES.md, ENVIRONMENT.md, analysis/decision-counts.txt |
