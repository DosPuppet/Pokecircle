/**
 * State helpers: random numbers, ids, lookups and card movement. Every mutation of what characteristics depend on
 * calls `bump` (statics.ts caches by `version`).
 */
import { emit } from "./events";
import type { CardDef, CardObject, GameState, ObjectId, PlayerId, PlayerState, PokemonId, PokemonInPlay, Zone } from "./types";

/** Deterministic PRNG (mulberry32); its state lives in `s.rng`. Returns [0, 1). */
export function random(s: GameState): number {
  s.rng = (s.rng + 0x6d2b79f5) | 0;
  let t = s.rng;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function shuffle<T>(s: GameState, arr: T[]): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(random(s) * (i + 1));
    [arr[i], arr[j]] = [arr[j] as T, arr[i] as T];
  }
}

/** A flip of a coin, shown to both players (R-TEXT-5). */
export function flipCoin(s: GameState, player: PlayerId, source?: string): boolean {
  const heads = random(s) < 0.5;
  emit(source ? { type: "coinFlip", player, heads, source } : { type: "coinFlip", player, heads });
  return heads;
}

/** Deep copy of plain JSON data (the state is pure JSON: a fuzz invariant). Several times faster than `structuredClone`. */
function copyJson<T>(v: T): T {
  if (typeof v !== "object" || v === null) return v;
  if (Array.isArray(v)) {
    const out = new Array(v.length);
    for (let i = 0; i < v.length; i++) out[i] = copyJson(v[i]);
    return out as T;
  }
  const out: Record<string, unknown> = {};
  for (const k in v) out[k] = copyJson((v as Record<string, unknown>)[k]);
  return out as T;
}

/**
 * Working copy of a state. Definitions are immutable and shared (they are the largest part of the state).
 */
export function cloneState(s: GameState): GameState {
  const { defs, ...rest } = s;
  const copy = copyJson(rest) as GameState;
  copy.defs = defs;
  return copy;
}

export function newId(s: GameState, prefix: string): string {
  const n = (s.idCounters[prefix] ?? 0) + 1;
  s.idCounters[prefix] = n;
  return `${prefix}${n}`;
}

/** Invalidates the characteristics cache. */
export function bump(s: GameState): void {
  s.version++;
}

export function playerOf(s: GameState, p: PlayerId): PlayerState {
  const ps = s.players[p];
  if (!ps) throw new Error(`unknown player ${p}`);
  return ps;
}

export function opponentOf(s: GameState, p: PlayerId): PlayerId {
  return s.playerOrder.find((x) => x !== p) as PlayerId;
}

export function obj(s: GameState, id: ObjectId): CardObject {
  const o = s.objects[id];
  if (!o) throw new Error(`unknown object ${id}`);
  return o;
}

export function defOf(s: GameState, id: ObjectId): CardDef {
  const d = s.defs[obj(s, id).defId];
  if (!d) throw new Error(`unknown definition for ${id}`);
  return d;
}

export function pokemonOf(s: GameState, id: PokemonId): PokemonInPlay {
  const p = s.pokemon[id];
  if (!p) throw new Error(`unknown Pokémon ${id}`);
  return p;
}

/** The top card of a Pokémon in play (the Pokémon itself). */
export function topObject(s: GameState, id: PokemonId): CardObject {
  const pk = pokemonOf(s, id);
  return obj(s, pk.cards[pk.cards.length - 1] as ObjectId);
}

export function topDef(s: GameState, id: PokemonId): CardDef {
  return defOf(s, topObject(s, id).id);
}

/** The Pokémon of a player in play: Active first, then the Bench. */
export function inPlay(s: GameState, p: PlayerId): PokemonId[] {
  const ps = playerOf(s, p);
  return ps.active ? [ps.active, ...ps.bench] : [...ps.bench];
}

export function allInPlay(s: GameState): PokemonId[] {
  return s.playerOrder.flatMap((p) => inPlay(s, p));
}

export function isActive(s: GameState, id: PokemonId): boolean {
  const pk = s.pokemon[id];
  return !!pk && s.players[pk.owner]?.active === id;
}

/** Zones whose cards are listed in the player's arrays. */
const PLAYER_ZONES = ["deck", "hand", "discard", "prizes", "lostZone"] as const;
type PlayerZone = (typeof PLAYER_ZONES)[number];
const isPlayerZone = (z: Zone): z is PlayerZone => (PLAYER_ZONES as readonly Zone[]).includes(z);

