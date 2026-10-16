/** Special Conditions (docs/rules.md R-COND): rotating ones replace each other; Poisoned and Burned are markers. */
import { emit } from "./events";
import { bump, pokemonOf } from "./state";
import { rulesOn } from "./statics";
import type { GameState, PokemonId, SpecialCondition } from "./types";

/** Can a Pokémon be affected by Special Conditions (by this one)? */
export function canBeConditioned(s: GameState, id: PokemonId, cond?: SpecialCondition): boolean {
  return !rulesOn(s, "noConditions", id).some((st) => !st.rule.only || (!!cond && st.rule.only.includes(cond)));
}

export function addCondition(s: GameState, id: PokemonId, cond: SpecialCondition, poison?: number): boolean {
  if (!s.pokemon[id] || !canBeConditioned(s, id, cond)) return false;
  const c = pokemonOf(s, id).cond;
  if (cond === "poisoned") c.poisoned = Math.max(c.poisoned ?? 0, poison ?? 1);
  else if (cond === "burned") c.burned = true;
  else {
    c.rotating = cond;
    if (cond === "paralyzed") c.paralyzedTurn = s.turn.number;
    else delete c.paralyzedTurn;
  }
  bump(s);
  emit({ type: "condition", target: id, cond, on: true });
  return true;
}

export function removeCondition(s: GameState, id: PokemonId, cond: SpecialCondition): void {
  const c = pokemonOf(s, id).cond;
  const had = cond === "poisoned" ? !!c.poisoned : cond === "burned" ? !!c.burned : c.rotating === cond;
  if (!had) return;
  if (cond === "poisoned") delete c.poisoned;
  else if (cond === "burned") delete c.burned;
  else {
    delete c.rotating;
    delete c.paralyzedTurn;
  }
  bump(s);
  emit({ type: "condition", target: id, cond, on: false });
}

/** Removes every Special Condition (R-COND-3), and the effects of attacks on the Pokémon (R-TEXT-4). */
export function clearConditions(s: GameState, id: PokemonId): void {
  for (const c of ["asleep", "confused", "paralyzed", "poisoned", "burned"] as const) removeCondition(s, id, c);
  endAttackEffects(s, id);
}

/** Ends the effects of attacks applied to a Pokémon (it left the Active Spot or evolved). */
export function endAttackEffects(s: GameState, id: PokemonId): void {
  const before = s.effects.length;
  s.effects = s.effects.filter((e) => !(e.attackEffect && "scope" in e.rule && e.rule.scope?.ids?.includes(id)));
  if (s.effects.length !== before) bump(s);
}
