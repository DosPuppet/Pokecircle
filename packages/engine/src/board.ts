/**
 * Board mechanics shared by the main-phase actions and the effects: benching, evolving, switching, removing Pokémon,
 * attaching cards.
 */
import { clearConditions, endAttackEffects } from "./conditions";
import { putCounters } from "./damage";
import { emit } from "./events";
import {
  bump,
  cardsOfPokemon,
  createPokemon,
  defOf,
  inPlay,
  moveCard,
  obj,
  opponentOf,
  playerOf,
  pokemonOf,
  putOnPokemon,
  removePokemon,
  topDef,
} from "./state";
import { benchSize, rulesOn } from "./statics";
import { queueTriggers } from "./triggers";
import type { GameState, ObjectId, PlayerId, PokemonId } from "./types";

/** Puts a Basic Pokémon card onto its owner's Bench. `fromHand`: played from the hand (its triggers). */
export function benchCard(s: GameState, card: ObjectId, fromHand: boolean): PokemonId | null {
  const o = obj(s, card);
  const ps = playerOf(s, o.owner);
  if (ps.bench.length >= benchSize(s, o.owner)) return null;
  const id = createPokemon(s, card);
  ps.bench.push(id);
  bump(s);
  s.turnLog.push({ turn: s.turn.number, player: o.owner, kind: "benched", pokemon: id, defId: o.defId });
  // Stadiums that watch every Pokémon put onto a Bench during its owner's turn (Risky Ruins).
  if (o.owner === s.turn.active) queueTriggers(s, "benched", id, { event: { pokemon: id } });
  if (fromHand) {
    emit({ type: "playBasic", player: o.owner, card, defId: o.defId, pokemon: id });
    queueTriggers(s, "playedToBench", id, { card });
  } else emit({ type: "move", player: o.owner, card, defId: o.defId, from: "deck", to: "inPlay" });
  return id;
}

/** Evolves a Pokémon with an Evolution card (R-EVOLVE-3). */
export function evolvePokemon(s: GameState, card: ObjectId, target: PokemonId, fromHand: boolean): void {
  const from = topDef(s, target).id;
  putOnPokemon(s, card, target, "cards");
  const pk = pokemonOf(s, target);
  pk.evolvedTurn = s.turn.number;
  // Dizzying Valley: a Confused Pokémon stays Confused when it evolves.
  const keep = pk.cond.rotating === "confused" && rulesOn(s, "keepConfused", target).length > 0;
  clearConditions(s, target);
  if (keep) pk.cond.rotating = "confused";
  endAttackEffects(s, target);
  s.turnLog.push({ turn: s.turn.number, player: pk.owner, kind: "evolved", pokemon: target, defId: obj(s, card).defId });
  emit({ type: "evolve", player: pk.owner, pokemon: target, defId: obj(s, card).defId, from });
  if (fromHand) queueTriggers(s, "evolved", target, { card });
}

/** Switches a player's Active Pokémon with a Benched one (not a retreat, R-RETREAT-4). */
export function switchActive(s: GameState, p: PlayerId, to: PokemonId, retreat = false): void {
  const ps = playerOf(s, p);
  const from = ps.active;
  if (!ps.bench.includes(to)) return;
  ps.bench = ps.bench.filter((x) => x !== to);
  if (from) {
    ps.bench.push(from);
    clearConditions(s, from);
  }
  ps.active = to;
  bump(s);
  s.turnLog.push({ turn: s.turn.number, player: p, kind: "becameActive", pokemon: to });
  if (from) emit({ type: retreat ? "retreat" : "switch", player: p, from, to });
  queueTriggers(s, "becameActive", to);
  for (const id of inPlay(s, p)) if (id !== to) queueTriggers(s, "allyBecameActive", id, { event: { pokemon: to } });
  if (from) queueTriggers(s, "movedToBench", from);
  // "Whenever your opponent's Active Pokémon moves to the Bench during their turn" (Team Rocket's Dugtrio, Magcargo).
  if (from && s.turn.active === p)
    for (const id of inPlay(s, opponentOf(s, p))) queueTriggers(s, "oppToBench", id, { event: { pokemon: from } });
}

/** Removes a Pokémon from play, moving all its cards to a zone. */
export function pokemonLeaves(s: GameState, id: PokemonId, to: "hand" | "deck" | "discard" | "lostZone"): ObjectId[] {
  const cards = cardsOfPokemon(s, id);
  removePokemon(s, id);
  return cards.map((c) => moveCard(s, c, to));
}

/** Attaches an Energy or Tool card to a Pokémon. `fromHand`: its "when you attach this card from your hand" triggers. */
export function attachCard(s: GameState, card: ObjectId, target: PokemonId, fromHand: boolean): void {
  const d = defOf(s, card);
  putOnPokemon(s, card, target, d.category === "energy" ? "energy" : "tools");
  const owner = pokemonOf(s, target).owner;
  emit({ type: "attach", player: owner, card, defId: d.id, pokemon: target });
  if (d.category === "energy") s.turnLog.push({ turn: s.turn.number, player: owner, kind: "energyAttached", pokemon: target });
  if (fromHand) queueTriggers(s, "attached", target, { card });
  // "whenever they attach an Energy card from their hand to the Defending Pokémon, place 8 damage counters on it"
  if (fromHand && d.category === "energy")
    for (const st of rulesOn(s, "onAttach", target)) {
      if (st.rule.counters) putCounters(s, null, target, st.rule.counters);
      if (st.rule.endsTurn) s.turn.ending = true;
    }
}
