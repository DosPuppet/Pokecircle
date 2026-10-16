/**
 * Game records: a game is fully determined by its seed, its decks and the ordered list of decisions. Records power
 * saves, resume after a server restart, replays and golden games. Checkpoints (`outcomeHash`) detect a replay that
 * diverges.
 */

import { outcomeHash } from "./fingerprint";
import { createGame, type GameOptions, submit } from "./game";
import type { CardDef, Decision, GameEvent, GameState, PlayerId } from "./types";

/**
 * Rules version: advanced on every change of engine behavior. A record of another version may not replay identically.
 *
 * History: 1 (2026-10-16) first engine; 2 (2026-10-16) meta mechanics: copied attacks, Festival Lead, Energy
 * provision, Weakness changes, turn log of benched and Active Pokémon (PLAN-A P6); 3 (2026-10-16) Sudden Death: a new
 * game with 1 Prize card each instead of a draw (PLAN-A P8); 4 (2026-10-16) PLAN-B B1: second meta wave (new templates
 * and mechanics), Stadiums playable whatever their action's condition, scripts keyed by print where names are shared;
 * 5 (2026-10-16) PLAN-B B2: attack effects (coins, counted damage, damage taken and healing in the turn log,
 * prevention up to N, attack coin flips, first-turn attacks), "to 1 of your Pokémon" attaches to one Pokémon.
 */
export const RULES_VERSION = 13;
export const RECORD_FORMAT = "pokecircle-game";
/** Formats of records written before the app was renamed (PocketMate): read as the current one. */
const LEGACY_FORMATS = ["pocketmate-game"];

/** Is this the format of a game record (current or earlier name)? */
export function isRecordFormat(format: unknown): boolean {
  return format === RECORD_FORMAT || LEGACY_FORMATS.includes(format as string);
}
export const CHECKPOINT_EVERY = 25;

export interface RecordedPlayer {
  id: PlayerId;
  name: string;
  /** Definition id and print of each card, in deck order. */
  deck: [string, string?][];
}

export interface GameRecord {
  format: typeof RECORD_FORMAT;
  rules: number;
  seed: number;
  players: [RecordedPlayer, RecordedPlayer];
  chooser?: PlayerId;
  prizes?: number;
  decisions: [PlayerId, Decision][];
  /** `[number of decisions applied, outcomeHash]`. */
  checkpoints: [number, string][];
}

export function newRecord(opts: GameOptions): GameRecord {
  const rec: GameRecord = {
    format: RECORD_FORMAT,
    rules: RULES_VERSION,
    seed: opts.seed,
    players: opts.players.map((p) => ({
      id: p.id,
      name: p.name,
      deck: p.deck.map((d, i) => {
        const print = p.prints?.[i];
        return print ? ([d.id, print] as [string, string]) : ([d.id] as [string]);
      }),
    })) as unknown as [RecordedPlayer, RecordedPlayer],
    decisions: [],
    checkpoints: [],
  };
  if (opts.chooser) rec.chooser = opts.chooser;
  if (opts.prizes !== undefined) rec.prizes = opts.prizes;
  return rec;
}

export function recordDecision(rec: GameRecord, player: PlayerId, d: Decision, after: GameState, every = CHECKPOINT_EVERY): void {
  rec.decisions.push([player, d]);
  if (rec.decisions.length % every === 0 || after.over) rec.checkpoints.push([rec.decisions.length, outcomeHash(after)]);
}

/** Game options of a record, from a definition table. */
export function recordOptions(rec: GameRecord, defs: Record<string, CardDef>): GameOptions {
  const players = rec.players.map((p) => ({
    id: p.id,
    name: p.name,
    deck: p.deck.map(([id]) => {
      const d = defs[id];
      if (!d) throw new Error(`record: unknown card ${id}`);
      return d;
    }),
    prints: p.deck.map(([, print]) => print),
  })) as GameOptions["players"];
  const opts: GameOptions = { seed: rec.seed, players };
  if (rec.chooser) opts.chooser = rec.chooser;
  if (rec.prizes !== undefined) opts.prizes = rec.prizes;
  return opts;
}

export interface ReplayResult {
  state: GameState;
  /** Decisions applied (fewer than recorded if one was refused or a checkpoint diverged). */
  applied: number;
  diverged: boolean;
}

/**
 * Replays a record, checking its checkpoints. `onStep` receives the state after the creation of the game, then after
 * each decision, with the events produced (replay viewer).
 */
export function replayChecked(
  rec: GameRecord,
  defs: Record<string, CardDef>,
  upTo = rec.decisions.length,
  onStep?: (state: GameState, events: GameEvent[]) => void,
): ReplayResult {
  const start = createGame(recordOptions(rec, defs));
  let state = start.state;
  onStep?.(state, start.events);
  const checks = new Map(rec.checkpoints);
  for (let i = 0; i < upTo; i++) {
    const [p, d] = rec.decisions[i] as [PlayerId, Decision];
    let events: GameEvent[];
    try {
      ({ state, events } = submit(state, p, d));
    } catch {
      return { state, applied: i, diverged: true };
    }
    const expected = checks.get(i + 1);
    if (expected && expected !== outcomeHash(state)) return { state, applied: i + 1, diverged: true };
    onStep?.(state, events);
  }
  return { state, applied: upTo, diverged: false };
}
