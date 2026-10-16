/**
 * The effect DSL: serializable data interpreted by `effects.ts` (handlers in `ops/*`). Builders in `dsl.ts`.
 *
 * Sides and references are relative to the controller of what resolves (the player using the attack, the Ability, the
 * Trainer card, or the owner of the triggered card).
 */
import type { CardTag, Category, EType, Stage, TrainerKind } from "./cards";
import type { StaticRule } from "./rules";
import type { PokemonId } from "./state";

export type Side = "me" | "opp" | "both";
export type Where = "active" | "bench" | "any";
export type SpecialCondition = "asleep" | "confused" | "paralyzed" | "poisoned" | "burned";
export const SPECIAL_CONDITIONS: SpecialCondition[] = ["asleep", "burned", "confused", "paralyzed", "poisoned"];

export interface PokemonFilter {
  stage?: Stage[];
  /** Has one of these types. */
  types?: EType[];
  tags?: CardTag[];
  noTags?: CardTag[];
  /** Exact English names (of the top card). */
  names?: string[];
  /** The English name contains this text ("Team Rocket's"). */
  nameIncludes?: string;
  damaged?: boolean;
  hasEnergy?: boolean;
  hasTool?: boolean;
  hasAbility?: boolean;
  /** Has a Special Condition. */
  conditioned?: boolean;
  maxHp?: number;
  not?: PokemonFilter;
}

/** A set of Pokémon in play. `ids`: bound to given Pokémon (timed effects). */
export interface PokemonScope {
  side: Side;
  where?: Where;
  filter?: PokemonFilter;
  /** Only the source Pokémon. */
  self?: boolean;
  /** Excluding the source Pokémon. */
  notSelf?: boolean;
  ids?: PokemonId[];
}

/** One or more Pokémon in play. */
export type PokemonRef =
  /** The Pokémon using the attack or Ability, or holding the triggered card. */
  | "self"
  /** The Defending Pokémon (the opponent's Active when the attack was used), or the opponent's Active. */
  | "defending"
  | "myActive"
  | "oppActive"
  /** Pokémon stored in a variable (`choosePokemon`, triggers). */
  | { var: string }
  /** Every Pokémon of a scope. */
  | { scope: PokemonScope };

export interface CardFilter {
  category?: Category[];
  stage?: Stage[];
  /** Pokémon types. */
  types?: EType[];
  trainer?: TrainerKind[];
  basicEnergy?: boolean;
  /** Basic Energy of these types, or Energy providing them. */
  energyTypes?: EType[];
  names?: string[];
  nameIncludes?: string;
  tags?: CardTag[];
  noTags?: CardTag[];
  maxHp?: number;
  /** Pokémon that evolve from a Pokémon of this side in play (Evolution cards). */
  evolvesFromInPlay?: Side;
  /** Evolves from this English name. */
  evolvesFrom?: string;
  not?: CardFilter;
}

export type CardZone = "deck" | "hand" | "discard" | "prizes" | "lostZone";

export type Amount =
  | number
  /** A number stored by `set` or a choice. */
  | { k: "var"; key: string }
  /** How many objects are stored in a variable. */
  | { k: "count"; key: string }
  /** Heads of the last flip (or of the flip stored in `key`). */
  | { k: "heads"; key?: string }
  | { k: "tails"; key?: string }
  | { k: "add"; of: Amount[] }
  | { k: "sub"; a: Amount; b: Amount }
  | { k: "mul"; of: Amount[] }
  | { k: "min"; of: Amount[] }
  | { k: "max"; of: Amount[] }
  /** Attached Energy: cards, or units provided (`units`), optionally of one type. */
  | { k: "energy"; on: PokemonRef; type?: EType; units?: boolean; basic?: boolean; special?: boolean }
  /** Damage counters on a Pokémon (damage / 10). */
  | { k: "counters"; on: PokemonRef }
  | { k: "hp"; on: PokemonRef }
  | { k: "remainingHp"; on: PokemonRef }
  /** Pokémon in play matching a scope. */
  | { k: "pokemon"; scope: PokemonScope }
  /** Cards in a zone. */
  | { k: "cards"; zone: CardZone; side: Side; filter?: CardFilter }
  | { k: "prizesLeft"; side: Side }
  | { k: "prizesTaken"; side: Side }
  /** Free Bench places. */
  | { k: "benchSpace"; side: Side }
  /** Turn log entries of this turn (or the previous turn) matching a kind. */
  | { k: "turnLog"; event: TurnEventKind; side?: Side; previous?: boolean };