/** Removes an object from where it is listed (the object itself stays). */
export function detach(s: GameState, id: ObjectId): void {
  const o = obj(s, id);
  if (isPlayerZone(o.zone)) {
    const arr = playerOf(s, o.owner)[o.zone];
    const i = arr.indexOf(id);
    if (i >= 0) arr.splice(i, 1);
  } else if (o.zone === "inPlay" && o.host) {
    const pk = s.pokemon[o.host];
    if (pk)
      for (const list of [pk.cards, pk.energy, pk.tools]) {
        const i = list.indexOf(id);
        if (i >= 0) list.splice(i, 1);
      }
  } else if (o.zone === "stadium" && s.stadium === id) s.stadium = null;
  delete o.host;
  bump(s);
}

export interface MoveOptions {
  /** Into the deck: on top (default: at the bottom), or at a random place (shuffled afterwards anyway). */
  top?: boolean;
  /** Do not emit a `move` event (the caller emits a more precise one). */
  silent?: boolean;
}

/**
 * Moves a card to a zone of its owner. A card entering the deck or the Prizes gets a new id: nobody can track it there.
 * Returns its id after the move.
 */
export function moveCard(s: GameState, id: ObjectId, to: Exclude<Zone, "inPlay">, opts: MoveOptions = {}): ObjectId {
  const o = obj(s, id);
  const from = o.zone;
  detach(s, id);
  let nid = id;
  if (to === "deck" || to === "prizes") {
    nid = newId(s, "c");
    delete s.objects[id];
    const moved: CardObject = { id: nid, defId: o.defId, owner: o.owner, zone: to };
    if (o.print) moved.print = o.print;
    s.objects[nid] = moved;
  } else o.zone = to;
  const ps = playerOf(s, o.owner);
  if (isPlayerZone(to)) {
    if (to === "deck" && opts.top) ps.deck.unshift(nid);
    else ps[to].push(nid);
  } else if (to === "stadium") s.stadium = nid;
  if (!opts.silent) emit({ type: "move", player: o.owner, card: nid, defId: o.defId, from, to });
  return nid;
}

/** Puts a card into play as part of a Pokémon (stack card, Energy or Tool). */
export function putOnPokemon(s: GameState, id: ObjectId, pk: PokemonId, as: "cards" | "energy" | "tools"): void {
  const o = obj(s, id);
  detach(s, id);
  o.zone = "inPlay";
  o.host = pk;
  pokemonOf(s, pk)[as].push(id);
  bump(s);
}

/** Draws cards from the top of the deck (fewer if the deck runs out). Returns the cards drawn. */
export function drawCards(s: GameState, p: PlayerId, n: number): ObjectId[] {
  const ps = playerOf(s, p);
  const drawn: ObjectId[] = [];
  for (let i = 0; i < n && ps.deck.length; i++) {
    const id = ps.deck.shift() as ObjectId;
    obj(s, id).zone = "hand";
    ps.hand.push(id);
    drawn.push(id);
  }
  if (drawn.length) {
    bump(s);
    emit({ type: "draw", player: p, cards: drawn, defIds: drawn.map((id) => obj(s, id).defId) });
  }
  return drawn;
}

export function shuffleDeck(s: GameState, p: PlayerId): void {
  shuffle(s, playerOf(s, p).deck);
  emit({ type: "shuffle", player: p });
}

/** Creates a Pokémon in play from a card (Basic Pokémon put onto the Bench or the Active Spot). */
export function createPokemon(s: GameState, card: ObjectId): PokemonId {
  const o = obj(s, card);
  const id = newId(s, "k");
  s.pokemon[id] = { id, owner: o.owner, cards: [], energy: [], tools: [], damage: 0, cond: {}, enteredTurn: s.turn.number };
  putOnPokemon(s, card, id, "cards");
  return id;
}

/** Every card of a Pokémon in play (stack, Energy, Tools). */
export function cardsOfPokemon(s: GameState, id: PokemonId): ObjectId[] {
  const pk = pokemonOf(s, id);
  return [...pk.cards, ...pk.energy, ...pk.tools];
}

/** Removes a Pokémon from the Active Spot or the Bench (its cards are moved by the caller). */
export function removePokemon(s: GameState, id: PokemonId): void {
  const pk = pokemonOf(s, id);
  const ps = playerOf(s, pk.owner);
  if (ps.active === id) ps.active = null;
  ps.bench = ps.bench.filter((x) => x !== id);
  delete s.pokemon[id];
  s.effects = s.effects.filter((e) => !("scope" in e.rule && e.rule.scope?.ids?.includes(id)));
  bump(s);
}

/** Turn number of a player's first turn: 1 for the first player, 2 for the other (R-TURN-4, R-EVOLVE-2). */
export function isFirstTurnOf(s: GameState, p: PlayerId): boolean {
  return s.turn.number === (p === s.turn.first ? 1 : 2);
}
