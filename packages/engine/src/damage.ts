/**
 * The only place where damage and damage counters are put on Pokémon (docs/rules.md R-ATTACK-4 to 6, R-RULEBOX-2).
 *
 * Attack damage: base → attacker-side modifiers (`dealt`) → Weakness → Resistance (opponent's Active only) →
 * defender-side modifiers (`taken`) → prevention → floor 0. Damage counters skip every step but prevention of the
 * effects of attacks.
 */
import { evalAmount, staticCtx } from "./effects";
import { emit } from "./events";
import { matchPokemon } from "./match";
import { bump, isActive, opponentOf, playerOf, pokemonOf } from "./state";
import { chars, rulesOn } from "./statics";
import { queueTriggers } from "./triggers";
import type { GameState, PlayerId, PokemonId, Resolution } from "./types";

export interface DamageOptions {
  /** Weakness and Resistance are not applied (they never are outside the opponent's Active Pokémon). */
  noWR?: boolean;
  /** "This attack's damage isn't affected by Weakness" (only). */
  noWeakness?: boolean;
  /** "This attack's damage isn't affected by Resistance" (only). */
  noResistance?: boolean;
  /** "This attack's damage isn't affected by any effects on your opponent's Active Pokémon." */
  ignoreEffects?: boolean;
}

/** Is damage from an attack of `attacker` to `target` prevented? */
function damagePrevented(s: GameState, attacker: PokemonId | null, attackerOwner: PlayerId, target: PokemonId): boolean {
  const t = pokemonOf(s, target);
  // R-RULEBOX-2: a Tera Pokémon on the Bench takes no damage from attacks, both players'.
  if (chars(s, target).tags.includes("tera") && !isActive(s, target)) return true;
  return rulesOn(s, "prevent", target).some(
    (st) =>
      (st.rule.what === "damage" || st.rule.what === "all") &&
      (st.rule.anyAttacker || attackerOwner !== t.owner) &&
      (!st.rule.from || (attacker !== null && !!s.pokemon[attacker] && matchPokemon(s, attacker, st.rule.from))),
  );
}

/** Are the effects of an attack (other than damage) on `target` prevented? */
export function attackEffectsPrevented(s: GameState, r: Resolution, target: PokemonId): boolean {
  if (r.kind !== "attack") return false;
  const t = pokemonOf(s, target);
  if (t.owner === r.player) return false;
  return rulesOn(s, "prevent", target).some(
    (st) =>
      (st.rule.what === "effects" || st.rule.what === "all") &&
      (!st.rule.from || (r.source !== null && !!s.pokemon[r.source] && matchPokemon(s, r.source, st.rule.from))),
  );
}

/** The damage an attack would do to a target (no state change): used by the damage itself and by previews. */
export function computeAttackDamage(
  s: GameState,
  r: Pick<Resolution, "player" | "source">,
  target: PokemonId,
  base: number,
  opts: DamageOptions = {},
): { amount: number; weakness: boolean; resistance: boolean; prevented: boolean } {
  const out = { amount: 0, weakness: false, resistance: false, prevented: false };
  if (base <= 0) return out;
  const t = pokemonOf(s, target);
  const attacker = r.source;
  const opponent = t.owner !== r.player;
  const toOppActive = opponent && isActive(s, target);
  let n = base;
  if (attacker && s.pokemon[attacker] && opponent)
    for (const st of rulesOn(s, "dealt", attacker)) {
      if (st.rule.activeOnly && !toOppActive) continue;
      if (st.rule.vs && !matchPokemon(s, target, st.rule.vs)) continue;
      n += evalAmount(s, staticCtx(st.owner, st.source), st.rule.add);
    }
  if (toOppActive && !opts.noWR && attacker && s.pokemon[attacker]) {
    const types = chars(s, attacker).types;
    const tc = chars(s, target);
    if (tc.weakness && !opts.noWeakness && types.includes(tc.weakness.type)) {
      n *= tc.weakness.mult;
      out.weakness = true;
    }
    if (tc.resistance && !opts.noResistance && types.includes(tc.resistance.type)) {
      n -= tc.resistance.amount;
      out.resistance = true;
    }
  }
  if (opponent && !(opts.ignoreEffects && toOppActive))
    for (const st of rulesOn(s, "taken", target)) {
      if (st.rule.from && !(attacker && s.pokemon[attacker] && matchPokemon(s, attacker, st.rule.from))) continue;
      n += st.rule.add;
    }
  if (damagePrevented(s, attacker, r.player, target)) {
    out.prevented = true;
    return out;
  }
  out.amount = Math.max(0, n);
  return out;
}

/** Puts damage from an attack on a Pokémon. Returns the damage done. */
export function dealAttackDamage(s: GameState, r: Resolution, target: PokemonId, base: number, opts: DamageOptions = {}): number {
  if (!s.pokemon[target] || base <= 0) return 0;
  const res = computeAttackDamage(s, r, target, base, opts);
  const t = pokemonOf(s, target);
  if (res.amount > 0) {
    t.damage += res.amount;
    bump(s);
    s.turnLog.push({ turn: s.turn.number, player: t.owner, kind: "damagedByAttack", pokemon: target });
    queueTriggers(s, "damagedByAttack", target, { attacker: r.player, event: r.source ? { attacker: r.source } : {} });
  }
  emit({
    type: "damage",
    target,
    amount: res.amount,
    ...(r.source ? { source: r.source } : {}),
    ...(res.weakness ? { weakness: true } : {}),
    ...(res.resistance ? { resistance: true } : {}),
    ...(res.prevented ? { prevented: true } : {}),
  });
  return res.amount;
}

/** Puts damage counters (R-ATTACK-6). Returns the counters put. */
export function putCounters(s: GameState, r: Resolution | null, target: PokemonId, n: number): number {
  if (!s.pokemon[target] || n <= 0) return 0;
  if (r && attackEffectsPrevented(s, r, target)) return 0;
  // Battle Cage: no damage counters on Benched Pokémon from effects of the opponent's attacks and Abilities.
  if (r && (r.kind === "attack" || r.kind === "ability") && pokemonOf(s, target).owner !== r.player && !isActive(s, target))
    if (rulesOn(s, "prevent", target).some((st) => st.rule.what === "counters")) return 0;
  pokemonOf(s, target).damage += n * 10;
  bump(s);
  emit({ type: "counters", target, n });
  return n;
}

/** Heals damage (`"all"`: all of it). Returns the damage healed. */
export function healDamage(s: GameState, target: PokemonId, amount: number | "all"): number {
  const pk = s.pokemon[target];
  if (!pk || pk.damage <= 0) return 0;
  const healed = amount === "all" ? pk.damage : Math.min(pk.damage, Math.max(0, amount - (amount % 10)));
  if (healed <= 0) return 0;
  pk.damage -= healed;
  bump(s);
  emit({ type: "heal", target, amount: healed });
  return healed;
}

/** The opponent's Active Pokémon, for a player. */
export function opponentActive(s: GameState, p: PlayerId): PokemonId | null {
  return playerOf(s, opponentOf(s, p)).active;
}
