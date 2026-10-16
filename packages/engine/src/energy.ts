/**
 * Energy: what attached cards provide, and paying costs (R-ATTACK-1, R-RETREAT-1). Each card provides units; a unit is
 * a set of types it may count as (`"*"`: any type). A cost is paid when its typed symbols can each be matched to a
 * distinct unit that can provide that type, and enough units remain for its Colorless symbols.
 */

import { evalCond, staticCtx } from "./effects";
import { matchPokemon } from "./match";
import { defOf, pokemonOf } from "./state";
import { rulesOn } from "./statics";
import type { EType, GameState, ObjectId, PokemonId } from "./types";

export type Unit = string[];

/** Units provided by an attached Energy card. */
export function unitsOfCard(s: GameState, card: ObjectId): Unit[] {
  return defOf(s, card).energy?.provides ?? [];
}

/** Units provided by all Energy attached to a Pokémon (Basic Energy may provide more: `energyAs` rules). */
export function unitsOf(s: GameState, id: PokemonId): Unit[] {
  const as = rulesOn(s, "energyAs", id);
  return pokemonOf(s, id).energy.flatMap((e) => {
    const d = defOf(s, e);
    const basic = d.energy?.basic ? d.energy.provides[0]?.[0] : undefined;
    const rule = basic ? as.find((st) => st.rule.basic === basic) : undefined;
    if (rule) return rule.rule.provides;
    const cond = d.energy?.providesIf;
    if (cond && matchPokemon(s, id, cond.filter) && (!cond.cond || evalCond(s, staticCtx(pokemonOf(s, id).owner, id), cond.cond)))
      return cond.provides;
    return unitsOfCard(s, e);
  });
}

const provides = (u: Unit, t: EType) => u.includes(t) || u.includes("*");

/** Can these units pay this cost? */
export function canPay(units: Unit[], cost: EType[]): boolean {
  const typed = cost.filter((c) => c !== "C");
  if (units.length < cost.length) return false;
  // Assign typed symbols to distinct units (backtracking; a handful of units at most).
  const used = new Array<boolean>(units.length).fill(false);
  const assign = (i: number): boolean => {
    if (i === typed.length) return true;
    const t = typed[i] as EType;
    for (let j = 0; j < units.length; j++) {
      if (used[j] || !provides(units[j] as Unit, t)) continue;
      used[j] = true;
      if (assign(i + 1)) return true;
      used[j] = false;
    }
    return false;
  };
  return assign(0);
}

/** Energy units of a type attached to a Pokémon (cards providing it count once per unit). */
export function countUnits(s: GameState, id: PokemonId, type?: EType): number {
  return unitsOf(s, id).filter((u) => !type || provides(u, type)).length;
}

/**
 * Energy cards to discard for a Retreat Cost: enough units, and no card that could be kept (R-RETREAT-1). Returns
 * whether `cards` is such a payment.
 */
export function isRetreatPayment(s: GameState, id: PokemonId, cards: ObjectId[], cost: number): boolean {
  const pk = pokemonOf(s, id);
  if (new Set(cards).size !== cards.length || cards.some((c) => !pk.energy.includes(c))) return false;
  const total = (list: ObjectId[]) => list.reduce((n, c) => n + unitsOn(s, id, c), 0);
  if (cost <= 0) return cards.length === 0;
  if (total(cards) < cost) return false;
  return cards.every((c) => total(cards.filter((x) => x !== c)) < cost);
}

/** Units one attached card provides on its Pokémon (with `energyAs` rules). */
export function unitsOn(s: GameState, id: PokemonId, card: ObjectId): number {
  const d = defOf(s, card);
  const basic = d.energy?.basic ? d.energy.provides[0]?.[0] : undefined;
  const rule = basic ? rulesOn(s, "energyAs", id).find((st) => st.rule.basic === basic) : undefined;
  return rule ? rule.rule.provides.length : unitsOfCard(s, card).length;
}

/** A suggested retreat payment: the fewest cards, Basic Energy and single units first. */
export function suggestRetreat(s: GameState, id: PokemonId, cost: number): ObjectId[] | null {
  const pk = pokemonOf(s, id);
  if (cost <= 0) return [];
  const cards = [...pk.energy].sort((a, b) => {
    const da = defOf(s, a);
    const db = defOf(s, b);
    return Number(!!db.energy?.basic) - Number(!!da.energy?.basic) || unitsOn(s, id, a) - unitsOn(s, id, b);
  });
  const out: ObjectId[] = [];
  let n = 0;
  for (const c of cards) {
    if (n >= cost) break;
    out.push(c);
    n += unitsOn(s, id, c);
  }
  if (n < cost) return null;
  // Drop cards that are not needed (a two-unit card may cover what the first ones did).
  for (const c of [...out]) {
    const rest = out.filter((x) => x !== c);
    if (rest.reduce((k, x) => k + unitsOn(s, id, x), 0) >= cost) out.splice(out.indexOf(c), 1);
  }
  return out;
}
