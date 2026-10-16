/**
 * Continuous rules (`StaticRule`): one union for Abilities, Pokémon Tools, Stadiums, Special Energy and timed effects.
 * Scopes are relative to the owner of the source (the controller of a timed effect). Read by `statics.ts`.
 */
import type { CardTag, EType } from "./cards";
import type { Amount, Condition, PokemonFilter, PokemonScope, Side } from "./effects";

export type StaticRule = (
  | /** Retreat Cost: +delta, or set to a value. */ { s: "retreat"; scope: PokemonScope; delta?: number; set?: number }
  | /** Attack costs: −n Colorless (negative: more). */ { s: "attackCost"; scope: PokemonScope; less: Amount }
  | { s: "hp"; scope: PokemonScope; add: number }
  | /**
   * Attacks of the scope's Pokémon do more damage (before Weakness and Resistance), optionally only to Pokémon matching
   * `vs`, only to the opponent's Active Pokémon (`activeOnly`).
   */ { s: "dealt"; scope: PokemonScope; add: Amount; vs?: PokemonFilter; activeOnly?: boolean }
  | /** Pokémon of the scope take more (or less, negative) damage from attacks, after Weakness and Resistance. */ {
      s: "taken";
      scope: PokemonScope;
      add: number;
      from?: PokemonFilter;
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
    }
  | /** The scope's Pokémon may use an attack twice in a turn (Festival Lead). */ { s: "attackTwice"; scope: PokemonScope }
  | /** Basic Energy of a type attached to the scope's Pokémon provides these units instead. */ {
      s: "energyAs";
      scope: PokemonScope;
      basic: EType;
      provides: string[][];
    }
  | /** The Weakness of the scope's Pokémon is now this type. */ { s: "weakness"; scope: PokemonScope; type: EType }
  | /** The scope's Pokémon can evolve during the turn they are put into play (not on the first turn). */ {
      s: "evolveSameTurn";
      scope: PokemonScope;
    }
  | /** An attack of the scope's Pokémon costs this. */ { s: "attackCostIs"; scope: PokemonScope; attack: string; cost: EType[] }
  | /** The scope's Pokémon can use the attacks of the Pokémon of `from` (Mew ex). */ {
      s: "borrowAttacks";
      scope: PokemonScope;
      from: PokemonScope;
    }
  | /** Pokémon of the scope cannot be affected by Special Conditions. */ { s: "noConditions"; scope: PokemonScope }
  | /** Tools each Pokémon of the scope can have. */ { s: "toolSlots"; scope: PokemonScope; n: number }
  | /** Pokémon of the scope cannot be damaged or affected by the opponent's Abilities/Trainers. */ {
      s: "shielded";
      scope: PokemonScope;
      from: "abilities" | "trainers" | "all";
    }
) & {
  /** Applies only while this holds (evaluated in the source's context). */
  cond?: Condition;
};
