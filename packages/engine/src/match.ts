/**
 * Filters and scopes. Filters read printed characteristics (the top card's definition) and the state of the Pokémon
 * in play, never computed characteristics: statics can then use them without recursion.
 */
import { defOf, opponentOf, pokemonOf, topDef } from "./state";
import type { CardDef, CardFilter, EType, GameState, PlayerId, PokemonFilter, PokemonId, PokemonScope, Side } from "./types";

export function sidePlayers(s: GameState, side: Side, me: PlayerId): PlayerId[] {
  return side === "me" ? [me] : side === "opp" ? [opponentOf(s, me)] : [me, opponentOf(s, me)];
}

// Computed HP lives in statics.ts, which imports this module: a late-bound reference avoids an import-time cycle.
let hpOf: (s: GameState, id: PokemonId) => number = (s, id) => topDef(s, id).hp ?? 0;
export function setHpOf(fn: (s: GameState, id: PokemonId) => number): void {
  hpOf = fn;
}

export function matchPokemon(s: GameState, id: PokemonId, f: PokemonFilter | undefined): boolean {
  if (!f) return true;
  const pk = pokemonOf(s, id);
  const d = topDef(s, id);
  if (f.stage && !f.stage.includes(d.stage ?? "basic")) return false;
  if (f.types && !f.types.some((t) => d.types?.includes(t))) return false;
  if (f.tags && !f.tags.every((t) => d.tags.includes(t))) return false;
  if (f.noTags?.some((t) => d.tags.includes(t))) return false;
  if (f.names && !f.names.includes(d.name)) return false;
  if (f.nameIncludes && !d.name.includes(f.nameIncludes)) return false;
  if (f.damaged !== undefined && pk.damage > 0 !== f.damaged) return false;
  if (f.hasEnergy !== undefined && pk.energy.length > 0 !== f.hasEnergy) return false;
  if (f.hasTool !== undefined && pk.tools.length > 0 !== f.hasTool) return false;
  if (f.hasAbility !== undefined && !!d.abilities?.length !== f.hasAbility) return false;
  if (f.conditioned !== undefined) {
    const c = pk.cond;
    if (!!(c.rotating || c.poisoned || c.burned) !== f.conditioned) return false;
  }
  if (f.maxHp !== undefined && (d.hp ?? 0) > f.maxHp) return false;
  // Remaining HP reads computed HP: never used by a static's scope (it would recurse).
  if (f.maxRemainingHp !== undefined && hpOf(s, id) - pk.damage > f.maxRemainingHp) return false;
  if (f.selfKOAbility !== undefined && !!d.abilities?.some((a) => a.selfKO) !== f.selfKOAbility) return false;
  if (f.abilityNamed !== undefined && !d.abilities?.some((a) => a.name === f.abilityNamed)) return false;
  if (f.attackNamed !== undefined && !d.attacks?.some((a) => a.name === f.attackNamed)) return false;
  if (f.attachedNamed !== undefined && ![...pk.tools, ...pk.energy].some((t) => defOf(s, t).name === f.attachedNamed))
    return false;
  if (f.specialEnergy !== undefined && pk.energy.some((e) => !defOf(s, e).energy?.basic) !== f.specialEnergy) return false;
  if (f.resistance !== undefined && d.resistance?.type !== f.resistance) return false;
  if (f.maxEnergy !== undefined && pk.energy.length > f.maxEnergy) return false;
  if (f.status) {
    const c = pk.cond;
    const has = (k: string) => (k === "poisoned" ? !!c.poisoned : k === "burned" ? !!c.burned : c.rotating === k);
    if (!f.status.some(has)) return false;
  }
  if (f.energyTypes) {
    const types = f.energyTypes;
    const provides = (e: string) =>
      (defOf(s, e).energy?.provides ?? []).some((u) => u.some((t) => t === "*" || types.includes(t as EType)));
    if (!pk.energy.some(provides)) return false;
  }
  if (f.enteredBefore !== undefined && pk.enteredTurn < s.turn.number !== f.enteredBefore) return false;
  if (f.not && matchPokemon(s, id, f.not)) return false;
  return true;
}

