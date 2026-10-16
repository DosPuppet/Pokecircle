/**
 * Online play protocol (WebSocket, JSON). Shared types: the client imports them with `import type` (except
 * `PROTOCOL_VERSION`). The server is authoritative: it validates the decks and every decision (engine RulesError).
 */
import type { AiLevel } from "@pocketmate/ai";
import type { DeckEntries, Format } from "@pocketmate/cards";
import type { Decision, GameEvent, GameRecord, GameView } from "@pocketmate/engine";

/**
 * Protocol version: sent by the client, with `RULES_VERSION`, when it creates, joins or resumes a room; a client of
 * another version is refused and asked to reload the page. Bump it on every incompatible change of the messages.
 */
export const PROTOCOL_VERSION = 1;

export interface ClientVersion {
  protocol: number;
  rules: number;
}

/** Seats of a room: the player ids in the engine. */
export type Seat = "p1" | "p2";

/** Timer of the current decision (relative durations: no dependency on the client's clock). */
export interface Clock {
  player: Seat;
  remainingMs: number;
  totalMs: number;
  /** Duration during which the rope is shown (ms, end of the time). */
  ropeMs: number;
  timeouts: Partial<Record<Seat, number>>;
  maxTimeouts: number;
}

/** Match: one game (BO1) or best of three (BO3). */
export interface MatchInfo {
  bestOf: 1 | 3;
  format?: Format;
  wins: Partial<Record<Seat, number>>;
  game: number;
  winner: Seat | null;
}

export interface RoomInfo {
  code: string;
  seat: Seat;
  /** Reconnection token of the recipient (kept for `rejoin`). */
  token: string;
  status: "waiting" | "playing" | "between" | "over";
  players: { seat: Seat; name: string; connected: boolean; rematch: boolean; ai?: AiLevel }[];
  match: MatchInfo;
}

export type ClientMessage =
  | {
      type: "create";
      name: string;
      deck: DeckEntries;
      bestOf?: 1 | 3;
      format?: Format;
      /** A seat held by the server AI (its level); its deck is chosen by the server. */
      ai?: { level: AiLevel };
      version?: ClientVersion;
    }
  | { type: "join"; code: string; name: string; deck: DeckEntries; version?: ClientVersion }
  | { type: "rejoin"; token: string; version?: ClientVersion }
  | { type: "leave" }
  | { type: "decision"; decision: Decision }
  | { type: "rematch" }
  /** Between two games of a BO3: ready for the next one. */
  | { type: "next" }
  /** Record of the finished game (replay, bug report); refused during the game. */
  | { type: "export" };

export type ErrorCode = "deck" | "name" | "room" | "full" | "busy" | "closed" | "token" | "rules" | "state" | "version";

export type ServerMessage =
  | { type: "room"; room: RoomInfo }
  | { type: "update"; view: GameView; events: GameEvent[]; clock: Clock | null }
  | { type: "opponent"; connected: boolean; remainingMs: number | null }
  | { type: "error"; code: ErrorCode; message: string }
  | { type: "record"; record: GameRecord };
