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
import { bump, flipCoin, isActive, moveCard, opponentOf, playerOf, pokemonOf } from "./state";
import { chars, rulesOn } from "./statics";
import { queueTriggers } from "./triggers";
import type { GameState, ObjectId, PlayerId, PokemonId, Resolution } from "./types";

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

/** Is damage (`amount`) from an attack of `attacker` to `target` prevented? */
function damagePrevented(
  s: GameState,
  attacker: PokemonId | null,
  attackerOwner: PlayerId,
  target: PokemonId,
  amount: number,
): boolean {
  const t = pokemonOf(s, target);
  // R-RULEBOX-2: a Tera Pokémon on the Bench takes no damage from attacks, both players'.
  if (chars(s, target).tags.includes("tera") && !isActive(s, target)) return true;
  return rulesOn(s, "prevent", target).some(
    (st) =>
      (st.rule.what === "damage" || st.rule.what === "all") &&
      (st.rule.anyAttacker || attackerOwner !== t.owner) &&
      (st.rule.maxDamage === undefined || amount <= st.rule.maxDamage) &&
      (st.rule.minDamage === undefined || amount >= st.rule.minDamage) &&
      !st.rule.flip &&
      (!st.rule.from || (attacker !== null && !!s.pokemon[attacker] && matchPokemon(s, attacker, st.rule.from))),
  );
}

/**
 * Are the effects (other than damage) on `target` prevented? Attacks: `prevent` rules; the opponent's Abilities and
 * Trainer cards: `shielded` rules ("Prevent all effects of your opponent's Pokémon's Abilities done to this Pokémon").
 */
export function attackEffectsPrevented(s: GameState, r: Resolution, target: PokemonId): boolean {
  const t = pokemonOf(s, target);
  if (t.owner === r.player) return false;
  if (r.kind !== "attack") {
    const d = s.defs[r.defId];
    const ability = (r.kind === "ability" || r.kind === "trigger") && d?.category === "pokemon";
    const trainer = r.kind === "trainer" || r.kind === "stadium" || (r.kind === "trigger" && d?.category === "trainer");
    const supporter = trainer && d?.trainer?.kind === "supporter";
    return rulesOn(s, "shielded", target).some(
      (st) =>
        st.rule.from === "all" ||
        (st.rule.from === "abilities" && ability) ||
        (st.rule.from === "trainers" && trainer) ||
        (st.rule.from === "supporters" && supporter),
    );
  }
  return rulesOn(s, "prevent", target).some(
    (st) =>
      (st.rule.what === "effects" || st.rule.what === "all") &&
      (!st.rule.from || (r.source !== null && !!s.pokemon[r.source] && matchPokemon(s, r.source, st.rule.from))),
  );
}

/** The damage an attack would do to a target (no state change): used by the damage itself and by previews. */
export function computeAttackDamage(
  s: GameState,
  r: Pick<Resolution, "player" | "source"> & { attack?: { name?: string } },
  target: PokemonId,
  base: number,
  opts: DamageOptions = {},
): { amount: number; weakness: boolean; resistance: boolean; prevented: boolean; consumed: ObjectId[] } {
  const out = { amount: 0, weakness: false, resistance: false, prevented: false, consumed: [] as ObjectId[] };
  if (base <= 0) return out;
  const t = pokemonOf(s, target);
  const attacker = r.source;
  const opponent = t.owner !== r.player;
  const toOppActive = opponent && isActive(s, target);
  // Walking Wake ex's Azure Seas: none of this Pokémon's attacks are affected by effects on the Defending Pokémon.
  if (attacker && s.pokemon[attacker] && rulesOn(s, "ignoreEffects", attacker).length) opts = { ...opts, ignoreEffects: true };
  let n = base;
  if (attacker && s.pokemon[attacker] && opponent)
    for (const st of rulesOn(s, "dealt", attacker)) {
      if (st.rule.activeOnly && !toOppActive) continue;
      if (st.rule.vs && !matchPokemon(s, target, st.rule.vs)) continue;
      if (st.rule.attack && st.rule.attack !== r.attack?.name) continue;
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
      if (st.rule.consume && st.card) out.consumed.push(st.card);
    }
  if (damagePrevented(s, attacker, r.player, target, Math.max(0, n))) {
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
  // "…, and discard this card" (Berries): once it reduced the damage.
  for (const c of res.consumed) if (s.objects[c]?.host === target) moveCard(s, c, "discard");
  // "If any damage is done to this Pokémon by attacks, flip a coin. If heads, prevent that damage."
  if (res.amount > 0 && t.owner !== r.player)
    for (const st of rulesOn(s, "prevent", target))
      if (st.rule.flip && (st.rule.what === "damage" || st.rule.what === "all") && flipCoin(s, t.owner)) {
        res.amount = 0;
        res.prevented = true;
        break;
      }
  if (res.amount > 0) {
    // "If this Pokémon has full HP and would be Knocked Out by damage from an attack, it is not Knocked Out, and its
    // remaining HP becomes 10."
    const hp = chars(s, target).hp;
    if (t.damage + res.amount >= hp) {
      const survive = rulesOn(s, "survive", target).find(
        (st) => (!st.rule.byOpponent || t.owner !== r.player) && (!st.rule.fullHp || t.damage === 0),
      );
      if (survive && (!survive.rule.flip || flipCoin(s, t.owner))) {
        res.amount = Math.max(0, hp - survive.rule.hp - t.damage);
        if (survive.rule.consume && survive.card && s.objects[survive.card]?.host === target)
          moveCard(s, survive.card, "discard");
      }
    }
  }
  if (res.amount > 0) {
    t.damage += res.amount;
    bump(s);
    s.turnLog.push({ turn: s.turn.number, player: t.owner, kind: "damagedByAttack", pokemon: target, amount: res.amount });
    queueTriggers(s, "damagedByAttack", target, {
      attacker: r.player,
      // Read when the trigger resolves, maybe after a Knock Out: the facts at the time of the damage.
      event: {
        ...(r.source ? { attacker: r.source } : {}),
        amount: String(res.amount),
        ...(isActive(s, target) ? { wasActive: "1" } : {}),
      },
    });
    // "If this Pokémon is damaged by an attack (even if it is Knocked Out), put N damage counters on the Attacking Pokémon."
    if (r.source && s.pokemon[r.source] && t.owner !== r.player)
      for (const st of rulesOn(s, "retaliate", target))
        putCounters(s, null, r.source, st.rule.asDamage ? res.amount / 10 : st.rule.counters);
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
  s.turnLog.push({ turn: s.turn.number, player: pk.owner, kind: "healed", pokemon: target, amount: healed });
  bump(s);
  emit({ type: "heal", target, amount: healed });
  return healed;
}

/** The opponent's Active Pokémon, for a player. */
export function opponentActive(s: GameState, p: PlayerId): PokemonId | null {
  return playerOf(s, opponentOf(s, p)).active;
}