export type TurnEventKind =
  | "supporterPlayed"
  | "itemPlayed"
  | "stadiumPlayed"
  | "energyAttached"
  | "evolved"
  | "knockedOut"
  | "retreated"
  | "attacked"
  | "abilityUsed"
  | "damagedByAttack";

export type Comparison = ">=" | ">" | "<=" | "<" | "==" | "!=";

export type Condition =
  | { c: "true" }
  | { c: "heads"; key?: string }
  | { c: "cmp"; a: Amount; op: Comparison; b: Amount }
  | { c: "and"; of: Condition[] }
  | { c: "or"; of: Condition[] }
  | { c: "not"; of: Condition }
  /** Some Pokémon in play matches the scope. */
  | { c: "exists"; scope: PokemonScope }
  /** Every Pokémon of a reference matches the filter (false if none). */
  | { c: "matches"; ref: PokemonRef; filter: PokemonFilter }
  | { c: "hasCondition"; ref: PokemonRef; cond?: SpecialCondition }
  | { c: "isActive"; ref: PokemonRef }
  /** A yes/no answer or a stored truthy value. */
  | { c: "var"; key: string }
  /** It is the controller's first turn of the game. */
  | { c: "firstTurn" }
  /** The controller went first / second. */
  | { c: "wentFirst" }
  /** A Stadium is in play (optionally by name). */
  | { c: "stadium"; names?: string[] }
  /** Some card in a zone matches (deck not empty, a Pokémon in the discard pile). */
  | { c: "hasCards"; zone: CardZone; side: Side; filter?: CardFilter; atLeast?: number };

/** Where cards go. */
export type CardDest =
  | "hand"
  | "discard"
  | "lostZone"
  | "deckTop"
  | "deckBottom"
  /** Into the deck (shuffled afterwards by the effect). */
  | "deck"
  /** Basic Pokémon onto the Bench. */
  | "bench";

/** How long a timed effect lasts (R-TEXT-4: effects of attacks also end when the Pokémon leaves the Active Spot). */
export type Duration = "thisTurn" | "opponentsNextTurn" | "yourNextTurn" | "untilYourNextTurn";