/** Is a Pokémon in a scope? `owner`: the player the scope is relative to; `source`: the scope's "self". */
export function inScope(s: GameState, scope: PokemonScope, owner: PlayerId, source: PokemonId | null, id: PokemonId): boolean {
  const pk = s.pokemon[id];
  if (!pk) return false;
  if (scope.ids && !scope.ids.includes(id)) return false;
  if (scope.self && id !== source) return false;
  if (scope.notSelf && id === source) return false;
  if (!sidePlayers(s, scope.side, owner).includes(pk.owner)) return false;
  const ps = s.players[pk.owner];
  const active = ps?.active === id;
  if (scope.where === "active" && !active) return false;
  if (scope.where === "bench" && active) return false;
  return matchPokemon(s, id, scope.filter);
}

/** The Pokémon of a scope, Active first. */
export function scopePokemon(s: GameState, scope: PokemonScope, owner: PlayerId, source: PokemonId | null): PokemonId[] {
  const out: PokemonId[] = [];
  for (const p of sidePlayers(s, scope.side, owner)) {
    const ps = s.players[p];
    if (!ps) continue;
    for (const id of ps.active ? [ps.active, ...ps.bench] : ps.bench) if (inScope(s, scope, owner, source, id)) out.push(id);
  }
  return out;
}

/** Does a card definition match a filter? `me`: the player the filter is relative to. */
export function matchCard(s: GameState, d: CardDef, f: CardFilter | undefined, me: PlayerId): boolean {
  if (!f) return true;
  if (f.category && !f.category.includes(d.category)) return false;
  if (f.stage && (d.category !== "pokemon" || !f.stage.includes(d.stage ?? "basic"))) return false;
  if (f.types && (d.category !== "pokemon" || !f.types.some((t) => d.types?.includes(t)))) return false;
  if (f.trainer && (!d.trainer || !f.trainer.includes(d.trainer.kind))) return false;
  if (f.basicEnergy !== undefined && !!d.energy?.basic !== f.basicEnergy) return false;
  if (f.energyTypes) {
    if (!d.energy) return false;
    const provided = d.energy.provides.flat();
    if (!f.energyTypes.some((t) => provided.includes(t))) return false;
  }
  if (f.names && !f.names.includes(d.name)) return false;
  if (f.nameIncludes && !d.name.includes(f.nameIncludes)) return false;
  if (f.tags && !f.tags.every((t) => d.tags.includes(t))) return false;
  if (f.noTags?.some((t) => d.tags.includes(t))) return false;
  if (f.maxHp !== undefined && (d.category !== "pokemon" || (d.hp ?? 0) > f.maxHp)) return false;
  if (f.evolvesFrom !== undefined && d.evolvesFrom !== f.evolvesFrom) return false;
  if (f.resistance !== undefined && d.resistance?.type !== f.resistance) return false;
  if (f.attackNamed !== undefined && !d.attacks?.some((a) => a.name === f.attackNamed)) return false;
  if (f.abilityNamed !== undefined && !d.abilities?.some((a) => a.name === f.abilityNamed)) return false;
  if (f.evolvesFromInPlay) {
    if (!d.evolvesFrom) return false;
    const names = sidePlayers(s, f.evolvesFromInPlay, me).flatMap((p) => {
      const ps = s.players[p];
      return ps ? [ps.active, ...ps.bench].filter((x): x is string => !!x).map((id) => topDef(s, id).name) : [];
    });
    if (!names.includes(d.evolvesFrom)) return false;
  }
  if (f.anyOf && !f.anyOf.some((x) => matchCard(s, d, x, me))) return false;
  if (f.not && matchCard(s, d, f.not, me)) return false;
  return true;
}
