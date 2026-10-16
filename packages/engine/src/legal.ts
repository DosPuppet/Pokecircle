/**
 * What a player may do in their main phase (docs/rules.md R-TURN-2). The same predicates offer the options
 * (`legalActions`, for the interface, the AI and the autopilot) and validate decisions (`actions.ts`).
 */
import { computeAttackDamage } from "./damage";
import { evalCond } from "./effects";
import { canPay, suggestRetreat, unitsOf } from "./energy";
import { matchCard } from "./match";
import { defOf, inPlay, isFirstTurnOf, opponentOf, playerOf, pokemonOf, topDef } from "./state";
import { type AttackOption, benchSize, canPlayKind, canPlayPokemonCard, chars, rulesOn, toolSlots } from "./statics";
import type { ActionOption, CardDef, GameState, ObjectId, PlayerId, PokemonId } from "./types";

const ctxFor = (p: PlayerId, card: ObjectId | null, source: PokemonId | null = null) => ({
  player: p,
  source,
  card,
  vars: {},
});

export function inHand(s: GameState, p: PlayerId, card: ObjectId): boolean {
  return playerOf(s, p).hand.includes(card);
}

export function canPlayBasic(s: GameState, p: PlayerId, card: ObjectId): boolean {
  if (!inHand(s, p, card)) return false;
  const d = defOf(s, card);
  // A Trainer played as a Pokémon (Fossils) is also an Item: Item locks apply.
  const asPokemon = !!d.trainer?.asPokemon && implementedTrainer(d) && canPlayKind(s, p, "item", d.tags);
  const basic = d.category === "pokemon" && d.stage === "basic" && canPlayPokemonCard(s, p, d);
  return (basic || asPokemon) && playerOf(s, p).bench.length < benchSize(s, p);
}

/** Trainer cards in play as Pokémon that their owner may discard (main phase of their turn). */
export function discardableFromPlay(s: GameState, p: PlayerId): PokemonId[] {
  return inPlay(s, p).filter((id) => !!topDef(s, id).trainer?.discardFromPlay);
}

/** R-EVOLVE-2. */
export function evolveTargets(s: GameState, p: PlayerId, card: ObjectId): PokemonId[] {
  if (!inHand(s, p, card)) return [];
  const d = defOf(s, card);
  if (d.category !== "pokemon" || d.stage === "basic" || !d.evolvesFrom || !canPlayPokemonCard(s, p, d)) return [];
  const firstTurn = isFirstTurnOf(s, p);
  return inPlay(s, p).filter((id) => {
    // "This Pokémon can evolve during your first turn or the turn you play it."
    if (firstTurn && !rulesOn(s, "evolveSameTurn", id).some((st) => st.rule.firstTurn)) return false;
    const pk = pokemonOf(s, id);
    // Forest of Vitality: some Pokémon can evolve during the turn they are put into play.
    const fresh = pk.enteredTurn >= s.turn.number || pk.evolvedTurn === s.turn.number;
    const named =
      topDef(s, id).name === d.evolvesFrom ||
      rulesOn(s, "evolvesAs", id).some((st) => st.rule.name === d.evolvesFrom && matchCard(s, d, st.rule.filter, p));
    return (
      named &&
      (!fresh ||
        // The Evolution card must also be of the rule's types ("{G} Pokémon can evolve into {G} Pokémon").
        rulesOn(s, "evolveSameTurn", id).some(
          (st) => !st.rule.scope.filter?.types || st.rule.scope.filter.types.some((t) => d.types?.includes(t)),
        )) &&
      rulesOn(s, "cantEvolve", id).length === 0
    );
  });
}

/** R-TURN-2c. */
export function attachTargets(s: GameState, p: PlayerId, card: ObjectId): PokemonId[] {
  if (!inHand(s, p, card) || s.turn.energyAttached) return [];
  const d = defOf(s, card);
  if (d.category !== "energy") return [];
  return inPlay(s, p).filter(
    (id) =>
      rulesOn(s, "cantAttach", id).length === 0 &&
      (!d.energy?.attachCondition || evalCond(s, ctxFor(p, card, id), d.energy.attachCondition)),
  );
}

function implementedTrainer(d: CardDef): boolean {
  return !!d.trainer && (d.implemented || !!d.trainer.effects || !!d.trainer.statics);
}

