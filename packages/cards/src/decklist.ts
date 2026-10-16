/**
 * Decklists in the Pokémon TCG Live format, with English or French headers and names:
 *
 *   Pokémon: 12          (Pokémon : 12)
 *   4 Latias ex SSP 76
 *   Trainer: 36          (Dresseur : 36)
 *   Energy: 12           (Énergie : 12)
 *   Total Cards: 60      (Total de cartes : 60)
 *
 * A line is resolved by set code and number, then by name (English or French), then as a Basic Energy by its type.
 * Deck construction rules: `validateDeck` (docs/rules.md, R-FORMAT).
 */
import { type CardDef, cardRef, msg, type PrintInfo } from "@pocketmate/engine";
import { CARDS, PRINTS, PRINTS_OF } from "./index";

/** `[count, definition id, print id?]`. */
export type DeckEntries = [number, string, string?][];

export interface DeckList {
  id: string;
  name: string;
  /** French name. */
  fr?: string;
  main: DeckEntries;
  /** Cover card (definition id). */
  cover?: string;
  format?: Format;
}

export type Format = "standard" | "unlimited";

/** Decklist code aliases (TCG Live and other sites). */
const CODE_ALIASES: Record<string, string> = { "PR-SV": "SVP", "PR-ME": "MEP" };

const byCode = new Map<string, PrintInfo>();
for (const p of Object.values(PRINTS)) {
  const k = `${p.code} ${p.number}`;
  // 30th Celebration and its Classic Collection share a code: the Standard print wins.
  const prev = byCode.get(k);
  if (!prev || (!prev.standard && p.standard)) byCode.set(k, p);
}