export type Effect =
  // —— attack damage ——
  /** The attack's printed damage (with `bonusDamage`/`setDamage`) to the Defending Pokémon. */
  | { op: "mainDamage"; noWR?: boolean; ignoreEffects?: boolean; to?: PokemonRef }
  /** "This attack does N more damage" (before modifiers, Weakness and Resistance). */
  | { op: "bonusDamage"; amount: Amount }
  /** "This attack does N less damage". */
  | { op: "lessDamage"; amount: Amount }
  /** The base damage becomes this amount ("20×": 20 times the count). */
  | { op: "setDamage"; amount: Amount }
  /** "This attack does nothing." */
  | { op: "attackFails" }
  /** Attack damage to other Pokémon (Weakness and Resistance only on the opponent's Active, R-ATTACK-5). */
  | { op: "damage"; to: PokemonRef; amount: Amount; noWR?: boolean; ignoreEffects?: boolean }
  // —— damage counters ——
  | { op: "counters"; to: PokemonRef; n: Amount }
  /** Put N damage counters on Pokémon of a scope "in any way you like". */
  | { op: "spreadCounters"; scope: PokemonScope; n: Amount; prompt: string }
  | { op: "moveCounters"; from: PokemonRef; to: PokemonRef; n: Amount | "all" }
  | { op: "heal"; target: PokemonRef; amount: Amount | "all" }
  // —— Special Conditions ——
  | { op: "condition"; target: PokemonRef; cond: SpecialCondition; poison?: number }
  | { op: "cure"; target: PokemonRef; conds?: SpecialCondition[] }
  // —— choices ——
  /** Choose Pokémon in play and store them. */
  | {
      op: "choosePokemon";
      scope: PokemonScope;
      store: string;
      min?: Amount;
      max?: Amount;
      chooser?: "me" | "opp";
      prompt: string;
    }
  /**
   * Choose cards from a zone (searching the deck, the top N cards, the discard pile, the hand) and store them. The
   * chooser sees them; `reveal` shows the chosen cards to the opponent.
   */
  | {
      op: "chooseCards";
      zone: CardZone;
      side?: "me" | "opp";
      filter?: CardFilter;
      min?: Amount;
      max: Amount;
      store: string;
      prompt: string;
      /** Only the top N cards of the deck. */
      top?: Amount;
      reveal?: boolean;
      chooser?: "me" | "opp";
      /** Cards of different names only. */
      distinctNames?: boolean;
      /** Exclude the card being played. */
      notSource?: boolean;
    }
  /** A number from min to max ("discard up to 2"). */
  | { op: "chooseNumber"; min: Amount; max: Amount; store: string; prompt: string }
  /** Store an amount. */
  | { op: "set"; key: string; amount: Amount }
  // —— cards ——
  | { op: "draw"; n: Amount; who?: "me" | "opp" }
  | { op: "drawUntil"; n: Amount; who?: "me" | "opp" }
  /** Move stored cards (from wherever they are). */
  | { op: "move"; cards: string; to: CardDest }
  /** Move every card of a zone (optionally filtered). */
  | { op: "moveAll"; zone: CardZone; side: "me" | "opp"; to: CardDest; filter?: CardFilter }
  | { op: "shuffleDeck"; who?: "me" | "opp" }
  /** Discard (or move) the top N cards of a deck. */
  | { op: "mill"; side: "me" | "opp"; n: Amount; to?: CardDest }
  /** Attach stored cards (Energy, Tools) to a Pokémon chosen for each one among the scope. */
  | { op: "attach"; cards: string; to: PokemonScope; prompt: string }
  /** Evolve a stored Pokémon with a stored card (Rare Candy, "search for a card that evolves from…"). */
  | { op: "evolveWith"; card: string; target: PokemonRef; skipStage1?: boolean }
  // —— attached cards ——
  | {
      op: "discardEnergy";
      from: PokemonRef;
      n: Amount | "all";
      types?: EType[];
      special?: boolean;
      chooser?: "me" | "opp";
      store?: string;
      to?: CardDest;
    }
  | { op: "moveEnergy"; from: PokemonRef; to: PokemonScope; n: Amount; types?: EType[]; chooser?: "me" | "opp" }
  | { op: "discardTools"; from: PokemonRef }
  | { op: "discardStadium" }
  // —— Pokémon ——
  /** Switch the Active Pokémon of a side with a Benched Pokémon chosen by `chooser` (or stored in `with`). */
  | { op: "switch"; side: "me" | "opp"; chooser?: "me" | "opp"; with?: string }
  /** Put a Pokémon (and everything attached) into the hand / deck / discard pile. */
  | { op: "pokemonTo"; target: PokemonRef; to: "hand" | "deck" | "discard" | "lostZone"; keepAttached?: boolean }
  | { op: "devolve"; target: PokemonRef }
  // —— coins and control ——
  | { op: "flip"; n?: Amount; untilTails?: boolean; store?: string }
  | { op: "if"; cond: Condition; then: Effect[]; else?: Effect[] }
  | { op: "may"; prompt: string; then: Effect[]; else?: Effect[]; chooser?: "me" | "opp" }
  /** Choose one of several effects ("Choose 1:"); an option may require a condition. */
  | { op: "chooseOne"; prompt: string; options: { label: string; effects: Effect[]; cond?: Condition }[] }
  | { op: "repeat"; n: Amount; effects: Effect[] }
  /** For each stored Pokémon or card, with it bound to `as`. */
  | { op: "forEach"; key: string; as: string; effects: Effect[] }
  /** A timed effect on given Pokémon (`target`) or on the controller's side (no `target`). */
  | { op: "timed"; duration: Duration; rule: StaticRule; target?: PokemonRef }
  | { op: "endTurn" }
  /** Look at cards without taking them (shown to the controller). */
  | { op: "look"; zone: CardZone; side: "me" | "opp"; top?: Amount }
  /** Take Prize cards ("take 1 more Prize card"). */
  | { op: "takePrizes"; n: Amount }
  /** Use one of the attacks of a Pokémon (copying attacks). */
  | { op: "useAttackOf"; from: PokemonScope | "discardOrDeck"; prompt: string };
