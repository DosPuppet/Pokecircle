/**
 * Game records: a game is fully determined by its seed, its decks and the ordered list of decisions. Records power
 * saves, resume after a server restart, replays and golden games. Checkpoints (`outcomeHash`) detect a replay that
 * diverges.
 */

import { outcomeHash } from "./fingerprint";
import { createGame, type GameOptions, submit } from "./game";
import type { CardDef, Decision, GameState, PlayerId } from "./types";

/**
 * Rules version: advanced on every change of engine behavior. A record of another version may not replay identically.
 *
 * History: 1 (2026-10-16) first engine; 2 (2026-10-16) meta mechanics: copied attacks, Festival Lead, Energy
 * provision, Weakness changes, turn log of benched and Active Pokémon (PLAN-A P6).
 */
export const RULES_VERSION = 2;
export const RECORD_FORMAT = "pocketmate-game";
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

/** Replays a record, checking its checkpoints. */
export function replayChecked(rec: GameRecord, defs: Record<string, CardDef>, upTo = rec.decisions.length): ReplayResult {
  let state = createGame(recordOptions(rec, defs)).state;
  const checks = new Map(rec.checkpoints);
  for (let i = 0; i < upTo; i++) {
    const [p, d] = rec.decisions[i] as [PlayerId, Decision];
    try {
      state = submit(state, p, d).state;
    } catch {
      return { state, applied: i, diverged: true };
    }
    const expected = checks.get(i + 1);
    if (expected && expected !== outcomeHash(state)) return { state, applied: i + 1, diverged: true };
  }
  return { state, applied: upTo, diverged: false };
}
