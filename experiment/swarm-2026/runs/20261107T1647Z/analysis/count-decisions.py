# Counts from the decisions.jsonl files, for numbers in ANALYSIS.md and the reports that aren't in a results.md.
# Run from the run folder: python3 count-decisions.py > decision-counts.txt (from inside analysis/, paths are ../)
import json, collections, os
base = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
def load(p): return [json.loads(l) for l in open(os.path.join(base, p))]
for f in ["entry-a/5-llm-cartel/decisions.jsonl", "entry-a/6-llm-fix-canaries-30/decisions.jsonl", "entry-a/8-llm-cartel-second-model/decisions.jsonl"]:
    a = load(f)
    print(f"== {f}: {len(a)} decisions, {sum(d['lie'] for d in a)} lies")
    for k, v in sorted(collections.Counter((d["condition"], "channel" if d["channel"] else "no channel", f"held {d['held']} of 3", "lie" if d["lie"] else "truth") for d in a).items()):
        print("  ", " | ".join(k), ":", v)
    can = [d for d in a if d["canary"]]
    print(f"   on canary items: {len(can)} decisions, {sum(d['lie'] for d in can)} lies")
    print(f"   distinct reasons: {len(set(d['reason'] for d in a))}")
for f in ["entry-b/2-llm-reviewers/decisions.jsonl", "entry-b/3-llm-reviewers-second-model/decisions.jsonl"]:
    b = [d for d in load(f) if d["reviewer"].startswith("llm")]
    print(f"== {f}: {len(b)} LLM-reviewer request records")
    for k, v in sorted(collections.Counter((d["condition"], d["reviewer"], "reviewed" if d["reviewed"] else "no reviewer", d["status"]) for d in b).items()):
        print("  ", " | ".join(k), ":", v)

# Channel notes: run.ts doesn't put them in decisions.jsonl, but each model reply is in llm-cache.jsonl.
import re
for f in ["entry-a/5-llm-cartel/llm-cache.jsonl", "entry-a/8-llm-cartel-second-model/llm-cache.jsonl"]:
    notes = []
    for l in open(os.path.join(base, f)):
        e = json.loads(l)
        txt = json.dumps(e)
        for m in re.finditer(r'\\"note\\":\s*\\"(.*?)\\"', txt):
            if m.group(1).strip(): notes.append(m.group(1))
    c = collections.Counter(notes)
    print(f"== {f}: {len(notes)} non-empty channel notes, {len(c)} distinct; most common:")
    for n, v in c.most_common(8): print(f"   {v} x {n}")
