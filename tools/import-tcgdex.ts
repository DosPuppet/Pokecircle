/**
 * Imports card data from TCGdex into `packages/cards/data/<set>.json`.
 *
 *   npm run import-cards -- sv08 me01      some sets
 *   npm run import-cards -- all            every set of `setRegistry.ts`
 *   options: --refresh (ignore the raw cache in packages/cards/data/cache/)
 *
 * Structure comes from the English card, French strings from the French card (aligned by index; a mismatch keeps the
 * English strings and is reported). Raw responses are cached, so a reimport does not hit the API again.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { RawCard, RawType } from "../packages/cards/src/raw";
import { SET_REGISTRY } from "../packages/cards/src/setRegistry";

const API = "https://api.tcgdex.net/v2";
const DATA = new URL("../packages/cards/data/", import.meta.url);
const CACHE = new URL("cache/", DATA);
const argv = process.argv.slice(2);
const refresh = argv.includes("--refresh");
const wanted = argv.filter((a) => !a.startsWith("--"));
const sets = wanted.includes("all") ? SET_REGISTRY : SET_REGISTRY.filter((s) => wanted.includes(s.id));
if (!sets.length) {
  console.error(`Usage: npm run import-cards -- <set>… | all   (sets: ${SET_REGISTRY.map((s) => s.id).join(", ")})`);
  process.exit(2);
}

const TYPES: Record<string, RawType> = {
  Grass: "G",
  Fire: "R",
  Water: "W",
  Lightning: "L",
  Psychic: "P",
  Fighting: "F",
  Darkness: "D",
  Metal: "M",
  Dragon: "N",
  Colorless: "C",
  Fairy: "Y",
};
const type = (t: string): RawType => {
  const v = TYPES[t];
  if (!v) throw new Error(`unknown type ${t}`);
  return v;
};

async function getJson(lang: string, path: string): Promise<unknown> {
  const file = new URL(`${lang}/${path}.json`, CACHE);
  if (!refresh && existsSync(file)) return JSON.parse(readFileSync(file, "utf8"));
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(`${API}/${lang}/${path.split("/").map(encodeURIComponent).join("/")}`);
      if (res.status === 404) {
        mkdirSync(dirname(file.pathname), { recursive: true });
        writeFileSync(file, "null");
        return null;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      for (const k of ["pricing", "variants", "variants_detailed"]) delete (json as Record<string, unknown>)[k];
      mkdirSync(dirname(file.pathname), { recursive: true });
      writeFileSync(file, JSON.stringify(json));
      return json;
    } catch (e) {
      if (attempt >= 5) throw new Error(`${lang}/${path}: ${e}`);
      await new Promise((r) => setTimeout(r, 500 * attempt));
    }
  }
}

/** Runs `fn` over `items` with at most `n` at a time. */
async function pool<T, R>(items: T[], n: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: n }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i] as T);
      }
    }),
  );
  return out;
}

interface ApiCard {
  id: string;
  localId: string;
  category: string;
  name: string;
  rarity?: string;
  regulationMark?: string;
  legal?: { standard?: boolean };
  hp?: number;
  types?: string[];
  stage?: string;
  suffix?: string;
  evolveFrom?: string;
  abilities?: { type: string; name: string; effect: string }[];
  attacks?: { name: string; cost?: string[]; damage?: number | string; effect?: string }[];
  weaknesses?: { type: string; value?: string }[];
  resistances?: { type: string; value?: string }[];
  retreat?: number;
  trainerType?: string;
  energyType?: string;
  effect?: string;
  image?: string;
  illustrator?: string;
}

const issues: string[] = [];

