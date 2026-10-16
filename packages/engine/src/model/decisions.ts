/**
 * Decisions: what a player submits (`Decision`), what the engine waits for (`PendingDecision`), the generic question
 * model (`ChoiceRequest`, always with a valid `suggested` answer) and the options of the main phase (`ActionOption`).
 */
import type { EType } from "./cards";
import type { ObjectId, PlayerId, PokemonId } from "./state";

export type ChoiceValue = string | number;

/** What a question is about, for the interface and the AI (an intent, not a text). */
export type ChoiceIntent =
  | "search"
  | "discard"
  | "target"
  | "promote"
  | "attach"
  | "bench"
  | "energy"
  | "order"
  | "number"
  | "yesNo"
  | "mode"
  | "counters"
  | "look";

export type ChoiceRequest = {
  /** Player-facing text (English, `msg`). */
  prompt: string;
  intent: ChoiceIntent;
  suggested: ChoiceValue[];
  /** Labels of options (player-facing English texts). */
  labels?: Record<string, string>;
  /**
   * Cards the chooser sees (option id → definition id): a deck search shows the deck to the searcher only. The view
   * sends it to the decider only.
   */
  cards?: Record<string, string>;
  /** The card the question comes from (definition id). */
  source?: string;
  /** Options that are attacks (copied attacks): the card and the attack's index, named by the interface. */
  attacks?: Record<string, { defId: string; index: number }>;
} & (
  | { type: "pick"; options: string[]; min: number; max: number }
  | { type: "number"; min: number; max: number }
  | { type: "order"; items: string[] }
  | { type: "yesNo" }
  /** Divide `total` among `among` (damage counters "in any way you like"). */
  | { type: "divide"; among: string[]; total: number; minEach?: number }
);

export type ChoicePurpose =
  | "effect"
  | "promote"
  | "mulliganDraw"
  | "benchOverflow"
  | "chooseFirst"
  /** Optional triggered effect ("you may…"). */
  | "trigger";

export type PendingDecision =
  | { kind: "setup"; player: PlayerId }
  | { kind: "main"; player: PlayerId }
  | { kind: "choice"; player: PlayerId; request: ChoiceRequest; purpose: ChoicePurpose };

export type Decision =
  /** Setup: the Active Pokémon and the Benched Pokémon (R-SETUP-4). */
  | { type: "setup"; active: ObjectId; bench: ObjectId[] }
  | { type: "playBasic"; card: ObjectId }
  | { type: "evolve"; card: ObjectId; target: PokemonId }
  | { type: "attachEnergy"; card: ObjectId; target: PokemonId }
  | { type: "playTrainer"; card: ObjectId; target?: PokemonId }
  | { type: "useAbility"; pokemon: PokemonId; ability: number }
  | { type: "stadiumAction" }
  | { type: "retreat"; to: PokemonId; discard: ObjectId[] }
  | { type: "attack"; index: number; source?: ObjectId }
  | { type: "endTurn" }
  | { type: "choose"; values: ChoiceValue[] }
  | { type: "concede" };

export interface AttackPreview {
  /** Damage to the Defending Pokémon, after modifiers, Weakness and Resistance (coin flips not counted). */
  damage: number;
  ko: boolean;
}

/** An option of the main phase (`legalActions`): the interface, the AI and the autopilot choose only from these. */
export type ActionOption =
  | { type: "playBasic"; card: ObjectId }
  | { type: "evolve"; card: ObjectId; targets: PokemonId[] }
  | { type: "attachEnergy"; card: ObjectId; targets: PokemonId[] }
  | { type: "playTrainer"; card: ObjectId; targets?: PokemonId[] }
  | { type: "useAbility"; pokemon: PokemonId; ability: number }
  | { type: "stadiumAction" }
  | {
      type: "retreat";
      to: PokemonId[];
      /** Energy units to discard. */
      cost: number;
      /** Energy attached to the Active Pokémon, and the suggested ones to discard. */
      energy: ObjectId[];
      suggested: ObjectId[];
    }
  | {
      type: "attack";
      index: number;
      source?: ObjectId;
      name: string;
      cost: EType[];
      preview?: AttackPreview;
    }
  | { type: "endTurn" };
