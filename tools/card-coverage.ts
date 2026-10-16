/**
 * Card coverage: how many definitions are implemented, and which texts the compiler does not read yet.
 *
 *   npx tsx tools/card-coverage.ts --set sv08 [--unscripted] [--sentences]
 *   npx tsx tools/card-coverage.ts --set all | --set standard
 *   npx tsx tools/card-coverage.ts --deck <id>|all       a precon deck (or all of them)
 *   --sentences: unmatched sentences ranked by how many definitions use them
 *   --card "<English name>": one card's texts and status
 */

import { PRECONS } from "../packages/cards/src/decks";
import { CARDS, COMPILE_REPORT, PRINTS_OF } from "../packages/cards/src/index";

const argv = process.argv.slice(2);
const opt = (n: string) => {
  const i = argv.indexOf(`--${n}`);
  return i >= 0 ? argv[i + 1] : undefined;
};
const set = opt("set");
const deck = opt("deck");
const card = opt("card");

let defs = Object.values(CARDS);
if (card) {
  for (const d of defs.filter((x) => x.name === card)) {
    console.log(`${d.name} [${d.id}] ${d.implemented ? "implemented" : "NOT implemented"} ${d.standard ? "Standard" : ""}`);
    for (const m of d.missing ?? []) console.log(`  missing: ${m}`);
    for (const u of COMPILE_REPORT.unmatched[d.id] ?? []) console.log(`  unmatched: ${u}`);
    console.log(`  templates: ${(COMPILE_REPORT.templates[d.id] ?? []).join(", ")}`);
  }
  process.exit(0);
}
if (deck) {
  const ids = new Set((deck === "all" ? PRECONS : PRECONS.filter((p) => p.id === deck)).flatMap((p) => p.main.map((e) => e[1])));
  defs = defs.filter((d) => ids.has(d.id));
} else if (set === "standard" || !set) defs = defs.filter((d) => d.standard);
else if (set !== "all") defs = defs.filter((d) => (PRINTS_OF[d.id] ?? []).some((p) => p.set === set));

const done = defs.filter((d) => d.implemented);
const label = deck ? `deck ${deck}` : `set ${set ?? "standard"}`;
console.log(
  `${label}: ${done.length} / ${defs.length} implemented (${((100 * done.length) / Math.max(1, defs.length)).toFixed(1)}%)`,
);
const byCat: Record<string, [number, number]> = {};
for (const d of defs) {
  const k = d.trainer?.kind ?? d.category;
  const v = byCat[k] ?? [0, 0];
  v[1]++;
  if (d.implemented) v[0]++;
  byCat[k] = v;
}
console.log(
  Object.entries(byCat)
    .map(([k, [a, b]]) => `${k} ${a}/${b}`)
    .join(", "),
);

if (argv.includes("--unscripted"))
  for (const d of defs.filter((x) => !x.implemented))
    console.log(`- ${d.name} [${d.id}]: ${(d.missing ?? []).join(" | ").slice(0, 200)}`);

if (argv.includes("--sentences")) {
  const count = new Map<string, number>();
  for (const d of defs)
    for (const u of COMPILE_REPORT.unmatched[d.id] ?? []) {
      // The first unmatched sentence is what blocks the text.
      const first = u.split(/(?<=\.)\s+(?=[A-Z])/)[0] ?? u;
      const k = first.replace(/\d+/g, "N");
      count.set(k, (count.get(k) ?? 0) + 1);
    }
  for (const [k, n] of [...count.entries()].sort((a, b) => b[1] - a[1]).slice(0, Number(opt("top") ?? 60)))
    console.log(`${String(n).padStart(4)}  ${k}`);
}
