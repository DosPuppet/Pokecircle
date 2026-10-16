/**
 * Card definitions: what the engine knows of a card (one definition per gameplay identity; reprints share it).
 * Built by `@pokecircle/cards` from TCGdex data, compiled templates and hand scripts.
 */
import type { Condition, Effect, PokemonFilter } from "./effects";
import type { StaticRule } from "./rules";

/**
 * Pokémon and Energy types: Grass, Fire (R), Water, Lightning, Psychic, Fighting, Darkness, Metal, Dragon (N),
 * Colorless; Fairy (Y) exists only on older cards.
 */
export type EType = "G" | "R" | "W" | "L" | "P" | "F" | "D" | "M" | "N" | "C" | "Y";
export const ENERGY_TYPES: EType[] = ["G", "R", "W", "L", "P", "F", "D", "M"];

export type Category = "pokemon" | "trainer" | "energy";
export type Stage = "basic" | "stage1" | "stage2";
export type TrainerKind = "item" | "supporter" | "tool" | "stadium";

/**
 * Card tags. `ex` and `mega` come from the name and suffix; `aceSpec` from the rarity; `tera`, `ancient`, `future`
 * from `cards/data/card-tags.json` (TCGdex does not have them); `ruleBox`: any Pokémon with a Rule Box.
 */
export type CardTag = "ex" | "mega" | "tera" | "ancient" | "future" | "aceSpec" | "ruleBox" | "trainersPokemon";

/** Display texts of a card in one language. */
export interface CardText {
  name: string;
  attacks?: { name: string; text?: string }[];
  abilities?: { name: string; text: string }[];
  text?: string;
}

export interface AttackDef {
  name: string;
  cost: EType[];
  /** Printed damage (0: none). */
  damage: number;
  /** Sign after the printed damage: "30+", "20×", "120-". */
  suffix?: "+" | "x" | "-";
  /** English text. */
  text?: string;
  /**
   * The attack's program: choices, damage modifiers, `mainDamage` (the printed damage to the Defending Pokémon) and
   * effects, in text order. Absent with a text: the attack is not implemented.
   */
  effects?: Effect[];
  /** "You can use this attack only if…" (checked before the attack is offered). */
  condition?: Condition;
  /** "If you go first, you can use this attack during your first turn." */
  firstTurn?: boolean;
}

/** "Once during your turn" limits of an activated Ability. */
export type OnceLimit = "turn" | "turnByName" | "game" | "none";

export interface ActivatedAbility {
  effects: Effect[];
  /** Default "turn": once during your turn, for this Pokémon. */
  once?: OnceLimit;
  /** Where the Pokémon must be ("if this Pokémon is in the Active Spot"). */
  where?: "active" | "bench";
  /** Extra condition, checked before the Ability is offered. */
  condition?: Condition;
  /** "If you use this Ability, your turn ends." */
  endsTurn?: boolean;
}

export type TriggerEvent =
  /** This card was played from the hand onto the Bench. */
  | "playedToBench"
  /** This card was played from the hand to evolve a Pokémon. */
  | "evolved"
  /** This Pokémon (or the Pokémon this card is attached to) is Knocked Out. */
  | "knockedOut"
  /** This Pokémon (or its holder) was damaged by an attack of the opponent's Pokémon. */
  | "damagedByAttack"
  /** This card (Energy or Tool) was attached from the hand. */
  | "attached"
  /** This Pokémon moved from the Bench to the Active Spot. */
  | "becameActive"
  /** During Pokémon Checkup. */
  | "checkup"
  /** At the end of its owner's turn. */
  | "turnEnd"
  /** The holder of this card used an attack (after it is done). */
  | "attacked"
  /** Any Pokémon was put onto its owner's Bench during their turn (Stadiums). */
  | "benched";

export interface TriggerDef {
  on: TriggerEvent;
  /** `knockedOut` and `damagedByAttack`: only by damage from an attack of the opponent's Pokémon. */
  byOpponentAttack?: boolean;
  /** "you may": a yes/no question first. */
  may?: boolean;
  condition?: Condition;
  /** Once during the turn (Abilities that say "Once during your turn, when…"). */
  oncePerTurn?: boolean;
  /** Once per turn for every trigger sharing this key ("You can't use more than 1 … Ability each turn"). */
  onceKey?: string;
  effects: Effect[];
}

