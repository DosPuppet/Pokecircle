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
  /** Remaining HP at most ("that has 30 HP or less remaining"). */
  maxRemainingHp?: number;
  /** Has an Ability that Knocks Out the Pokémon using it (Psyduck's Damp). */
  selfKOAbility?: boolean;
  /** Has an Ability with this English name. */
  abilityNamed?: string;
  /** Has an attack with this English name ("each of your Pokémon in play that has the Round attack"). */
  attackNamed?: string;
  /** Has a Tool or an Energy card with this English name attached ("has a Future Booster Energy Capsule attached"). */
  attachedNamed?: string;
  /** Has Special Energy attached. */
  specialEnergy?: boolean;
  /** Has Resistance to this type. */
  resistance?: EType;
  /** Has exactly this many damage counters ("that has exactly 6 damage counters on it"). */
  counters?: number;
  /** At most this many Energy cards attached. */
  maxEnergy?: number;
  /** Affected by one of these Special Conditions ("Burned Pokémon"). */
  status?: SpecialCondition[];
  /** Has Energy attached that provides one of these types ("that have {M} Energy attached"). */
  energyTypes?: EType[];
  /** Put into play before this turn (Rare Candy, evolution). */
  enteredBefore?: boolean;
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
  /** A Pokémon of the trigger's event (`attacker`: the Attacking Pokémon). */
  | { ev: string }
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
  /** Pokémon with an Ability of this English name ("Pokémon that have the Hide 'n' Sneak Ability"). */
  abilityNamed?: string;
  /** Pokémon with an attack of this English name ("Pokémon … that has the Bug Out attack"). */
  attackNamed?: string;
  /** Pokémon with Resistance to this type ("Pokémon with {F} Resistance"). */
  resistance?: EType;
  /** Pokémon with an Ability. */
  hasAbility?: boolean;
  /** Pokémon that evolve from a Pokémon of this side in play (Evolution cards). */
  evolvesFromInPlay?: Side;
  /** Evolves from this English name. */
  evolvesFrom?: string;
  /** Matches if any of these does ("Pokémon or Basic Energy cards"). */
  anyOf?: CardFilter[];
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
  /** Whole division (rounded down). */
  | { k: "div"; a: Amount; b: Amount }
  | { k: "mul"; of: Amount[] }
  | { k: "min"; of: Amount[] }
  | { k: "max"; of: Amount[] }
  /** Attached Energy: cards, or units provided (`units`), optionally of one type. */
  | { k: "energy"; on: PokemonRef; type?: EType; units?: boolean; basic?: boolean; special?: boolean; names?: string[] }
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
  /** Pokémon Tools attached. */
  | { k: "tools"; on: PokemonRef }
  /** Retreat Cost (number of Energy symbols). */
  | { k: "retreatCost"; on: PokemonRef }
  /** Special Conditions affecting a Pokémon. */
  | { k: "conditions"; on: PokemonRef }
  /** Types of Basic Energy attached (each type counted once). */
  | { k: "energyTypes"; on: PokemonRef }
  /** Damage done to a Pokémon by attacks during the previous turn (the opponent's last turn). */
  | { k: "damageTaken"; on: PokemonRef }
  /** Turn log entries of this turn (or the previous turn) matching a kind. */
  | { k: "turnLog"; event: TurnEventKind; side?: Side; previous?: boolean; filter?: CardFilter; sum?: boolean };

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
  | "damagedByAttack"
  /** A Pokémon moved from the Bench to the Active Spot. */
  | "becameActive"
  /** A Pokémon was put onto the Bench. */
  | "benched"
  /** Damage was healed from a Pokémon. */
  | "healed"
  /** Prize cards were taken (`amount`). */
  | "prizesTaken";

export type Comparison = ">=" | ">" | "<=" | "<" | "==" | "!=";

export type Condition =
  | { c: "true" }
  /** It is the turn of the player the condition is read for. */
  | { c: "myTurn" }
  /** The card of a trigger's event (`ev:<key>` holds its definition id) matches ("When 1 of your {W} Pokémon is…"). */
  | { c: "eventCard"; key: string; filter: CardFilter }
  /** `ref` has Weakness to a type of `of` ("has Weakness to your opponent's Active Pokémon's type"). */
  | { c: "weakTo"; ref: PokemonRef; of: PokemonRef }
  /** `ref` did this during its owner's last turn (`key`: the attack's name: "used Spiky Rolling during your last turn"). */
  | { c: "didLastTurn"; kind: TurnEventKind; ref: PokemonRef; key?: string }
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
  | { c: "stadium"; names?: string[]; owner?: "me" | "opp" }
  /** A turn log event of this turn concerns the Pokémon ("if this Pokémon moved from your Bench to the Active Spot this turn"). */
  | { c: "didThisTurn"; kind: TurnEventKind; ref: PokemonRef }
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
  | "bench"
  /** Face down among the Prize cards (Team Rocket's Bother-Bot). */
  | "prizes";

