/**
 * From TCGdex prints (`RawCard`) to gameplay definitions (`CardDef`) and prints (`PrintInfo`).
 *
 * Prints with the same gameplay (name, HP, stage, types, attacks, Abilities, texts, Weakness, Resistance, Retreat Cost,
 * Trainer or Energy kind) share one definition; the first print in registry order gives its data, any legal print makes
 * it legal (R-FORMAT-1), French texts come from the first print that has them.
 */
import type { AttackDef, CardDef, CardTag, CardText, EType, PrintInfo, Stage, TrainerKind } from "@pocketmate/engine";
import tagData from "../data/card-tags.json";
import frenchOverrides from "../data/french-overrides.json";
import type { RawCard } from "./raw";
import { SET_REGISTRY } from "./setRegistry";

const BASIC_ENERGY = /^(?:Basic )?(Grass|Fire|Water|Lightning|Psychic|Fighting|Darkness|Metal) Energy$/;
const ENERGY_TYPE: Record<string, EType> = {
  Grass: "G",
  Fire: "R",
  Water: "W",
  Lightning: "L",
  Psychic: "P",
  Fighting: "F",
  Darkness: "D",
  Metal: "M",
};
/** French names of the Basic Energy definitions (official names; TCGdex prints vary). */
const BASIC_ENERGY_FR: Record<string, string> = {
  G: "Énergie Plante de base", // i18n-ignore: card data
  R: "Énergie Feu de base", // i18n-ignore: card data
  W: "Énergie Eau de base", // i18n-ignore: card data
  L: "Énergie Électrique de base", // i18n-ignore: card data
  P: "Énergie Psy de base", // i18n-ignore: card data
  F: "Énergie Combat de base", // i18n-ignore: card data
  D: "Énergie Obscurité de base", // i18n-ignore: card data
  M: "Énergie Métal de base", // i18n-ignore: card data
};

const PRINT_TAGS = new Map<string, CardTag[]>();
for (const [tag, ids] of Object.entries(tagData as Record<string, string[]>))
  for (const id of ids) PRINT_TAGS.set(id, [...(PRINT_TAGS.get(id) ?? []), tag as CardTag]);

const SET_CODE = new Map(SET_REGISTRY.map((s) => [s.id, s.code]));

/** Text normalized for comparisons (quotes, dashes, spaces, final period). */
export function normalizeText(t: string | undefined): string {
  return (t ?? "")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/Pokemon/g, "Pokémon")
    .replace(/\s+/g, " ")
    .replace(/\s*\.$/, "")
    .trim()
    .toLowerCase();
}

export function basicEnergyType(name: string): EType | undefined {
  const m = BASIC_ENERGY.exec(name);
  return m ? ENERGY_TYPE[m[1] as string] : undefined;
}

/** The gameplay identity of a print, without its Weakness and Resistance (see `buildCatalog`). */
export function coreKey(c: RawCard): string {
  const basic = c.category === "Energy" ? basicEnergyType(c.name) : undefined;
  if (basic) return `energy|basic|${basic}`;
  return JSON.stringify([
    c.category,
    c.name.toLowerCase(),
    c.hp ?? 0,
    c.stage ?? "",
    c.types ?? [],
    c.evolveFrom ?? "",
    (c.abilities ?? []).map((a) => [a.name.toLowerCase(), normalizeText(a.effect)]),
    (c.attacks ?? []).map((a) => [a.name.toLowerCase(), a.cost, a.damage ?? "", normalizeText(a.effect)]),
    c.retreat ?? 0,
    c.trainerType ?? "",
    normalizeText(c.effect),
  ]);
}

/** Weakness and Resistance of a print, normalized ("x2" and "×2" are the same). */
function weaknessKey(c: RawCard): string {
  const v = (s: string) => s.replace(/x/gi, "×").replace(/\s/g, "");
  return JSON.stringify([
    (c.weaknesses ?? []).map((w) => [w.type, v(w.value)]),
    (c.resistances ?? []).map((r) => [r.type, v(r.value)]),
  ]);
}

