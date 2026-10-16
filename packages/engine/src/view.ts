/**
 * What a player may know of a game (`projectView`) and of its events (`filterEvents`).
 *
 * Hidden: the opponent's hand; every deck (order and contents); every Prize card, **their owner's included**; the
 * opponent's setup placement until both players have placed; the cards a search shows (sent to the chooser only, in
 * the pending question).
 */
import { legalActions } from "./legal";
import { inPlay } from "./state";
import { benchSize, chars } from "./statics";
import type {
  ActionOption,
  ChoicePurpose,
  ChoiceRequest,
  Conditions,
  EType,
  Flow,
  GameEvent,
  GameState,
  ObjectId,
  PlayerId,
  PokemonId,
  TurnState,
} from "./types";

/** Id given to a card the viewer may not see. */
export const HIDDEN = "?";

export interface PokemonView {
  id: PokemonId;
  owner: PlayerId;
  cards: ObjectId[];
  energy: ObjectId[];
  tools: ObjectId[];
  damage: number;
  cond: Conditions;
  hp: number;
  types: EType[];
  retreat: number;
  weakness?: { type: EType; mult: number };
  resistance?: { type: EType; amount: number };
  /** Abilities in force (indices into the top card's abilities). */
  abilities: number[];
  enteredTurn: number;
  evolvedTurn?: number;
}

export interface PlayerView {
  id: PlayerId;
  name: string;
  /** The viewer's hand; null for the opponent. */
  hand: ObjectId[] | null;
  handCount: number;
  deckCount: number;
  discard: ObjectId[];
  lostZone: ObjectId[];
  prizes: number;
  prizesTaken: number;
  active: PokemonId | null;
  bench: PokemonId[];
  benchSize: number;
  mulligans: number;
  /** Setup: the viewer's placement, or whether the opponent has placed. */
  placed?: { active: ObjectId; bench: ObjectId[] } | true;
}

export interface PendingView {
  kind: "setup" | "main" | "choice";
  player: PlayerId;
  /** The question, for the player who answers it only. */
  request?: ChoiceRequest;
  purpose?: ChoicePurpose;
}

export interface TimedEffectView {
  defId: string;
  player: PlayerId;
  untilTurn: number;
  pokemon?: PokemonId[];
  rule: string;
}

export interface GameView {
  me: PlayerId;
  order: PlayerId[];
  players: Record<PlayerId, PlayerView>;
  pokemon: Record<PokemonId, PokemonView>;
  stadium: ObjectId | null;
  turn: TurnState;
  flow: Flow;
  setupStep: GameState["setup"]["step"];
  pending: PendingView | null;
  /** The viewer's options (main phase). */
  legal: ActionOption[];
  /** Definition of every card the viewer may see. */
  faces: Record<ObjectId, string>;
  /** Chosen prints of the visible cards. */
  prints: Record<ObjectId, string>;
  /** What resolves now (an attack, a Trainer card, an Ability). */
  resolving: { kind: string; player: PlayerId; defId: string; source: PokemonId | null; card: ObjectId | null } | null;
  effects: TimedEffectView[];
  prizeCount: number;
  /** Sudden Deaths played so far. */
  suddenDeath: number;
  over: boolean;
  winner: PlayerId | null;
  endReason?: GameState["endReason"];
}

/** Cards visible to everyone: in play, discard piles, Lost Zones, the Stadium, cards being played. */
function publicCards(s: GameState): ObjectId[] {
  const out: ObjectId[] = [];
  for (const p of s.playerOrder) {
    const ps = s.players[p];
    if (ps) out.push(...ps.discard, ...ps.lostZone);
  }
  for (const pk of Object.values(s.pokemon)) out.push(...pk.cards, ...pk.energy, ...pk.tools);
  if (s.stadium) out.push(s.stadium);
  if (s.resolving?.card && s.objects[s.resolving.card]?.zone === "resolving") out.push(s.resolving.card);
  return out;
}