/** Name for matching: lower case, no accents, no punctuation differences ("Latias-ex" = "Latias ex"). */
export function normalizeName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[‘’`]/g, "'")
    .replace(/[-–—]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

const byName = new Map<string, CardDef[]>();
const addName = (n: string | undefined, d: CardDef) => {
  if (!n) return;
  const k = normalizeName(n);
  const list = byName.get(k) ?? [];
  if (!list.includes(d)) list.push(d);
  byName.set(k, list);
};
for (const d of Object.values(CARDS)) {
  addName(d.name, d);
  addName(d.text.fr?.name, d);
}

/** French Energy type words (Basic Energy lines "Énergie Psy de base"). */
const TYPE_WORDS: Record<string, string> = {
  grass: "G",
  plante: "G",
  fire: "R",
  feu: "R",
  water: "W",
  eau: "W",
  lightning: "L",
  electrique: "L",
  electrik: "L",
  psychic: "P",
  psy: "P",
  fighting: "F",
  combat: "F",
  darkness: "D",
  obscurite: "D",
  metal: "M",
};
const SYMBOL: Record<string, string> = {
  G: "grass",
  R: "fire",
  W: "water",
  L: "lightning",
  P: "psychic",
  F: "fighting",
  D: "darkness",
  M: "metal",
};

/** The Basic Energy definition named by a line ("Psychic Energy", "Basic {P} Energy", "Énergie Psy de base"). */
function basicEnergyNamed(name: string): CardDef | undefined {
  const n = normalizeName(name)
    .replace(/\{(\w)\}/g, (_, s: string) => SYMBOL[s.toUpperCase()] ?? s)
    .replace(/\b(basic|de base|energy|energie)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const type = TYPE_WORDS[n];
  return type ? Object.values(CARDS).find((d) => d.energy?.basic && d.energy.provides[0]?.[0] === type) : undefined;
}

/** The definitions with a name, the most usable first (implemented, Standard). */
export function defsNamed(name: string): CardDef[] {
  const list = byName.get(normalizeName(name)) ?? [];
  const score = (d: CardDef) => (d.implemented ? 2 : 0) + (d.standard ? 1 : 0);
  return [...list].sort((a, b) => score(b) - score(a));
}

export interface ParseResult {
  entries: DeckEntries;
  /** Lines that could not be read or resolved (player-facing English texts). */
  errors: string[];
}

const HEADER = /^(pokemon|pokémon|trainer|dresseur|energy|energie|énergie|total cards|total de cartes)\s*:?\s*\d*\s*$/i;
const LINE = /^(\d+)\s*x?\s+(.+?)(?:\s+([A-Za-z0-9-]{2,7})\s+([A-Za-z0-9]+))?\s*$/;

export function parseDeckList(text: string): ParseResult {
  const entries: DeckEntries = [];
  const errors: string[] = [];
  const add = (count: number, defId: string, print?: string) => {
    const same = entries.find((e) => e[1] === defId && e[2] === print);
    if (same) same[0] += count;
    else entries.push(print ? [count, defId, print] : [count, defId]);
  };
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/^[*\-•]\s*/, "").trim();
    if (!line || line.startsWith("//") || line.startsWith("#") || HEADER.test(line)) continue;
    const m = LINE.exec(line);
    if (!m) {
      errors.push(msg("Unreadable line: {line}", { line }));
      continue;
    }
    const count = Number(m[1]);
    const name = (m[2] as string).trim();
    const code = m[3] ? (CODE_ALIASES[m[3].toUpperCase()] ?? m[3].toUpperCase()) : undefined;
    const number = m[4]?.replace(/^0+(?=\d)/, "");
    const print = code && number ? byCode.get(`${code} ${number}`) : undefined;
    if (print) {
      add(count, print.defId, print.id);
      continue;
    }
    // The code may be part of the name ("Ultra Ball" without code): retry with the whole text as a name.
    const whole = m[3] ? `${name} ${m[3]} ${m[4]}` : name;
    const def = defsNamed(name)[0] ?? defsNamed(whole)[0] ?? basicEnergyNamed(name) ?? basicEnergyNamed(whole);
    if (def) add(count, def.id);
    else errors.push(msg("Unknown card: {line}", { line }));
  }
  return { entries, errors };
}

/** The print used to name a card in a list: the entry's, else the definition's default. */
function printOf(defId: string, print?: string): PrintInfo | undefined {
  return (print ? PRINTS[print] : undefined) ?? PRINTS[CARDS[defId]?.print ?? ""] ?? PRINTS_OF[defId]?.[0];
}

/** A decklist in the TCG Live format, in English or French. */
export function serializeDeckList(entries: DeckEntries, lang: "fr" | "en" = "en"): string {
  const sections: Record<string, string[]> = { pokemon: [], trainer: [], energy: [] };
  const counts: Record<string, number> = { pokemon: 0, trainer: 0, energy: 0 };
  for (const [count, defId, print] of entries) {
    const d = CARDS[defId];
    if (!d) continue;
    const p = printOf(defId, print);
    const name = lang === "fr" ? (d.text.fr?.name ?? d.name) : d.name;
    sections[d.category]?.push(`${count} ${name}${p ? ` ${p.code} ${p.number}` : ""}`);
    counts[d.category] = (counts[d.category] ?? 0) + count;
  }
  const total = (counts.pokemon ?? 0) + (counts.trainer ?? 0) + (counts.energy ?? 0);
  const h =
    lang === "fr"
      ? ["Pokémon : ", "Dresseur : ", "Énergie : ", "Total de cartes : "] // i18n-ignore: TCG Live headers
      : ["Pokémon: ", "Trainer: ", "Energy: ", "Total Cards: "];
  return [
    `${h[0]}${counts.pokemon}`,
    ...(sections.pokemon ?? []),
    "",
    `${h[1]}${counts.trainer}`,
    ...(sections.trainer ?? []),
    "",
    `${h[2]}${counts.energy}`,
    ...(sections.energy ?? []),
    "",
    `${h[3]}${total}`,
  ].join("\n");
}

export function deckSize(entries: DeckEntries): number {
  return entries.reduce((n, [c]) => n + c, 0);
}

/** Problems of a deck for a format (R-FORMAT); empty: the deck is legal. Player-facing English texts. */
export function validateDeck(entries: DeckEntries, format: Format = "standard"): string[] {
  const problems: string[] = [];
  const size = deckSize(entries);
  if (size !== 60) problems.push(msg("A deck has exactly 60 cards ({n} here)", { n: size }));
  const byCopyName = new Map<string, number>();
  const named = new Map<string, string>();
  let basics = 0;
  let aceSpecs = 0;
  for (const [count, defId, print] of entries) {
    const d = CARDS[defId];
    if (!d) {
      problems.push(msg("Unknown card: {line}", { line: defId }));
      continue;
    }
    if (count <= 0 || !Number.isInteger(count)) problems.push(msg("Invalid count for {card}", { card: cardRef(d.id) }));
    if (print && PRINTS[print]?.defId !== defId) problems.push(msg("Invalid print for {card}", { card: cardRef(d.id) }));
    if (!d.energy?.basic) {
      byCopyName.set(d.copyName, (byCopyName.get(d.copyName) ?? 0) + count);
      named.set(d.copyName, d.id);
    }
    if (d.category === "pokemon" && d.stage === "basic") basics += count;
    if (d.tags.includes("aceSpec")) aceSpecs += count;
    if (!d.implemented) problems.push(msg("{card} is not playable yet", { card: cardRef(d.id) }));
    if (format === "standard" && !d.standard) problems.push(msg("{card} is not legal in Standard", { card: cardRef(d.id) }));
  }
  for (const [name, n] of byCopyName)
    if (n > 4) problems.push(msg("At most 4 cards named {card} ({n} here)", { card: cardRef(named.get(name) ?? ""), n }));
  if (basics === 0) problems.push(msg("A deck needs at least 1 Basic Pokémon"));
  if (aceSpecs > 1) problems.push(msg("At most 1 ACE SPEC card ({n} here)", { n: aceSpecs }));
  return problems;
}
