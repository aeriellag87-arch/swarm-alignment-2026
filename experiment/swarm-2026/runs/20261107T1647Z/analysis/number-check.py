# For each number in REPORT-A.md and REPORT-B.md, list the source files in this run folder that contain it.
import re, os, sys, glob
base = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
srcs = {
 "A": ["entry-a/*/results.md", "entry-a/4-ward-milk/ward-milk.md", "analysis/decision-counts.txt", "ENVIRONMENT.md", "steps.md", "code/t3-turnstile/run.ts", "CHANGES.md"],
 "B": ["entry-b/2-llm-reviewers/results.md", "entry-b/3-llm-reviewers-second-model/results.md", "analysis/decision-counts.txt", "ENVIRONMENT.md", "steps.md", "code/t4-split-approvals/scenarios.ts", "code/t4-split-approvals/run.ts", "CHANGES.md"],
}
pat = re.compile(r"£\d+|\d+(?:\.\d+)?%|\d+ of \d+|\b\d+(?:\.\d+)?\b")
for entry in "AB":
    files = sorted({f for g in srcs[entry] for f in glob.glob(os.path.join(base, g))})
    texts = {os.path.relpath(f, base): open(f).read() for f in files}
    report = open(os.path.join(base, f"REPORT-{entry}.md")).read()
    report = report.split("## References")[0] + "\n" + report.split("## Appendix: Limitations")[1] if "## Appendix: Limitations" in report else report
    seen = {}
    for m in pat.finditer(report):
        seen.setdefault(m.group(0), 0); seen[m.group(0)] += 1
    print(f"\n## REPORT-{entry}.md\n\n| Number | Times in report | Found in |\n| --- | --- | --- |")
    for n in seen:
        where = [f for f, t in texts.items() if n in t]
        print(f"| {n} | {seen[n]} | {', '.join(where[:4]) + (' …' if len(where) > 4 else '') if where else '**NOT FOUND**'} |")
