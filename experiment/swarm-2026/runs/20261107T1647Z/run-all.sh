#!/usr/bin/env bash
# Runs every experiment for both hackathon entries, records how it was run, and zips the lot.
#
#   experiment/swarm-2026/run-all.sh
#
# Settings (environment variables):
#   OLLAMA_URL     where Ollama listens (default http://127.0.0.1:11434)
#   OLLAMA_MODEL   the main model (default llama3.1:8b)
#   SECOND_MODEL   optional second model, run on a smaller subset to compare (e.g. qwen2.5:14b); empty = skip
#   SEEDS          seeds per condition for the LLM cartel runs (default 3)
#   QUICK=1        one seed and fewer conditions, to check everything works first (about 10 minutes on a GPU)
#   NO_MODEL=1     run only the parts that need no model
#
# Output: experiment/swarm-2026/runs/<UTC time>/ and the same folder as a .zip next to it.
set -euo pipefail
cd "$(dirname "$0")/../.."
ROOT=$(pwd)

export OLLAMA_URL=${OLLAMA_URL:-http://127.0.0.1:11434}
export OLLAMA_MODEL=${OLLAMA_MODEL:-llama3.1:8b}
SECOND_MODEL=${SECOND_MODEL:-}
SEEDS=${SEEDS:-3}
QUICK=${QUICK:-0}
NO_MODEL=${NO_MODEL:-0}
if [ "$QUICK" = 1 ]; then SEEDS=1; fi

STAMP=$(date -u +%Y%m%dT%H%MZ)
OUT=experiment/swarm-2026/runs/$STAMP
mkdir -p "$OUT/logs"
NODE="node --experimental-strip-types --no-warnings"
T3=experiment/swarm-2026/t3-turnstile
T4=experiment/swarm-2026/t4-split-approvals

step() { # step <name> <command...>: runs it, logs it, times it
  local name=$1; shift
  echo "== $name"
  local start=$(date +%s)
  if "$@" > "$OUT/logs/$name.log" 2>&1; then
    echo "| $name | ok | $(( $(date +%s) - start )) s | \`$*\` |" >> "$OUT/steps.md"
  else
    echo "| $name | FAILED (see logs/$name.log) | $(( $(date +%s) - start )) s | \`$*\` |" >> "$OUT/steps.md"
    echo "   failed: see $OUT/logs/$name.log"
  fi
  tail -3 "$OUT/logs/$name.log" | sed 's/^/   /'
}

# ── checks ────────────────────────────────────────────────────────────────────
node -e 'const [a]=process.versions.node.split(".");if(+a<22){console.error("Node 22 or later is needed");process.exit(1)}'
[ -d node_modules/@anthropic-ai/sdk ] || npm ci --ignore-scripts --no-audit --no-fund
if [ "$NO_MODEL" != 1 ]; then
  curl -sf "$OLLAMA_URL/api/tags" > /dev/null || { echo "Ollama isn't answering at $OLLAMA_URL. Start it with: ollama serve"; exit 1; }
  ollama pull "$OLLAMA_MODEL"
  if [ -n "$SECOND_MODEL" ]; then ollama pull "$SECOND_MODEL"; fi
fi

# ── how this run was made ─────────────────────────────────────────────────────
{
  echo "# How this run was made"
  echo
  echo "| | |"
  echo "| --- | --- |"
  echo "| Started (UTC) | $(date -u '+%Y-%m-%d %H:%M') |"
  echo "| Git commit | \`$(git rev-parse HEAD 2>/dev/null || echo unknown)\` on \`$(git branch --show-current 2>/dev/null || echo unknown)\` |"
  echo "| Uncommitted changes | $(git status --porcelain 2>/dev/null | wc -l | tr -d ' ') files |"
  echo "| Node | $(node -v) |"
  echo "| Machine | $(uname -srm) |"
  GPU=$(nvidia-smi --query-gpu=name,memory.total --format=csv,noheader 2>/dev/null | paste -sd ';' - || true)
  echo "| GPU | ${GPU:-none found} |"
  if [ "$NO_MODEL" != 1 ]; then
    echo "| Ollama | $(ollama --version 2>/dev/null | tail -1) |"
    echo "| Main model | \`$OLLAMA_MODEL\` ($(ollama show "$OLLAMA_MODEL" 2>/dev/null | grep -iE 'parameters|quantization' | tr -s ' ' | paste -sd ',' -)) |"
    if [ -n "$SECOND_MODEL" ]; then echo "| Second model | \`$SECOND_MODEL\` |"; fi
  fi
  echo "| Seeds for LLM cartel runs | $SEEDS |"
  echo "| Quick mode | $QUICK |"
} > "$OUT/ENVIRONMENT.md"
printf "\n# Steps\n\n| Step | Result | Time | Command |\n| --- | --- | --- | --- |\n" > "$OUT/steps.md"

# ── tests ─────────────────────────────────────────────────────────────────────
step tests $NODE --test src/lib/turnstile/collusion-sim.test.ts experiment/swarm-2026/swarm.test.ts

# ── Entry A: the turnstile ────────────────────────────────────────────────────
ALL_COND=all-on,no-canaries,no-commit-reveal,no-blinding,no-planted-faults,no-panel-commit-reveal
step a1-scripted-full $NODE $T3/run.ts --policy scripted --seeds 30 --conditions $ALL_COND --out $OUT/entry-a/1-scripted-full
step a2-scripted-small $NODE $T3/run.ts --policy scripted --size small --seeds 30 --conditions all-on,no-canaries --out $OUT/entry-a/2-scripted-small
step a3-greedy-small $NODE $T3/run.ts --policy greedy --size small --seeds 30 --conditions all-on,no-canaries --out $OUT/entry-a/3-greedy-small
step a4-ward-milk $NODE $T3/ward-milk.ts --out $OUT/entry-a/4-ward-milk
if [ "$NO_MODEL" != 1 ]; then
  if [ "$QUICK" = 1 ]; then A_COND=all-on; else A_COND=all-on,no-canaries; fi
  step a5-llm-cartel $NODE $T3/run.ts --policy llm --llm ollama --channel --seeds "$SEEDS" --conditions $A_COND --out $OUT/entry-a/5-llm-cartel
  step a6-llm-fix-canaries-30 $NODE $T3/run.ts --policy llm --llm ollama --seeds "$SEEDS" --conditions all-on --canary-share 0.3 --out $OUT/entry-a/6-llm-fix-canaries-30
  step a7-scripted-fix-canaries-30 $NODE $T3/run.ts --policy scripted --size small --seeds 30 --conditions all-on --canary-share 0.3 --out $OUT/entry-a/7-scripted-fix-canaries-30
  if [ -n "$SECOND_MODEL" ]; then
    step a8-llm-cartel-second-model $NODE $T3/run.ts --policy llm --llm ollama --model "$SECOND_MODEL" --channel --seeds 1 --conditions all-on --out $OUT/entry-a/8-llm-cartel-second-model
  fi
fi

# ── Entry B: split approvals ──────────────────────────────────────────────────
step b1-rule-pipeline $NODE $T4/run.ts --conditions linked,no-principal,grant,no-egress-job --out $OUT/entry-b/1-rule-pipeline
if [ "$NO_MODEL" != 1 ]; then
  if [ "$QUICK" = 1 ]; then B_COND=linked; else B_COND=linked,no-principal,grant; fi
  step b2-llm-reviewers $NODE $T4/run.ts --llm ollama --conditions $B_COND --out $OUT/entry-b/2-llm-reviewers
  if [ -n "$SECOND_MODEL" ]; then
    step b3-llm-reviewers-second-model $NODE $T4/run.ts --llm ollama --model "$SECOND_MODEL" --conditions linked --out $OUT/entry-b/3-llm-reviewers-second-model
  fi
fi

# ── one file with every result, then the zip ──────────────────────────────────
{
  echo "# All results, $STAMP"
  echo
  echo "Every table below was written by the scripts; nothing here was typed by hand. Raw data for each part is in the"
  echo "same folder as its results.md: results.json (every run) and decisions.jsonl (every decision, with its reason)."
  echo
  cat "$OUT/ENVIRONMENT.md"
  cat "$OUT/steps.md"
  for f in $(find "$OUT/entry-a" "$OUT/entry-b" -name '*.md' | sort); do
    echo
    echo "---"
    echo
    echo "Source: \`${f#$OUT/}\`"
    echo
    sed 's/^# /## /' "$f"
  done
} > "$OUT/ALL-RESULTS.md"
cp experiment/swarm-2026/GUIDE.md "$OUT/GUIDE.md"
cp $T3/README.md "$OUT/entry-a/README.md"
cp $T4/README.md "$OUT/entry-b/README.md"
for f in PROPOSAL.md PROPOSAL.pdf GPU-PROMPT.md; do
  if [ -f "experiment/swarm-2026/$f" ]; then cp "experiment/swarm-2026/$f" "$OUT/$f"; fi
done
cp experiment/swarm-2026/run-all.sh "$OUT/run-all.sh"
mkdir -p "$OUT/code"
cp -r experiment/swarm-2026/shared $T3 $T4 "$OUT/code/" 2>/dev/null || true
rm -rf "$OUT/code/t3-turnstile/results" "$OUT/code/t4-split-approvals/results"
cp src/lib/turnstile/collusion-sim.ts "$OUT/code/collusion-sim.ts"

(cd experiment/swarm-2026/runs && zip -qr "$STAMP.zip" "$STAMP")
echo
echo "Done. Results: $OUT/ALL-RESULTS.md"
echo "Zip: experiment/swarm-2026/runs/$STAMP.zip"