export interface AbilityDef {
  name: string;
  /** English text. */
  text: string;
  activated?: ActivatedAbility;
  statics?: StaticRule[];
  triggers?: TriggerDef[];
  /** Using it Knocks Out the Pokémon (Psyduck's Damp turns these off). */
  selfKO?: boolean;
}

export interface TrainerDef {
  kind: TrainerKind;
  /** Item and Supporter: what playing the card does. Stadium: its activated effect, if any. */
  effects?: Effect[];
  /** "You can use this card only if…" and the playability of the effect (R-TEXT-3). */
  condition?: Condition;
  /** Tools and Stadiums: continuous rules. */
  statics?: StaticRule[];
  triggers?: TriggerDef[];
  /** Tool: attacks it gives to the Pokémon it is attached to. */
  attacks?: AttackDef[];
  /** Stadium: "Once during each player's turn, that player may…" (an action of the main phase). */
  stadiumAction?: boolean;
  /** Supporter: "If you go first, you may use this card during your first turn." */
  firstTurnOk?: boolean;
  /**
   * Item: "Play this card as if it were a 60-HP Basic {C} Pokémon." It is played onto the Bench like a Basic Pokémon
   * (the definition's `hp`, `types`, `stage`), never during setup; its `statics` apply to it while in play.
   */
  asPokemon?: boolean;
  /** "At any time during your turn, you may discard this card from play." */
  discardFromPlay?: boolean;
}

export interface EnergyDef {
  basic: boolean;
  /**
   * The units of Energy it provides: each unit is a set of types it may count as; `["C"]` provides Colorless only,
   * `["*"]` any one type. Basic Energy: one unit of its type.
   */
  provides: string[][];
  statics?: StaticRule[];
  triggers?: TriggerDef[];
  /** Attaching it is only allowed to Pokémon matching this condition (`self` = the target). */
  attachCondition?: Condition;
  /** Discarded by an effect of its Pokémon's own attack: attached again after attacking (Boomerang Energy). */
  returnAfterAttack?: boolean;
  /** Provides these units instead while attached to a Pokémon matching the filter (Ignition Energy). */
  /** "If this card is attached to a Basic Pokémon, this card provides every type of Energy but…" (`cond`: and if…). */
  providesIf?: { filter: PokemonFilter; provides: string[][]; cond?: Condition };
}

export interface CardDef {
  /** Definition id: `slug-of-english-name-xxxx`. */
  id: string;
  /** English name. */
  name: string;
  /** Name used by the 4-copies rule (R-FORMAT-3). */
  copyName: string;
  category: Category;
  tags: CardTag[];
  text: { en: CardText; fr?: CardText };
  hp?: number;
  types?: EType[];
  stage?: Stage;
  /** English name of the Pokémon it evolves from. */
  evolvesFrom?: string;
  /** Stage 2: the Basic Pokémon two stages below (Rare Candy), from the whole catalog. */
  basicOf?: string[];
  weakness?: { type: EType; mult: number };
  resistance?: { type: EType; amount: number };
  retreat?: number;
  attacks?: AttackDef[];
  abilities?: AbilityDef[];
  trainer?: TrainerDef;
  energy?: EnergyDef;
  /** Standard-legal (R-FORMAT-1). */
  standard: boolean;
  regulationMark?: string;
  /** Every paragraph of the card is compiled or scripted. */
  implemented: boolean;
  /** What is not implemented (English text paragraphs). */
  missing?: string[];
  /** Default print (TCGdex id) and its images. */
  print: string;
  image?: { en?: string; fr?: string };
}

/** A printing of a definition (art and decklist code). */
export interface PrintInfo {
  /** TCGdex id: `sv08-076`. */
  id: string;
  defId: string;
  set: string;
  /** Decklist code and number: `SSP 76`. */
  code: string;
  number: string;
  rarity?: string;
  regulationMark?: string;
  standard: boolean;
  image?: { en?: string; fr?: string };
}
