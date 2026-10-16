/** The engine's types, in one place. */
import type { SpecialCondition } from "./model/effects";
import type { EndReason, ObjectId, PlayerId, PokemonId, Zone } from "./model/state";

export * from "./model/cards";
export * from "./model/decisions";
export * from "./model/effects";
export * from "./model/rules";
export * from "./model/state";

/**
 * Display events. `filterEvents` (view.ts) removes or masks what a viewer may not know (cards drawn by the opponent,
 * cards moved between hidden zones).
 */
export type GameEvent =
  | { type: "coinFlip"; player: PlayerId; heads: boolean; source?: string }
  | { type: "firstPlayer"; player: PlayerId; chooser: PlayerId }
  | { type: "mulligan"; player: PlayerId; revealed: string[] }
  | { type: "setupDone" }
  | { type: "turnStart"; player: PlayerId; turn: number }
  | { type: "draw"; player: PlayerId; cards: ObjectId[]; defIds?: string[] }
  | { type: "playBasic"; player: PlayerId; card: ObjectId; defId: string; pokemon: PokemonId }
  | { type: "evolve"; player: PlayerId; pokemon: PokemonId; defId: string; from: string }
  | { type: "devolve"; player: PlayerId; pokemon: PokemonId; defId: string }
  | { type: "attach"; player: PlayerId; card: ObjectId; defId: string; pokemon: PokemonId }
  | { type: "playTrainer"; player: PlayerId; card: ObjectId; defId: string; target?: PokemonId }
  | { type: "ability"; player: PlayerId; pokemon: PokemonId | null; defId: string; name: string }
  | { type: "retreat"; player: PlayerId; from: PokemonId; to: PokemonId }
  | { type: "switch"; player: PlayerId; from: PokemonId; to: PokemonId }
  | { type: "attack"; player: PlayerId; pokemon: PokemonId; defId: string; name: string; target: PokemonId | null }
  | { type: "attackFails"; player: PlayerId; pokemon: PokemonId }
  | {
      type: "damage";
      target: PokemonId;
      amount: number;
      source?: PokemonId;
      weakness?: boolean;
      resistance?: boolean;
      prevented?: boolean;
    }
  | { type: "counters"; target: PokemonId; n: number }
  | { type: "heal"; target: PokemonId; amount: number }
  | { type: "condition"; target: PokemonId; cond: SpecialCondition; on: boolean }
  | { type: "knockOut"; pokemon: PokemonId; defId: string; player: PlayerId }
  | { type: "prizes"; player: PlayerId; cards: ObjectId[]; defIds?: string[] }
  | { type: "promote"; player: PlayerId; pokemon: PokemonId }
  | {
      type: "move";
      player: PlayerId;
      card: ObjectId;
      defId?: string;
      from: Zone;
      to: Zone;
      /** The card stays hidden from the opponent (from hand to deck). */
      secret?: boolean;
    }
  | { type: "reveal"; player: PlayerId; cards: ObjectId[]; defIds: string[] }
  | { type: "shuffle"; player: PlayerId }
  | { type: "stadium"; player: PlayerId; card: ObjectId; defId: string }
  | { type: "checkup" }
  | { type: "suddenDeath"; round: number }
  | { type: "endTurn"; player: PlayerId }
  | { type: "gameOver"; winner: PlayerId | null; reason: EndReason }
  | { type: "message"; text: string }
  | { type: "capReached"; cap: string };