/** The full gameplay identity of a print. */
export function gameplayKey(c: RawCard): string {
  return `${coreKey(c)}|${weaknessKey(c)}`;
}

/** FNV-1a hash, base 36. */
function hash(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36).padStart(7, "0");
}

export function slug(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function parseDamage(d: string | undefined): { damage: number; suffix?: AttackDef["suffix"] } {
  if (!d) return { damage: 0 };
  const m = /^(\d+)\s*([+×x-])?$/.exec(d.trim());
  if (!m) return { damage: 0 };
  const suffix = m[2] === "+" ? "+" : m[2] === "×" || m[2] === "x" ? "x" : m[2] === "-" ? "-" : undefined;
  return suffix ? { damage: Number(m[1]), suffix } : { damage: Number(m[1]) };
}

const STAGE: Record<string, Stage> = { Basic: "basic", Stage1: "stage1", Stage2: "stage2" };
const TRAINER: Record<string, TrainerKind> = { Item: "item", Supporter: "supporter", Tool: "tool", Stadium: "stadium" };

function englishText(c: RawCard): CardText {
  const t: CardText = { name: c.name };
  if (c.attacks?.length) t.attacks = c.attacks.map((a) => (a.effect ? { name: a.name, text: a.effect } : { name: a.name }));
  if (c.abilities?.length) t.abilities = c.abilities.map((a) => ({ name: a.name, text: a.effect }));
  if (c.effect) t.text = c.effect;
  return t;
}

function frenchText(c: RawCard): CardText | undefined {
  const f = c.fr;
  if (!f) return undefined;
  const t: CardText = { name: f.name };
  if (f.attacks?.length) t.attacks = f.attacks.map((a) => (a.effect ? { name: a.name, text: a.effect } : { name: a.name }));
  if (f.abilities?.length) t.abilities = f.abilities.map((a) => ({ name: a.name, text: a.effect }));
  if (f.effect) t.text = f.effect;
  return t;
}

function tagsOf(prints: RawCard[]): CardTag[] {
  const c = prints[0] as RawCard;
  const tags = new Set<CardTag>();
  if (c.category === "Pokemon") {
    if (/ ex$/i.test(c.name) || c.suffix === "ex") tags.add("ex");
    if (/^Mega /.test(c.name) && tags.has("ex")) tags.add("mega");
    if (tags.has("ex") || /^(EX|GX|V|VMAX|VSTAR)$/.test(c.suffix ?? "") || / (V|VMAX|VSTAR|EX|GX)$/.test(c.name))
      tags.add("ruleBox");
    if (/^.+'s /.test(c.name)) tags.add("trainersPokemon");
  }
  if (prints.some((p) => /ACE SPEC/i.test(p.rarity ?? ""))) tags.add("aceSpec");
  for (const p of prints) for (const t of PRINT_TAGS.get(p.id) ?? []) tags.add(t);
  return [...tags].sort();
}

/** Prize cards for a definition (R-KO-2), before static modifiers. */
export function prizeValue(def: Pick<CardDef, "tags">): number {
  if (def.tags.includes("mega")) return 3;
  return def.tags.includes("ruleBox") ? 2 : 1;
}

function images(c: RawCard): { en?: string; fr?: string } | undefined {
  const out: { en?: string; fr?: string } = {};
  if (c.image) out.en = c.image;
  if (c.fr?.image) out.fr = c.fr.image;
  return out.en || out.fr ? out : undefined;
}

function toDef(id: string, prints: RawCard[]): CardDef {
  const c = prints[0] as RawCard;
  const standard = prints.some((p) => p.standard);
  // Default print: a legal one with a French image, else any legal one, else the first.
  const main =
    prints.find((p) => p.standard && p.fr?.image) ?? prints.find((p) => p.standard && p.image) ?? (prints[0] as RawCard);
  const fr = frenchText(prints.find((p) => p.fr) ?? c);
  const def: CardDef = {
    id,
    name: c.name,
    copyName: c.name,
    category: c.category === "Pokemon" ? "pokemon" : c.category === "Trainer" ? "trainer" : "energy",
    tags: tagsOf(prints),
    text: fr ? { en: englishText(c), fr } : { en: englishText(c) },
    standard,
    implemented: false,
    print: main.id,
  };
  const marks = [...new Set(prints.map((p) => p.regulationMark?.toUpperCase()).filter(Boolean))];
  if (marks.length) def.regulationMark = marks.sort().at(-1) as string;
  const img = images(main);
  if (img) def.image = img;
  if (c.category === "Pokemon") {
    if (c.hp) def.hp = c.hp;
    def.types = (c.types ?? []) as EType[];
    def.stage = STAGE[c.stage ?? "Basic"] ?? "basic";
    if (c.evolveFrom) def.evolvesFrom = c.evolveFrom;
    const w = c.weaknesses?.[0];
    if (w) def.weakness = { type: w.type as EType, mult: Number(/\d+/.exec(w.value)?.[0] ?? 2) };
    const r = c.resistances?.[0];
    if (r) def.resistance = { type: r.type as EType, amount: Math.abs(Number(/\d+/.exec(r.value)?.[0] ?? 30)) };
    def.retreat = c.retreat ?? 0;
    def.attacks = (c.attacks ?? []).map((a) => {
      const out: AttackDef = { name: a.name, cost: a.cost as EType[], ...parseDamage(a.damage) };
      if (a.effect) out.text = a.effect;
      return out;
    });
    if (c.abilities?.length) def.abilities = c.abilities.map((a) => ({ name: a.name, text: a.effect }));
  } else if (c.category === "Trainer") {
    def.trainer = { kind: TRAINER[c.trainerType ?? "Item"] ?? "item" };
  } else {
    const basic = basicEnergyType(c.name);
    if (basic) {
      def.name = `Basic ${Object.entries(ENERGY_TYPE).find(([, v]) => v === basic)?.[0]} Energy`;
      def.copyName = def.name;
      def.energy = { basic: true, provides: [[basic]] };
      def.text = { en: { name: def.name }, fr: { name: BASIC_ENERGY_FR[basic] as string } };
      def.implemented = true;
      def.standard = true;
    } else def.energy = { basic: false, provides: [] };
  }
  return def;
}

export interface Catalog {
  defs: Record<string, CardDef>;
  prints: Record<string, PrintInfo>;
  /** Print id → definition id. */
  defOfPrint: Record<string, string>;
}

/** Builds the catalog from every set's raw cards, in registry order. */
export function buildCatalog(sets: RawCard[][]): Catalog {
  // Prints grouped by core key, then by Weakness and Resistance. Some TCGdex prints (promos) lack their Weakness and
  // Resistance: a print without any joins the only variant of its core group that has them.
  const cores = new Map<string, Map<string, RawCard[]>>();
  for (const set of sets)
    for (const c of set) {
      const core = coreKey(c);
      const byWeakness = cores.get(core) ?? new Map<string, RawCard[]>();
      cores.set(core, byWeakness);
      const w = weaknessKey(c);
      byWeakness.set(w, [...(byWeakness.get(w) ?? []), c]);
    }
  const groups = new Map<string, RawCard[]>();
  const EMPTY = "[[],[]]";
  for (const [core, byWeakness] of cores) {
    const empty = byWeakness.get(EMPTY);
    const others = [...byWeakness.entries()].filter(([w]) => w !== EMPTY);
    if (empty && others.length === 1 && core.startsWith('["Pokemon"')) {
      const [w, prints] = others[0] as [string, RawCard[]];
      byWeakness.delete(EMPTY);
      byWeakness.set(w, [...prints, ...empty]);
    }
    for (const [w, prints] of byWeakness) groups.set(`${core}|${w}`, prints);
  }
  // Trainer and Special Energy prints without text (TCGdex gaps) join the only same-name group that has one.
  for (const [key, prints] of groups) {
    const c = prints[0] as RawCard;
    if (c.category === "Pokemon" || c.effect || basicEnergyType(c.name)) continue;
    const same = [...groups.entries()].filter(
      ([k, g]) => k !== key && g[0]?.name === c.name && g[0]?.category === c.category && g[0]?.effect,
    );
    if (same.length !== 1) continue;
    const [k, g] = same[0] as [string, RawCard[]];
    groups.set(k, [...g, ...prints]);
    groups.delete(key);
  }
  const memory = translationMemory(sets);
  const defs: Record<string, CardDef> = {};
  const prints: Record<string, PrintInfo> = {};
  const defOfPrint: Record<string, string> = {};
  for (const [key, group] of groups) {
    const first = group[0] as RawCard;
    const basic = first.category === "Energy" ? basicEnergyType(first.name) : undefined;
    let id = basic ? `basic-${slug(first.name.replace(/^Basic /, ""))}` : `${slug(first.name)}-${hash(key).slice(0, 4)}`;
    for (let n = 5; defs[id]; n++) id = `${slug(first.name)}-${hash(key).slice(0, n)}`;
    const def = toDef(id, group);
    if (!def.text.fr) {
      const fr = translate(def.text.en, memory);
      if (fr) def.text.fr = fr;
    }
    defs[id] = def;
    for (const p of group) {
      const info: PrintInfo = {
        id: p.id,
        defId: id,
        set: p.set,
        code: SET_CODE.get(p.set) ?? p.set.toUpperCase(),
        number: p.localId.replace(/^0+(?=\d)/, ""),
        standard: p.standard || !!basic,
      };
      if (p.rarity) info.rarity = p.rarity;
      if (p.regulationMark) info.regulationMark = p.regulationMark.toUpperCase();
      const img = images(p);
      if (img) info.image = img;
      prints[p.id] = info;
      defOfPrint[p.id] = id;
    }
  }
  return { defs, prints, defOfPrint };
}

/** English → French names and texts seen on cards that have both (for prints that exist only in English). */
interface Memory {
  names: Map<string, string>;
  texts: Map<string, string>;
}

function translationMemory(sets: RawCard[][]): Memory {
  const names = new Map<string, string>();
  const texts = new Map<string, string>();
  const add = (m: Map<string, string>, en: string | undefined, fr: string | undefined) => {
    if (en && fr && !m.has(en)) m.set(en, fr);
  };
  for (const set of sets)
    for (const c of set) {
      const f = c.fr;
      if (!f) continue;
      add(names, c.name, f.name);
      c.attacks?.forEach((a, i) => {
        add(names, `attack:${a.name}`, f.attacks?.[i]?.name);
        add(texts, normalizeText(a.effect), f.attacks?.[i]?.effect);
      });
      c.abilities?.forEach((a, i) => {
        add(names, `ability:${a.name}`, f.abilities?.[i]?.name);
        add(texts, normalizeText(a.effect), f.abilities?.[i]?.effect);
      });
      add(texts, normalizeText(c.effect), f.effect);
    }
  for (const [en, fr] of Object.entries(frenchOverrides.names)) names.set(en, fr);
  return { names, texts };
}

/** A French text from the memory: the name must be known; unknown texts stay in English. */
function translate(en: CardText, m: Memory): CardText | undefined {
  const name = m.names.get(en.name);
  if (!name) return undefined;
  const t: CardText = { name };
  const text = (x: string | undefined) => (x ? (m.texts.get(normalizeText(x)) ?? x) : undefined);
  if (en.attacks)
    t.attacks = en.attacks.map((a) => {
      const out: { name: string; text?: string } = { name: m.names.get(`attack:${a.name}`) ?? a.name };
      const tx = text(a.text);
      if (tx) out.text = tx;
      return out;
    });
  if (en.abilities)
    t.abilities = en.abilities.map((a) => ({ name: m.names.get(`ability:${a.name}`) ?? a.name, text: text(a.text) ?? a.text }));
  const tx = text(en.text);
  if (tx) t.text = tx;
  return t;
}
