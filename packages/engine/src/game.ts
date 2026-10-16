/**
 * Public API of the engine: game creation and submission of decisions. Each call works on a copy (the received state
 * is never modified) and returns the events produced.
 */
// The effect handlers (ops/*.ts) register themselves here: effects.ts does not import them (opRegistry.ts).
import "./ops/index";
import { applyMain } from "./actions";
import { validateChoice } from "./choices";
import { checkDecisionShape } from "./decisionShape";
import { setBenchSize } from "./effects";
import { RulesError } from "./errors";
import { collectEvents } from "./events";
import { endGame } from "./knockout";
import { MAX_TURNS } from "./limits";
import { setHpOf } from "./match";
import { cloneState, newId, opponentOf } from "./state";
import { benchSize, chars } from "./statics";
import { msg } from "./text";
import { advance, answerFlowChoice, placeSetup } from "./turn";
import type { CardDef, CardObject, Decision, GameEvent, GameState, PlayerId } from "./types";

setBenchSize(benchSize);
setHpOf((s, id) => chars(s, id).hp);

export interface PlayerSetup {
  id: PlayerId;
  name: string;
  deck: CardDef[];
  /** Print chosen for each card of the deck (same order; absent: the definition's default). */
  prints?: (string | null | undefined)[];
}

export interface GameOptions {
  seed: number;
  players: [PlayerSetup, PlayerSetup];
  /** Who chooses to go first or second (best-of-three: the loser of the previous game); default: a coin flip. */
  chooser?: PlayerId;
  /** Prize cards each (6; 1 in Sudden Death). */
  prizes?: number;
}

export interface StepResult {
  state: GameState;
  events: GameEvent[];
}

/** An empty state with its players and no card (shared by `createGame` and test scenarios). */
export function blankState(seed: number, players: { id: PlayerId; name: string }[]): GameState {
  const [a, b] = players as [{ id: PlayerId; name: string }, { id: PlayerId; name: string }];
  const s: GameState = {
    version: 0,
    rng: seed | 0,
    idCounters: {},
    defs: {},
    objects: {},
    pokemon: {},
    players: {},
    playerOrder: [a.id, b.id],
    stadium: null,
    turn: {
      number: 0,
      active: a.id,
      first: a.id,
      energyAttached: false,
      supporterPlayed: false,
      stadiumPlayed: false,
      retreated: false,
      attacks: 0,
      ending: false,
    },
    flow: "setup",
    setup: { step: "coin", extraDraws: {}, placed: {} },
    pending: null,
    resolving: null,
    queue: [],
    effects: [],
    turnLog: [],
    usedOnce: [],
    prizeCount: 6,
    winner: null,
    over: false,
  };
  for (const p of players)
    s.players[p.id] = {
      id: p.id,
      name: p.name,
      deck: [],
      hand: [],
      discard: [],
      lostZone: [],
      prizes: [],
      active: null,
      bench: [],
      mulligans: 0,
      prizesTaken: 0,
    };
  return s;
}

export function createGame(opts: GameOptions): StepResult {
  const s = blankState(opts.seed, opts.players);
  if (opts.prizes !== undefined) s.prizeCount = opts.prizes;
  if (opts.chooser) s.setup.chooser = opts.chooser;
  for (const p of opts.players) {
    p.deck.forEach((def, i) => {
      s.defs[def.id] = def;
      const id = newId(s, "c");
      const o: CardObject = { id, defId: def.id, owner: p.id, zone: "deck" };
      const print = p.prints?.[i];
      if (print) o.print = print;
      s.objects[id] = o;
      s.players[p.id]?.deck.push(id);
    });
  }
  const [, events] = collectEvents(() => advance(s));
  return { state: s, events };
}

/** Applies a decision to a state in place (AI simulation); throws a RulesError if it is illegal. */
export function applyMutable(s: GameState, player: PlayerId, d: Decision): void {
  checkDecisionShape(d);
  if (s.over) throw new RulesError(msg("The game is over"));
  if (d.type === "concede") {
    endGame(s, opponentOf(s, player), "concede");
    return;
  }
  const p = s.pending;
  if (!p || p.player !== player) throw new RulesError(msg("It is not your decision to make"));
  if (p.kind === "setup") {
    if (d.type !== "setup") throw new RulesError(msg("Place your Pokémon first"));
    const error = placeSetup(s, player, d.active, d.bench);
    if (error) throw new RulesError(error);
    s.pending = null;
  } else if (p.kind === "choice") {
    if (d.type !== "choose") throw new RulesError(msg("Answer the question first"));
    validateChoice(p.request, d.values);
    s.pending = null;
    if (p.purpose === "effect") {
      const r = s.resolving;
      if (!r?.awaiting) throw new Error("answer without a question");
      r.answers[r.awaiting] = d.values;
      r.awaiting = null;
    } else answerFlowChoice(s, player, p.purpose, d.values);
  } else {
    s.pending = null;
    try {
      applyMain(s, player, d);
    } catch (e) {
      s.pending = p;
      throw e;
    }
  }
  advance(s);
  if (!s.over && s.turn.number > MAX_TURNS) endGame(s, null, "draw");
}

/** Submits a decision: a new state and the events produced; throws a RulesError (state unchanged) if it is illegal. */
export function submit(state: GameState, player: PlayerId, d: Decision): StepResult {
  const s = cloneState(state);
  const [, events] = collectEvents(() => applyMutable(s, player, d));
  return { state: s, events };
}
