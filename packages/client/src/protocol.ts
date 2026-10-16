/** Messages exchanged between the interface and the Web Worker that runs a game against the AI. */
import type { AiLevel } from "@pocketmate/ai";
import type { DeckEntries } from "@pocketmate/cards";
import type { CardDef, Decision, GameEvent, GameRecord, GameView, ScenarioSpec } from "@pocketmate/engine";

export type ToWorker =
  | {
      type: "start";
      seed: number;
      playerName: string;
      aiName: string;
      playerDeck: DeckEntries;
      aiDeck: DeckEntries;
      /** Definitions of the cards used: the worker does not bundle the card database. */
      defs: Record<string, CardDef>;
      aiLevel: AiLevel;
      /** Who chooses to go first (next game of a best-of-three). */
      chooser?: string;
      /** Fast mode of the interface tests (dev): the AI plays without pauses. */
      fast?: boolean;
    }
  /** Resume of a saved game (page reopened): the record is replayed, then the game goes on. */
  | { type: "resume"; record: GameRecord; defs: Record<string, CardDef>; aiLevel: AiLevel; fast?: boolean }
  /** A tutorial lesson: a staged position against the lessons' scripted opponent (not saved). */
  | { type: "lesson"; spec: ScenarioSpec; defs: Record<string, CardDef>; fast?: boolean }
  | { type: "decision"; decision: Decision }
  | { type: "export" };

export type FromWorker =
  | { type: "update"; view: GameView; events: GameEvent[] }
  /** Error for the player (engine text, `msg`: translated at display). */
  | { type: "error"; message: string }
  | { type: "record"; record: GameRecord | null }
  /** Save of the game: the record's header at the start, then the new decisions and checkpoints. */
  | { type: "saved"; header?: GameRecord; decisions: GameRecord["decisions"]; checkpoints: [number, string][] }
  | { type: "resumeFailed"; message: string };
