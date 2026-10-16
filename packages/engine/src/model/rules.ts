/**
 * Continuous rules (`StaticRule`): one union for Abilities, Pokémon Tools, Stadiums, Special Energy and timed effects.
 * Scopes are relative to the owner of the source (the controller of a timed effect). Read by `statics.ts`.
 */
import type { CardTag, EType } from "./cards";
import type { Amount, CardFilter, Condition, Effect, PokemonFilter, PokemonScope, Side, SpecialCondition } from "./effects";

export type StaticRule = (
  | /** Retreat Cost: +delta, or set to a value. */ { s: "retreat"; scope: PokemonScope; delta?: number; set?: number }
  | /** Attack costs: −n Colorless (negative: more); `attack`: only that attack; `anyType`: any Energy symbol. */ {
      s: "attackCost";
      scope: PokemonScope;
      less: Amount;
      attack?: string;
      anyType?: boolean;
    }
  | /** Attacks of the scope's Pokémon are not affected by effects on the opponent's Active Pokémon (Walking Wake ex). */ {
      s: "ignoreEffects";
      scope: PokemonScope;
    }
  | { s: "hp"; scope: PokemonScope; add: Amount }
  | /**
   * Attacks of the scope's Pokémon do more damage (before Weakness and Resistance), optionally only to Pokémon matching
   * `vs`, only to the opponent's Active Pokémon (`activeOnly`).
   */ {
      s: "dealt";
      scope: PokemonScope;
      add: Amount;
      vs?: PokemonFilter;
      activeOnly?: boolean;
      /** Only this attack ("this Pokémon's Mochi Rush attack does 50 more damage"). */
      attack?: string;
    }
  | /** Pokémon of the scope take more (or less, negative) damage from attacks, after Weakness and Resistance. */ {
      s: "taken";
      scope: PokemonScope;
      add: number;
      from?: PokemonFilter;
      /** The card giving the rule is discarded once it reduced damage (Berries: "…, and discard this card"). */
      consume?: boolean;
    }
  | /**
   * Prevent damage and/or effects of attacks (of the opponent's Pokémon, optionally matching `from`); `counters`:
   * damage counters put by effects of attacks and Abilities of the opponent's Pokémon.
   */ {
      s: "prevent";
      scope: PokemonScope;
      what: "damage" | "effects" | "all" | "counters";
      from?: PokemonFilter;
      /** Also attacks of the owner's own Pokémon (Tera on the Bench). */
      anyAttacker?: boolean;
      /** Only damage of this amount or less ("if that damage is 60 or less"). */
      maxDamage?: number;
      /** Only damage of this amount or more ("if that damage is 200 or more"). */
      minDamage?: number;
      /** "flip a coin. If heads, prevent that damage." (flipped when the damage is done) */
      flip?: boolean;
    }
  | /** Pokémon of the scope have no Abilities. */ { s: "noAbilities"; scope: PokemonScope }
  | /** Players of the side cannot play cards of these kinds. */ {
      s: "cantPlay";
      side: Side;
      kinds: ("item" | "supporter" | "stadium" | "tool")[];
      /** Only cards with these tags (ACE SPEC). */
      tags?: CardTag[];
    }
  | { s: "cantAttack"; scope: PokemonScope; attack?: string }
  | /** "If you go first, this Pokémon can use attacks during your first turn." */ { s: "firstTurnAttacks"; scope: PokemonScope }
  | /** "this Pokémon's Hyper Fang attack's base damage is 240" */ {
      s: "attackBase";
      scope: PokemonScope;
      attack: string;
      base: number;
    }
  | /** Before attacking, the Pokémon's owner flips a coin (`coins`: that many, all heads needed): tails, no attack. */ {
      s: "attackFlip";
      scope: PokemonScope;
      coins?: number;
    }
  | /** Energy cannot be attached from the hand to the scope's Pokémon. */ { s: "cantAttach"; scope: PokemonScope }
  | /** When a Pokémon of the scope retreats, its owner flips a coin: tails, nothing happens (Goodra). */ {
      s: "retreatFlip";
      scope: PokemonScope;
    }
  | /** Damage counters on the scope's Pokémon cannot be moved (Patrat). */ { s: "noMoveCounters"; scope: PokemonScope }
  | /** The scope's Pokémon and the cards attached to them can't be put into the hand (Milotic). */ {
      s: "noToHand";
      scope: PokemonScope;
    }
  | /** Pokémon Tools attached to every Pokémon have no effect (Jamming Tower; a Stadium's rule only). */ { s: "noTools" }
  | /** Confused Pokémon of the scope stay Confused when they evolve or devolve (Dizzying Valley). */ {
      s: "keepConfused";
      scope: PokemonScope;
    }
  | /**
   * When an Energy card is attached from the hand to a Pokémon of the scope: damage counters on it, and/or the turn
   * ends (Pachirisu, Gengar ex, Hypno).
   */ { s: "onAttach"; scope: PokemonScope; counters?: number; endsTurn?: boolean; heal?: number }
  | /** The scope's Pokémon count as this name for Evolution cards matching `filter` (Eevee ex's Rainbow DNA). */ {
      s: "evolvesAs";
      scope: PokemonScope;
      name: string;
      filter: CardFilter;
    }
  | { s: "cantRetreat"; scope: PokemonScope }
  | { s: "cantEvolve"; scope: PokemonScope }
  | /** Bench size of the side's players. */ { s: "benchSize"; side: Side; size: number; scope?: PokemonScope }
  | { s: "noWeakness"; scope: PokemonScope }
  | { s: "addType"; scope: PokemonScope; type: EType }
  | /** Prize cards taken when the scope's Pokémon are Knocked Out: +delta (`byAttack`: by damage from an attack). */ {
      s: "prizes";
      scope: PokemonScope;
      delta: number;
      byAttack?: boolean;
      /** "This effect of your <card> can't be applied more than once per game." */
      oncePerGame?: boolean;
      /** "flip a coin. If heads, take 1 more Prize card": flipped by the rule's owner when the Prizes are taken. */
      flip?: boolean;
      /** Only when Knocked Out by an attack of a Pokémon matching this (the opponent's Active Pokémon). */
      by?: PokemonFilter;
    }
  | /** The scope's Pokémon may use an attack twice in a turn (Festival Lead). */ { s: "attackTwice"; scope: PokemonScope }
  | /** Basic Energy of a type attached to the scope's Pokémon provides these units instead. */ {
      s: "energyAs";
      scope: PokemonScope;
      basic: EType;
      provides: string[][];
    }
  | /** The Weakness of the scope's Pokémon is now this type, and/or applied as ×`mult` (Illumise: ×3). */ {
      s: "weakness";
      scope: PokemonScope;
      type?: EType;
      mult?: number;
    }
  | /** Evolved Pokémon of the scope can use the attacks of their previous Evolutions (Relicanth's Memory Dive). */ {
      s: "prevolutionAttacks";
      scope: PokemonScope;
    }
  | /** The scope's Pokémon can't be healed (Yveltal's Life-Locked). */ { s: "noHeal"; scope: PokemonScope }
  | /** Players of the side flip a coin to use a Trainer card from their hand: tails, it is discarded (Seismitoad). */ {
      s: "trainerFlip";
      side: Side;
    }
  | /** The scope's Pokémon can evolve during the turn they are put into play (`firstTurn`: and during the first turn). */ {
      s: "evolveSameTurn";
      scope: PokemonScope;
      firstTurn?: boolean;
    }
  | /** An attack of the scope's Pokémon costs this. */ { s: "attackCostIs"; scope: PokemonScope; attack: string; cost: EType[] }
  | /** The scope's Pokémon can use the attacks of the Pokémon of `from` (Mew ex). */ {
      s: "borrowAttacks";
      scope: PokemonScope;
      from: PokemonScope;
    }
  | /** Pokémon of the scope cannot be affected by Special Conditions (`only`: by these). */ {
      s: "noConditions";
      scope: PokemonScope;
      only?: SpecialCondition[];
    }
  | /** During Pokémon Checkup, more damage counters for a Poisoned or Burned Pokémon of the scope. */ {
      s: "checkupCounters";
      scope: PokemonScope;
      status: "poisoned" | "burned";
      add: number;
    }
  | /**
   * A Pokémon of the scope that would be Knocked Out by damage from an attack is not: its remaining HP becomes `hp`
   * (`fullHp`: only if it had full HP; `flip`: if a coin flip is heads; `consume`: the card giving the rule is then
   * discarded).
   */ {
      s: "survive";
      scope: PokemonScope;
      hp: number;
      fullHp?: boolean;
      flip?: boolean;
      consume?: boolean;
      byOpponent?: boolean;
    }
  | /**
   * When a Pokémon of the scope is damaged by an attack of the opponent's Pokémon (even if it is Knocked Out), put
   * damage counters on the Attacking Pokémon.
   */ { s: "retaliate"; scope: PokemonScope; counters: number; asDamage?: boolean }
  | /** Players of the side cannot play Pokémon matching `filter` from their hand (Team Rocket's Arbok). */ {
      s: "cantPlayPokemon";
      side: Side;
      filter: CardFilter;
      except?: CardFilter;
    }
  | /** At the end of the turn the (timed) rule lasts until, its effects resolve on each Pokémon of the scope ("self"). */ {
      s: "endOfTurn";
      scope: PokemonScope;
      effects: Effect[];
    }
  | /** Once during the turn, the scope's Pokémon may flip again the coins of an attack (Backtrack Badge). */ {
      s: "reflip";
      scope: PokemonScope;
    }
  | /** Tools each Pokémon of the scope can have. */ { s: "toolSlots"; scope: PokemonScope; n: number }
  | /** Pokémon of the scope cannot be damaged or affected by the opponent's Abilities/Trainers. */ {
      s: "shielded";
      scope: PokemonScope;
      from: "abilities" | "trainers" | "supporters" | "all";
    }
) & {
  /** Applies only while this holds (evaluated in the source's context). */
  cond?: Condition;
  /** "The effect of <name> doesn't stack": one rule per key and player. */
  noStack?: string;
};
