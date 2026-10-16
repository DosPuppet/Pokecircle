/**
 * Card tags that TCGdex does not have (Tera, Ancient, Future, ACE SPEC), from the open pokemon-tcg-data repository
 * (subtypes per card), written to `packages/cards/data/card-tags.json` as tag → TCGdex print ids.
 *
 *   npx tsx tools/import-tags.ts
 */
import { writeFileSync } from "node:fs";
import { SET_REGISTRY } from "../packages/cards/src/setRegistry";

const BASE = "https://raw.githubusercontent.com/PokemonTCG/pokemon-tcg-data/master/cards/en/";
/** TCGdex set id → pokemon-tcg-data set id (sets missing there: their cards have no tag). */
const SET_IDS: Record<string, string> = {
  sve: "sve",
  svp: "svp",
  sv05: "sv5",
  sv06: "sv6",
  "sv06.5": "sv6pt5",
  sv07: "sv7",
  sv08: "sv8",
  "sv08.5": "sv8pt5",
  sv09: "sv9",
  sv10: "sv10",
  "sv10.5b": "zsv10pt5",
  "sv10.5w": "rsv10pt5",
  me01: "me1",
  me02: "me2",
  "me02.5": "me2pt5",
  me03: "me3",
  me04: "me4",
  me05: "me5",
  "30th": "me55",
  "30th-c": "me55c",
};
const TAGS: Record<string, string> = { Tera: "tera", Ancient: "ancient", Future: "future", "ACE SPEC": "aceSpec" };

const out: Record<string, string[]> = { tera: [], ancient: [], future: [], aceSpec: [] };
const local = await Promise.all(
  SET_REGISTRY.map(async (s) => {
    const src = SET_IDS[s.id];
    if (!src) return `${s.id}: no source`;
    const res = await fetch(`${BASE}${src}.json`);
    if (!res.ok) return `${s.id}: HTTP ${res.status}`;
    const cards = (await res.json()) as { number: string; subtypes?: string[] }[];
    for (const c of cards)
      for (const st of c.subtypes ?? []) {
        const tag = TAGS[st];
        // TCGdex local ids are zero-padded to three digits for numbered cards ("076").
        if (tag) out[tag]?.push(`${s.id}-${/^\d+$/.test(c.number) ? c.number.padStart(3, "0") : c.number}`);
      }
    return `${s.id}: ${cards.length} cards`;
  }),
);
for (const l of local) console.log(l);
for (const k of Object.keys(out)) out[k]?.sort();
writeFileSync(new URL("../packages/cards/data/card-tags.json", import.meta.url), `${JSON.stringify(out, null, 1)}\n`);
console.log(
  Object.entries(out)
    .map(([k, v]) => `${k}: ${v.length}`)
    .join(", "),
);
