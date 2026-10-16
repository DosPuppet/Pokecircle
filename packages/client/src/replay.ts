/**
 * Replays: a finished game's record is replayed by the engine in the page (every state kept), and shown from either
 * player's point of view, step by step. Nobody plays: the views have no pending decision and no options.
 */
import { CARDS } from "@pokecircle/cards";
import {
  type CardDef,
  filterEvents,
  type GameEvent,
  type GameRecord,
  type GameState,
  type GameView,
  isRecordFormat,
  msg,
  projectView,
  RECORD_FORMAT,
  RULES_VERSION,
  replayChecked,
} from "@pokecircle/engine";

export class Replay {
  readonly states: GameState[] = [];
  /** Events of each step (`events[i]`: those leading to `states[i]`). */
  private readonly events: GameEvent[][] = [];
  readonly players: { id: string; name: string }[];
  /** Replay stopped before the end, or recorded with another rules version (engine text, `msg`). */
  readonly warning: string | null;

  constructor(record: GameRecord) {
    const defs: Record<string, CardDef> = {};
    for (const p of record.players)
      for (const [id] of p.deck) {
        const d = CARDS[id];
        if (!d) throw new Error(`unknown card ${id}`);
        defs[id] = d;
      }
    const r = replayChecked(record, defs, record.decisions.length, (state, events) => {
      this.states.push(state);
      this.events.push(events);
    });
    this.players = record.players.map((p) => ({ id: p.id, name: p.name }));
    const at = { index: r.applied, total: record.decisions.length };
    const other = record.rules !== RULES_VERSION;
    this.warning = r.diverged
      ? other
        ? msg("Replay stopped at decision {index} of {total} (game recorded with an earlier version of the rules).", at)
        : msg("Replay stopped at decision {index} of {total}.", at)
      : other
        ? msg("Game recorded with another version of the rules ({rules}, engine: {engine}).", {
            rules: record.rules,
            engine: RULES_VERSION,
          })
        : null;
  }

  /** Number of steps after the start (the last index). */
  get total(): number {
    return this.states.length - 1;
  }

  /** The view of `viewer` at step `i`, and the events leading to it. */
  frame(i: number, viewer: string): { view: GameView; events: GameEvent[] } {
    const state = this.states[i] as GameState;
    return {
      view: { ...projectView(state, viewer), pending: null, legal: [] },
      events: filterEvents(this.events[i] ?? [], viewer),
    };
  }
}

/** A record read from a file (`null` if it is not a Pokecircle game). */
export function parseRecord(text: string): GameRecord | null {
  try {
    const r = JSON.parse(text) as GameRecord;
    return r && isRecordFormat(r.format) && Array.isArray(r.decisions) && Array.isArray(r.players)
      ? { ...r, format: RECORD_FORMAT }
      : null;
  } catch {
    return null;
  }
}
