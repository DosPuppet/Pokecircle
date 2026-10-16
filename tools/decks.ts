/**
 * Deck pools for the fuzz, tournaments and benchmarks: random legal decks from implemented cards (evolution lines,
 * Trainers, Energy of the lines' types), or the precons.
 */
import { mulberry32, pickOne, type Rng, shuffled } from "../packages/ai/src/rng";
import { PRECONS } from "../packages/cards/src/decks";
import { CARDS, PRINTS_OF } from "../packages/cards/src/index";
import type { CardDef, EType } from "../packages/engine/src/types";

/** Implemented Standard definitions of a pool: `all`, a set id, or `starter`/`meta`/`precons` (decks). */
export function poolDefs(pool: string): CardDef[] {
  const defs = Object.values(CARDS).filter((d) => d.implemented && d.standard);
  if (pool === "all") return defs;
  return defs.filter((d) => (PRINTS_OF[d.id] ?? []).some((p) => p.set === pool) || d.energy?.basic || d.trainer);
}

export function precons(pool: string): CardDef[][] {
  const list = PRECONS.filter((p) =>
    pool === "starter" ? p.id.startsWith("starter") : pool === "meta" ? !p.id.startsWith("starter") : true,
  );
  return list
    .filter((p) => p.main.every(([, id]) => CARDS[id]?.implemented))
    .map((p) => p.main.flatMap(([n, id]) => Array<CardDef>(n).fill(CARDS[id] as CardDef)));
}

const TYPES: EType[] = ["G", "R", "W", "L", "P", "F", "D", "M"];

/** A random legal deck (60 cards, ≤ 4 per name, ≥ 1 Basic, ≤ 1 ACE SPEC). */
export function randomDeck(defs: CardDef[], rng: Rng): CardDef[] {
  const types = shuffled(rng, TYPES).slice(0, rng() < 0.5 ? 1 : 2);
  const mons = defs.filter((d) => d.category === "pokemon" && d.types?.some((t) => types.includes(t) || t === "C"));
  const basics = mons.filter((d) => d.stage === "basic");
  const byPrev = new Map<string, CardDef[]>();
  for (const d of mons) if (d.evolvesFrom) byPrev.set(d.evolvesFrom, [...(byPrev.get(d.evolvesFrom) ?? []), d]);
  const deck: CardDef[] = [];
  const count = new Map<string, number>();
  const add = (d: CardDef, n: number) => {
    const have = count.get(d.copyName) ?? 0;
    const k = d.energy?.basic ? n : Math.min(n, 4 - have);
    for (let i = 0; i < k && deck.length < 60; i++) deck.push(d);
    count.set(d.copyName, have + k);
  };
  if (!basics.length) return [];
  for (let line = 0; line < 4 + Math.floor(rng() * 3) && deck.length < 22; line++) {
    const b = pickOne(rng, basics);
    add(b, 2 + Math.floor(rng() * 3));
    const s1 = byPrev.get(b.name);
    if (s1?.length) {
      const e1 = pickOne(rng, s1);
      add(e1, 1 + Math.floor(rng() * 3));
      const s2 = byPrev.get(e1.name);
      if (s2?.length) add(pickOne(rng, s2), 1 + Math.floor(rng() * 2));
    }
  }
  const trainers = shuffled(
    rng,
    defs.filter((d) => d.category === "trainer"),
  );
  let ace = false;
  for (const t of trainers) {
    if (deck.length >= 44) break;
    if (t.tags.includes("aceSpec")) {
      if (ace) continue;
      ace = true;
      add(t, 1);
    } else add(t, 1 + Math.floor(rng() * 4));
  }
  const special = shuffled(
    rng,
    defs.filter((d) => d.category === "energy" && !d.energy?.basic),
  ).slice(0, 2);
  for (const e of special) if (deck.length < 50) add(e, 1 + Math.floor(rng() * 2));
  const basicEnergy = types
    .map((t) => defs.find((d) => d.energy?.basic && d.energy.provides[0]?.[0] === t))
    .filter((d): d is CardDef => !!d);
  while (deck.length < 60 && basicEnergy.length) add(pickOne(rng, basicEnergy), 1);
  return deck;
}

/** Two decks for a game of a pool, by seed. */
export function decksFor(pool: string, seed: number): [CardDef[], CardDef[]] {
  const rng = mulberry32(seed * 7919 + 13);
  if (pool === "starter" || pool === "meta" || pool === "precons") {
    const list = precons(pool);
    if (list.length) return [pickOne(rng, list), pickOne(rng, list)];
  }
  const defs = poolDefs(pool);
  return [randomDeck(defs, rng), randomDeck(defs, rng)];
}