/** Can a Trainer card be played (R-TURN-2d, R-TURN-4, R-TEXT-3)? Tools: see `toolTargets`. */
export function trainerPlayable(s: GameState, p: PlayerId, card: ObjectId): boolean {
  if (!inHand(s, p, card)) return false;
  const d = defOf(s, card);
  const t = d.trainer;
  if (!t || !implementedTrainer(d) || !canPlayKind(s, p, t.kind, d.tags)) return false;
  // R-TURN-3: no Supporter on the first player's first turn, unless the card says so (it went first, by definition).
  if (t.kind === "supporter" && (s.turn.supporterPlayed || (s.turn.number === 1 && !t.firstTurnOk))) return false;
  if (t.kind === "stadium") {
    // "You can put this card into play only if you discard a Prism Tower in play, … during the same turn".
    if (t.replaces) return !!s.stadium && defOf(s, s.stadium).name === t.replaces;
    if (s.turn.stadiumPlayed) return false;
    if (s.stadium && defOf(s, s.stadium).name === d.name) return false;
  }
  if (t.kind === "tool") return toolTargets(s, p, card).length > 0;
  // A Stadium's condition is the one of its action (`stadiumActionUsable`), not of playing the card.
  if (t.kind === "stadium") return true;
  return !t.condition || evalCond(s, ctxFor(p, card), t.condition);
}

export function toolTargets(s: GameState, p: PlayerId, card: ObjectId): PokemonId[] {
  const d = defOf(s, card);
  if (d.trainer?.kind !== "tool" || !inHand(s, p, card) || !canPlayKind(s, p, "tool")) return [];
  return inPlay(s, p).filter(
    (id) =>
      pokemonOf(s, id).tools.length < toolSlots(s, id) &&
      (!d.trainer?.condition || evalCond(s, ctxFor(p, card, id), d.trainer.condition)),
  );
}

/** Can a Pokémon's Ability be used now? */
export function abilityUsable(s: GameState, p: PlayerId, id: PokemonId, index: number): boolean {
  const pk = s.pokemon[id];
  if (!pk || pk.owner !== p) return false;
  const d = topDef(s, id);
  const ab = d.abilities?.[index];
  const act = ab?.activated;
  if (!ab || !act || !chars(s, id).abilities.includes(index)) return false;
  const active = playerOf(s, p).active === id;
  if (act.where === "active" && !active) return false;
  if (act.where === "bench" && active) return false;
  const once = act.once ?? "turn";
  const used = (key: string) => s.turnLog.some((e) => e.turn === s.turn.number && e.kind === "abilityUsed" && e.key === key);
  if (once === "turn" && used(abilityKey(id, index))) return false;
  if (once === "turnByName" && used(`name:${p}:${ab.name}`)) return false;
  if (once === "game" && s.usedOnce.includes(`${p}:${d.name}:${ab.name}`)) return false;
  return !act.condition || evalCond(s, ctxFor(p, pk.cards.at(-1) ?? null, id), act.condition);
}

export const abilityKey = (id: PokemonId, index: number) => `${id}:${index}`;

export function stadiumActionUsable(s: GameState, p: PlayerId): boolean {
  if (!s.stadium) return false;
  const t = defOf(s, s.stadium).trainer;
  if (!t?.stadiumAction || !t.effects) return false;
  if (s.turnLog.some((e) => e.turn === s.turn.number && e.key === `stadium:${p}`)) return false;
  return !t.condition || evalCond(s, ctxFor(p, s.stadium), t.condition);
}

/** R-RETREAT: the Retreat option, or null. */
export function retreatOption(s: GameState, p: PlayerId): Extract<ActionOption, { type: "retreat" }> | null {
  const ps = playerOf(s, p);
  const id = ps.active;
  if (!id || s.turn.retreated || !ps.bench.length) return null;
  const pk = pokemonOf(s, id);
  if (pk.cond.rotating === "asleep" || pk.cond.rotating === "paralyzed") return null;
  if (rulesOn(s, "cantRetreat", id).length) return null;
  const cost = chars(s, id).retreat;
  const suggested = suggestRetreat(s, id, cost);
  if (!suggested) return null;
  return { type: "retreat", to: [...ps.bench], cost, energy: [...pk.energy], suggested };
}