function toRaw(set: string, en: ApiCard, fr: ApiCard | null): RawCard {
  const category = en.category === "Pokemon" ? "Pokemon" : en.category === "Trainer" ? "Trainer" : "Energy";
  const c: RawCard = { id: en.id, set, localId: en.localId, category, name: en.name.trim(), standard: !!en.legal?.standard };
  if (en.rarity) c.rarity = en.rarity;
  if (en.regulationMark) c.regulationMark = en.regulationMark;
  if (category === "Pokemon") {
    if (en.hp) c.hp = en.hp;
    if (en.types) c.types = en.types.map(type);
    if (en.stage) c.stage = en.stage.replace(/\s/g, "") as RawCard["stage"];
    if (en.suffix) c.suffix = en.suffix;
    if (en.evolveFrom) c.evolveFrom = en.evolveFrom.trim();
    if (en.abilities?.length) c.abilities = en.abilities.map((a) => ({ type: a.type, name: a.name, effect: a.effect }));
    if (en.attacks?.length)
      c.attacks = en.attacks.map((a) => {
        const out: RawCard["attacks"] extends (infer A)[] | undefined ? A : never = {
          name: a.name,
          cost: (a.cost ?? []).map(type),
        };
        if (a.damage !== undefined && a.damage !== "" && a.damage !== 0) out.damage = String(a.damage);
        if (a.effect) out.effect = a.effect;
        return out;
      });
    if (en.weaknesses?.length) c.weaknesses = en.weaknesses.map((w) => ({ type: type(w.type), value: w.value ?? "×2" }));
    if (en.resistances?.length) c.resistances = en.resistances.map((r) => ({ type: type(r.type), value: r.value ?? "-30" }));
    c.retreat = en.retreat ?? 0;
  } else if (category === "Trainer") {
    if (en.trainerType) c.trainerType = en.trainerType as RawCard["trainerType"];
    if (en.effect) c.effect = en.effect;
  } else {
    c.energyType = en.energyType === "Special" ? "Special" : "Normal";
    if (en.effect) c.effect = en.effect;
  }
  if (en.image) c.image = en.image;
  if (en.illustrator) c.illustrator = en.illustrator;
  if (fr) {
    const f: NonNullable<RawCard["fr"]> = { name: fr.name.trim() };
    const sameAbilities = (fr.abilities?.length ?? 0) === (en.abilities?.length ?? 0);
    const sameAttacks =
      (fr.attacks?.length ?? 0) === (en.attacks?.length ?? 0) &&
      (fr.attacks ?? []).every((a, i) => String(a.damage ?? "") === String(en.attacks?.[i]?.damage ?? ""));
    if (!sameAbilities || !sameAttacks) issues.push(`${en.id}: French attacks/abilities differ from English (English kept)`);
    if (sameAbilities && fr.abilities?.length) f.abilities = fr.abilities.map((a) => ({ name: a.name, effect: a.effect }));
    if (sameAttacks && fr.attacks?.length)
      f.attacks = fr.attacks.map((a) => (a.effect ? { name: a.name, effect: a.effect } : { name: a.name }));
    if (fr.effect) f.effect = fr.effect;
    if (fr.image) f.image = fr.image;
    c.fr = f;
  } else issues.push(`${en.id}: no French card`);
  return c;
}

for (const s of sets) {
  const en = (await getJson("en", `sets/${s.id}`)) as { cards: { id: string }[] } | null;
  if (!en) throw new Error(`set ${s.id} not found`);
  const briefs = s.only ? en.cards.filter((c) => s.only?.includes(c.id)) : en.cards;
  const cards = await pool(briefs, 8, async (brief) => {
    const enCard = (await getJson("en", `cards/${brief.id}`)) as ApiCard | null;
    if (!enCard) {
      issues.push(`${brief.id}: no English card`);
      return null;
    }
    const frCard = (await getJson("fr", `cards/${brief.id}`)) as ApiCard | null;
    return toRaw(s.id, enCard, frCard);
  });
  const out = cards.filter((c): c is RawCard => !!c);
  writeFileSync(new URL(`${s.id}.json`, DATA), `${JSON.stringify(out, null, 1)}\n`);
  console.log(`${s.id}: ${out.length} cards (${out.filter((c) => c.standard).length} Standard)`);
}
if (issues.length) {
  console.log(`\n${issues.length} issue(s):`);
  for (const i of issues) console.log(`  ${i}`);
}