export function projectView(s: GameState, viewer: PlayerId): GameView {
  const faces: Record<ObjectId, string> = {};
  const prints: Record<ObjectId, string> = {};
  const see = (id: ObjectId) => {
    const o = s.objects[id];
    if (!o) return;
    faces[id] = o.defId;
    if (o.print) prints[id] = o.print;
  };
  for (const id of publicCards(s)) see(id);
  for (const id of s.players[viewer]?.hand ?? []) see(id);
  const own = s.setup.placed[viewer];
  if (own && s.flow === "setup") for (const id of [own.active, ...own.bench]) see(id);
  const players: Record<PlayerId, PlayerView> = {};
  for (const p of s.playerOrder) {
    const ps = s.players[p];
    if (!ps) continue;
    const v: PlayerView = {
      id: p,
      name: ps.name,
      hand: p === viewer ? [...ps.hand] : null,
      handCount: ps.hand.length,
      deckCount: ps.deck.length,
      discard: [...ps.discard],
      lostZone: [...ps.lostZone],
      prizes: ps.prizes.length,
      prizesTaken: ps.prizesTaken,
      active: ps.active,
      bench: [...ps.bench],
      benchSize: s.flow === "setup" ? 5 : benchSize(s, p),
      mulligans: ps.mulligans,
    };
    const placed = s.setup.placed[p];
    if (s.flow === "setup" && placed) v.placed = p === viewer ? { active: placed.active, bench: [...placed.bench] } : true;
    players[p] = v;
  }
  const pokemon: Record<PokemonId, PokemonView> = {};
  for (const p of s.playerOrder)
    for (const id of inPlay(s, p)) {
      const pk = s.pokemon[id];
      if (!pk) continue;
      const c = chars(s, id);
      const v: PokemonView = {
        id,
        owner: pk.owner,
        cards: [...pk.cards],
        energy: [...pk.energy],
        tools: [...pk.tools],
        damage: pk.damage,
        cond: { ...pk.cond },
        hp: c.hp,
        types: c.types,
        retreat: c.retreat,
        abilities: c.abilities,
        enteredTurn: pk.enteredTurn,
      };
      if (c.weakness) v.weakness = c.weakness;
      if (c.resistance) v.resistance = c.resistance;
      if (pk.evolvedTurn !== undefined) v.evolvedTurn = pk.evolvedTurn;
      pokemon[id] = v;
    }
  let pending: PendingView | null = null;
  if (s.pending) {
    pending = { kind: s.pending.kind, player: s.pending.player };
    if (s.pending.kind === "choice") {
      pending.purpose = s.pending.purpose;
      if (s.pending.player === viewer) {
        pending.request = s.pending.request;
        for (const [id, defId] of Object.entries(s.pending.request.cards ?? {})) {
          faces[id] = defId;
          const pr = s.objects[id]?.print;
          if (pr) prints[id] = pr;
        }
      }
    }
  }
  const r = s.resolving;
  return {
    me: viewer,
    order: [...s.playerOrder],
    players,
    pokemon,
    stadium: s.stadium,
    turn: { ...s.turn },
    flow: s.flow,
    setupStep: s.setup.step,
    pending,
    legal: legalActions(s, viewer),
    faces,
    prints,
    resolving: r ? { kind: r.kind, player: r.player, defId: r.defId, source: r.source, card: r.card } : null,
    effects: s.effects
      .filter((e) => e.untilTurn >= s.turn.number)
      .map((e) => {
        const ids = "scope" in e.rule ? e.rule.scope?.ids : undefined;
        const out: TimedEffectView = { defId: e.defId, player: e.player, untilTurn: e.untilTurn, rule: e.rule.s };
        if (ids) out.pokemon = [...ids];
        return out;
      }),
    prizeCount: s.prizeCount,
    suddenDeath: s.suddenDeath ?? 0,
    over: s.over,
    winner: s.winner,
    ...(s.endReason ? { endReason: s.endReason } : {}),
  };
}

const PUBLIC_ZONES = new Set(["discard", "lostZone", "inPlay", "stadium", "resolving"]);

/** The events as a viewer may see them: hidden cards are masked. */
export function filterEvents(events: GameEvent[], viewer: PlayerId): GameEvent[] {
  return events.map((e): GameEvent => {
    switch (e.type) {
      case "draw":
        return e.player === viewer ? e : { type: "draw", player: e.player, cards: e.cards.map(() => HIDDEN) };
      case "prizes":
        return e.player === viewer ? e : { type: "prizes", player: e.player, cards: e.cards.map(() => HIDDEN) };
      case "move": {
        const visible = (z: string) => PUBLIC_ZONES.has(z) || (z === "hand" && e.player === viewer);
        if (visible(e.from) || visible(e.to)) return e;
        return { type: "move", player: e.player, card: HIDDEN, from: e.from, to: e.to };
      }
      default:
        return e;
    }
  });
}

/** The opponent of the viewer (interface helper). */
export function viewOpponent(v: GameView): PlayerId {
  return v.order.find((p) => p !== v.me) as PlayerId;
}