/** The attacks of the Active Pokémon that can be used now (R-ATTACK-1, R-COND-2, R-TURN-4). */
export function usableAttacks(s: GameState, p: PlayerId): AttackOption[] {
  const id = playerOf(s, p).active;
  if (!id) return [];
  const pk = pokemonOf(s, id);
  if (pk.cond.rotating === "asleep" || pk.cond.rotating === "paralyzed") return [];
  const locks = rulesOn(s, "cantAttack", id);
  const units = unitsOf(s, id);
  const again = s.turn.again;
  return chars(s, id).attacks.filter(
    (a) =>
      // R-TURN-4: no attack on the first player's first turn, except attacks that say so.
      (s.turn.number !== 1 || a.def.firstTurn || rulesOn(s, "firstTurnAttacks", id).length > 0) &&
      // After a first attack, only the attack it may use again (Festival Lead).
      (s.turn.attacks === 0 || (!!again && again.index === a.index && again.source === a.source)) &&
      !locks.some((l) => !l.rule.attack || l.rule.attack === a.def.name) &&
      canPay(units, a.cost) &&
      (a.def.effects !== undefined || !a.def.text) &&
      (!a.def.condition || evalCond(s, ctxFor(p, null, id), a.def.condition)),
  );
}

/** Damage an attack would do to the Defending Pokémon (no coin flips, no choices). */
export function attackPreview(s: GameState, p: PlayerId, a: AttackOption): { damage: number; ko: boolean } | undefined {
  const id = playerOf(s, p).active;
  const target = playerOf(s, opponentOf(s, p)).active;
  if (!id || !target || !a.def.damage) return undefined;
  const r = { player: p, source: id, attack: { name: a.def.name } };
  const { amount } = computeAttackDamage(s, r, target, a.def.damage);
  return { damage: amount, ko: amount > 0 && pokemonOf(s, target).damage + amount >= chars(s, target).hp };
}

/** Every option of the player's main phase. */
export function legalActions(s: GameState, p: PlayerId): ActionOption[] {
  if (s.pending?.kind !== "main" || s.pending.player !== p) return [];
  const out: ActionOption[] = [];
  const ps = playerOf(s, p);
  // After a first attack (Festival Lead): the second attack, or the end of the turn.
  if (s.turn.attacks > 0) {
    for (const a of usableAttacks(s, p)) {
      const o: Extract<ActionOption, { type: "attack" }> = { type: "attack", index: a.index, name: a.def.name, cost: a.cost };
      if (a.source) o.source = a.source;
      out.push(o);
    }
    out.push({ type: "endTurn" });
    return out;
  }
  for (const card of ps.hand) {
    const d = defOf(s, card);
    if (d.trainer?.asPokemon) {
      if (canPlayBasic(s, p, card)) out.push({ type: "playBasic", card });
    } else if (d.category === "pokemon") {
      if (canPlayBasic(s, p, card)) out.push({ type: "playBasic", card });
      const targets = evolveTargets(s, p, card);
      if (targets.length) out.push({ type: "evolve", card, targets });
    } else if (d.category === "energy") {
      const targets = attachTargets(s, p, card);
      if (targets.length) out.push({ type: "attachEnergy", card, targets });
    } else if (d.trainer?.kind === "tool") {
      const targets = toolTargets(s, p, card);
      if (targets.length) out.push({ type: "playTrainer", card, targets });
    } else if (trainerPlayable(s, p, card)) out.push({ type: "playTrainer", card });
  }
  for (const id of inPlay(s, p))
    (topDef(s, id).abilities ?? []).forEach((_, i) => {
      if (abilityUsable(s, p, id, i)) out.push({ type: "useAbility", pokemon: id, ability: i });
    });
  if (stadiumActionUsable(s, p)) out.push({ type: "stadiumAction" });
  for (const pokemon of discardableFromPlay(s, p)) out.push({ type: "discardFromPlay", pokemon });
  const retreat = retreatOption(s, p);
  if (retreat) out.push(retreat);
  for (const a of usableAttacks(s, p)) {
    const preview = attackPreview(s, p, a);
    const o: Extract<ActionOption, { type: "attack" }> = { type: "attack", index: a.index, name: a.def.name, cost: a.cost };
    if (a.source) o.source = a.source;
    if (preview) o.preview = preview;
    out.push(o);
  }
  out.push({ type: "endTurn" });
  return out;
}