/** How long a timed effect lasts (R-TEXT-4: effects of attacks also end when the Pokémon leaves the Active Spot). */
export type Duration = "thisTurn" | "opponentsNextTurn" | "yourNextTurn" | "untilYourNextTurn";

export type Effect =
  // —— attack damage ——
  /** The attack's printed damage (with `bonusDamage`/`setDamage`) to the Defending Pokémon. */
  | { op: "mainDamage"; noWR?: boolean; noWeakness?: boolean; noResistance?: boolean; ignoreEffects?: boolean; to?: PokemonRef }
  /** "This attack does N more damage" (before modifiers, Weakness and Resistance). */
  | { op: "bonusDamage"; amount: Amount }
  /** "This attack does N less damage". */
  | { op: "lessDamage"; amount: Amount }
  /** The base damage becomes this amount ("20×": 20 times the count). */
  | { op: "setDamage"; amount: Amount }
  /** "This attack does nothing." */
  | { op: "attackFails" }
  /** Attack damage to other Pokémon (Weakness and Resistance only on the opponent's Active, R-ATTACK-5). */
  | {
      op: "damage";
      to: PokemonRef;
      amount: Amount;
      noWR?: boolean;
      noWeakness?: boolean;
      noResistance?: boolean;
      ignoreEffects?: boolean;
    }
  // —— damage counters ——
  | { op: "counters"; to: PokemonRef; n: Amount }
  /** Put N damage counters on Pokémon of a scope "in any way you like". */
  | { op: "spreadCounters"; scope: PokemonScope; n: Amount; prompt: string }
  | { op: "moveCounters"; from: PokemonRef; to: PokemonRef; n: Amount | "all" }
  /**
   * The stored card takes the place of the target's top card, which goes to the discard pile; attached cards, damage
   * counters, Special Conditions and turns in play stay (Transformation Tome, Ogre's Mask).
   */
  | { op: "replaceCard"; target: PokemonRef; card: string }
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
      /** Only the Pokémon with the least HP remaining among the scope (Inteleon's Bring Down). */
      leastHp?: boolean;
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
      /** Only the bottom N cards of the deck. */
      bottom?: Amount;
      reveal?: boolean;
      chooser?: "me" | "opp";
      /** Cards of different names only. */
      distinctNames?: boolean;
      /** Exclude the card being played. */
      notSource?: boolean;
      /** Only among stored cards. */
      among?: string;
      /** Chosen at random ("a random card from your opponent's hand"): no question. */
      random?: boolean;
    }
  /** Put stored cards in an order chosen by the controller (first = top). */
  | { op: "orderCards"; key: string; prompt: string }
  /** Remove from a stored list the ones stored in another. */
  | { op: "varMinus"; key: string; minus: string }
  /** A number from min to max ("discard up to 2"). */
  | { op: "chooseNumber"; min: Amount; max: Amount; store: string; prompt: string }
  /** Store an amount. */
  | { op: "set"; key: string; amount: Amount }
  // —— cards ——
  | { op: "draw"; n: Amount; who?: "me" | "opp"; store?: string }
  | { op: "drawUntil"; n: Amount; who?: "me" | "opp" }
  /** Move stored cards (from wherever they are). */
  | {
      op: "move";
      cards: string;
      to: CardDest;
      /** Onto the Bench: Pokémon of any Stage, as the card says ("Search your deck for up to 3 Charjabug and put them onto your Bench"). */
      anyStage?: boolean;
    }
  /** Move every card of a zone (optionally filtered); `store`: how many were moved. */
  | { op: "moveAll"; zone: CardZone; side: "me" | "opp"; to: CardDest; filter?: CardFilter; store?: string }
  /** A player reveals their hand (to both players). */
  | { op: "revealHand"; side: "me" | "opp" }
  | { op: "shuffleDeck"; who?: "me" | "opp" }
  /** Discard (or move) the top N cards of a deck. */
  | { op: "mill"; side: "me" | "opp"; n: Amount; to?: CardDest; store?: string }
  /** Attach stored cards (Energy, Tools) to a Pokémon chosen for each one among the scope; `store`: the Pokémon. */
  | {
      op: "attach";
      cards: string;
      to: PokemonScope;
      prompt: string;
      store?: string;
      target?: PokemonRef;
      /** Who places the cards (the opponent places their own: Delibird). */
      chooser?: "me" | "opp";
    }
  /** Evolve a stored Pokémon with a stored card (Rare Candy, "search for a card that evolves from…"). */
  | { op: "evolveWith"; card: string; target: PokemonRef; skipStage1?: boolean }
  /** Choose a Pokémon of a scope, then an Evolution card from the hand for it, and evolve (Rare Candy: skipping Stage 1). */
  | {
      op: "evolveFromHand";
      scope: PokemonScope;
      skipStage1?: boolean;
      prompt: string;
      /** The Evolution card comes from the deck ("search your deck for a card that evolves from …"), shuffled after. */
      fromDeck?: boolean;
      /** This Pokémon only, instead of a choice in the scope ("put it onto that Pokémon"). */
      target?: PokemonRef;
    }
  /** Move chosen Energy from Pokémon of a scope to one Pokémon (Iron Leaves ex). */
  | {
      op: "gatherEnergy";
      from: PokemonScope;
      to: PokemonRef;
      min: Amount;
      max: Amount;
      prompt: string;
      /** Only Energy providing one of these types ("Move any amount of {M} Energy"). */
      types?: EType[];
    }
  // —— attached cards ——
  | {
      op: "discardEnergy";
      from: PokemonRef;
      n: Amount | "all";
      types?: EType[];
      /** Only Energy cards with these English names ("Discard a Team Rocket's Energy from this Pokémon"). */
      names?: string[];
      special?: boolean;
      chooser?: "me" | "opp";
      store?: string;
      to?: CardDest;
    }
  | { op: "moveEnergy"; from: PokemonRef; to: PokemonScope; n: Amount; types?: EType[]; basic?: boolean; chooser?: "me" | "opp" }
  | { op: "discardTools"; from: PokemonRef }
  | { op: "discardStadium" }
  // —— Pokémon ——
  /** Switch the Active Pokémon of a side with a Benched Pokémon chosen by `chooser` (or stored in `with`). */
  | { op: "switch"; side: "me" | "opp"; chooser?: "me" | "opp"; with?: string }
  /** Put a Pokémon (and everything attached) into the hand / deck / discard pile. */
  | { op: "pokemonTo"; target: PokemonRef; to: "hand" | "deck" | "deckTop" | "discard" | "lostZone"; keepAttached?: boolean }
  | { op: "devolve"; target: PokemonRef; to?: "hand" | "deck" }
  /** "you win this game" (N's Sigilyph). */
  | { op: "winGame" }
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
  /** "Choose 1 of its attacks. During …, that Pokémon can't use that attack." */
  | { op: "lockAttack"; target: PokemonRef; duration: Duration; prompt: string }
  /** Look at cards without taking them (shown to the controller). */
  | { op: "look"; zone: CardZone; side: "me" | "opp"; top?: Amount }
  /** Take Prize cards ("take 1 more Prize card"). */
  | { op: "takePrizes"; n: Amount; side?: "me" | "opp" }
  /** Use the effect of a stored card (a Supporter discarded by Ninetales) as the effect of this attack. */
  | { op: "useCardEffects"; cards: string }
  /**
   * "Choose 1 of its attacks and use it as this attack": the attacks of Pokémon in play (a scope) or of stored cards,
   * optionally matching a filter. The chosen attack's damage and effects replace what is left of this attack.
   */
  | { op: "useAttackOf"; from: PokemonScope | { cards: string }; filter?: CardFilter; prompt: string }
  /** Records a once-per-turn use (a "you may" trigger counts only when accepted). */
  | { op: "markUsed"; key: string }
  /** "This Pokémon is Knocked Out" (an Ability's cost). */
  | { op: "knockOut"; target: PokemonRef }
  /** Choose Energy attached to Pokémon of a scope and discard (or move) them; `store`: how many. */
  | {
      op: "discardEnergyFrom";
      scope: PokemonScope;
      min: Amount;
      max: Amount;
      basic?: boolean;
      types?: EType[];
      store?: string;
      to?: CardDest;
      prompt: string;
    };
