/**
 * Continuous rules (`StaticRule`): one union for Abilities, Pokémon Tools, Stadiums, Special Energy and timed effects.
 * Scopes are relative to the owner of the source (the controller of a timed effect). Read by `statics.ts`.
 */
import type { EType } from "./cards";
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
  | /** Prevent damage and/or effects of attacks (of the opponent's Pokémon, optionally matching `from`). */ {
      s: "prevent";
      scope: PokemonScope;
      what: "damage" | "effects" | "all";
      from?: PokemonFilter;
      /** Also attacks of the owner's own Pokémon (Tera on the Bench). */
      anyAttacker?: boolean;
    }
  | /** Pokémon of the scope have no Abilities. */ { s: "noAbilities"; scope: PokemonScope }
  | /** Players of the side cannot play cards of these kinds. */ {
      s: "cantPlay";
      side: Side;
      kinds: ("item" | "supporter" | "stadium" | "tool")[];
    }
  | { s: "cantAttack"; scope: PokemonScope; attack?: string }
  | { s: "cantRetreat"; scope: PokemonScope }
  | { s: "cantEvolve"; scope: PokemonScope }
  | /** Bench size of the side's players. */ { s: "benchSize"; side: Side; size: number; scope?: PokemonScope }
  | { s: "noWeakness"; scope: PokemonScope }
  | { s: "addType"; scope: PokemonScope; type: EType }
  | /** Prize cards taken when the scope's Pokémon are Knocked Out: +delta. */ { s: "prizes"; scope: PokemonScope; delta: number }
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
