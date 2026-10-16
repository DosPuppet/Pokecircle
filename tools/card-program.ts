/**
 * Prints the compiled program of cards next to their text, to review that the effects follow the printed text.
 *
 *   npx tsx tools/card-program.ts --deck <id>|all      every card of precons
 *   npx tsx tools/card-program.ts --set <set> [--new]  every card of a set (--new: implemented since the baseline)
 *   npx tsx tools/card-program.ts "<English name>"…    some cards
 */
import baseline from "../packages/cards/data/compile-baseline.json";

import { PRECONS } from "../packages/cards/src/decks";
import { CARDS, PRINTS_OF } from "../packages/cards/src/index";
import type { CardDef, Effect } from "../packages/engine/src/types";

const argv = process.argv.slice(2);
const opt = (n: string) => (argv.includes(`--${n}`) ? argv[argv.indexOf(`--${n}`) + 1] : undefined);
const deck = opt("deck");
const set = opt("set");
const onlyNew = argv.includes("--new");
const names = argv.filter((a, i) => !a.startsWith("--") && argv[i - 1] !== "--deck" && argv[i - 1] !== "--set");
const known = new Set<string>(baseline.implemented);

function show(e: Effect): string {
  const { op, ...rest } = e as Effect & Record<string, unknown>;
  const parts: string[] = [];
  for (const [k, v] of Object.entries(rest)) {
    if (k === "prompt" || k === "label") continue;
    if (k === "then" || k === "else" || k === "effects") parts.push(`${k}: [${(v as Effect[]).map(show).join("; ")}]`);
    else if (k === "options")
      parts.push(`options: ${(v as { effects: Effect[] }[]).map((o) => `[${o.effects.map(show).join("; ")}]`).join(" | ")}`);
    else parts.push(`${k}: ${JSON.stringify(v)}`);
  }
  return `${op}(${parts.join(", ")})`;
}

function print(d: CardDef): void {
  console.log(`\n## ${d.name} [${d.id}] ${d.implemented ? "" : "NOT IMPLEMENTED"}`);
  for (const a of d.abilities ?? []) {
    console.log(`  [Ability] ${a.name}: ${a.text}`);
    if (a.activated)
      console.log(
        `    activated${a.activated.once ? ` once=${a.activated.once}` : ""}${a.activated.where ? ` where=${a.activated.where}` : ""}${a.activated.condition ? ` if ${JSON.stringify(a.activated.condition)}` : ""}: ${a.activated.effects.map(show).join("; ")}`,
      );
    for (const s of a.statics ?? []) console.log(`    static ${JSON.stringify(s)}`);
    for (const t of a.triggers ?? [])
      console.log(
        `    on ${t.on}${t.may ? " (may)" : ""}${t.condition ? ` if ${JSON.stringify(t.condition)}` : ""}: ${t.effects.map(show).join("; ")}`,
      );
  }
  for (const a of d.attacks ?? []) {
    console.log(`  ${a.cost.join("")} ${a.name} ${a.damage || ""}${a.suffix ?? ""}: ${a.text ?? ""}`);
    console.log(`    → ${(a.effects ?? []).map(show).join("; ")}`);
  }
  if (d.trainer) {
    if (d.text.en.text) console.log(`  ${d.text.en.text.replace(/\n+/g, " ")}`);
    if (d.trainer.condition) console.log(`    if ${JSON.stringify(d.trainer.condition)}`);
    if (d.trainer.effects) console.log(`    → ${d.trainer.effects.map(show).join("; ")}`);
    for (const s of d.trainer.statics ?? []) console.log(`    static ${JSON.stringify(s)}`);
    for (const t of d.trainer.triggers ?? []) console.log(`    on ${t.on}: ${t.effects.map(show).join("; ")}`);
  }
  if (d.energy && !d.energy.basic) {
    console.log(`  ${d.text.en.text ?? ""}`);
    console.log(
      `    provides ${JSON.stringify(d.energy.provides)} ${JSON.stringify(d.energy.statics ?? [])} ${JSON.stringify(d.energy.triggers ?? [])}`,
    );
  }
}

const ids = new Set<string>();
if (deck) for (const p of PRECONS.filter((x) => deck === "all" || x.id === deck)) for (const [, id] of p.main) ids.add(id);
for (const n of names) for (const d of Object.values(CARDS)) if (d.name === n && d.standard) ids.add(d.id);
if (set)
  for (const d of Object.values(CARDS))
    if (d.standard && (PRINTS_OF[d.id] ?? []).some((p) => p.set === set) && (!onlyNew || (d.implemented && !known.has(d.id))))
      ids.add(d.id);
if (onlyNew && !set) for (const d of Object.values(CARDS)) if (d.standard && d.implemented && !known.has(d.id)) ids.add(d.id);
for (const id of ids) {
  const d = CARDS[id];
  if (d && !d.energy?.basic && (d.attacks?.some((a) => a.text) || d.abilities?.length || d.trainer || d.energy)) print(d);
}
