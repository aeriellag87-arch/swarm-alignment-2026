/** The ward milk example (Entry A): three people smell a bottle of milk. What decides whether it's served?
 *
 *    node --experimental-strip-types experiment/swarm-2026/t3-turnstile/ward-milk.ts [--out DIR]
 *
 *  What happened, as the entrant saw it: one person said the milk smelt off, a second said it smelt normal, and a
 *  third said they couldn't smell anything. This works out, exactly, how often three such checks let off milk through
 *  under three rules, and how often they throw away good milk:
 *
 *    majority of all     off only if at least 2 of the 3 say "off"; "can't tell" counts as not off
 *    majority of answers off if more say "off" than "normal", ignoring "can't tell"; a tie keeps the milk
 *    any one flag        the turnstile's rule: one "off" sends the milk for a proper check (here: thrown away)
 *
 *  The detection rates are ASSUMPTIONS for illustration, not measurements. Change them with --sense, --false-alarm
 *  and --cant-tell. Nothing here is a result about real milk or real people.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { args, pct } from "../shared/llm.ts";

type Say = "off" | "normal" | "cant";
type Rule = "majority of all" | "majority of answers" | "any one flag";
const RULES: Rule[] = ["majority of all", "majority of answers", "any one flag"];

export function discards(rule: Rule, says: Say[]): boolean {
  const off = says.filter((s) => s === "off").length;
  const normal = says.filter((s) => s === "normal").length;
  if (rule === "majority of all") return off >= 2;
  if (rule === "majority of answers") return off > normal;
  return off >= 1;
}

/** P(each answer) for one checker, given whether the milk is really off. */
function probs(milkOff: boolean, sense: number, falseAlarm: number, cantTell: number): Record<Say, number> {
  const pOff = (1 - cantTell) * (milkOff ? sense : falseAlarm);
  return { off: pOff, cant: cantTell, normal: 1 - cantTell - pOff };
}

/** Exact P(discard) over all 27 ways three independent checkers can answer. */
export function pDiscard(rule: Rule, milkOff: boolean, sense: number, falseAlarm: number, cantTell: number): number {
  const p = probs(milkOff, sense, falseAlarm, cantTell);
  const options: Say[] = ["off", "normal", "cant"];
  let total = 0;
  for (const x of options) for (const y of options) for (const z of options) {
    if (discards(rule, [x, y, z])) total += p[x] * p[y] * p[z];
  }
  return total;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const a = args();
  const sense = Number(a.sense ?? 0.6); // a checker who can smell it says "off" 60% of the time when it is off
  const falseAlarm = Number(a["false-alarm"] ?? 0.05);
  const cantTell = Number(a["cant-tell"] ?? 0.2);
  const out = a.out || "experiment/swarm-2026/t3-turnstile/results";
  mkdirSync(out, { recursive: true });

  const today: Say[] = ["off", "normal", "cant"];
  const lines = [
    "# The ward milk example",
    "",
    "Three people smelt the milk: one said off, one said normal, one couldn't smell anything.",
    "",
    "| Rule | Today's three answers | Off milk served (assumed rates) | Good milk thrown away (assumed rates) |",
    "| --- | --- | --- | --- |",
    ...RULES.map((r) => `| ${r} | ${discards(r, today) ? "thrown away" : "served"} | ${pct(1 - pDiscard(r, true, sense, falseAlarm, cantTell))} | ${pct(pDiscard(r, false, sense, falseAlarm, cantTell))} |`),
    "",
    `Assumed for each checker: says "off" ${pct(sense)} of the time when the milk is off and ${pct(falseAlarm)} when it isn't, and "can't tell" ${pct(cantTell)} of the time either way. These are illustrations, not measurements.`,
    "",
    "Under a majority vote, today's milk is served. Under the turnstile's rule, one \"off\" is enough to check it properly. The cost of that rule is the good milk it throws away, which is the turnstile's recomputation cost (a residue).",
  ];
  writeFileSync(join(out, "ward-milk.md"), lines.join("\n") + "\n");
  console.log(lines.join("\n"));
}
