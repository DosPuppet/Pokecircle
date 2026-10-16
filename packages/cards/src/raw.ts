/**
 * Card data as imported from TCGdex (`tools/import-tcgdex.ts`), one file per set in `data/<set>.json`. Structure comes
 * from the English card (category, stage, types, costs, damage, Weakness and Resistance), strings in French come from
 * the French card, aligned by index.
 */

/** Energy and Pokémon types: Grass, Fire, Water, Lightning, Psychic, Fighting, Darkness, Metal, Dragon, Colorless. */
export type RawType = "G" | "R" | "W" | "L" | "P" | "F" | "D" | "M" | "N" | "C" | "Y";

export interface RawAttack {
  name: string;
  cost: RawType[];
  /** "120", "30+", "20×", "120-"; absent: no printed damage. */
  damage?: string;
  effect?: string;
}

export interface RawAbility {
  /** TCGdex type: "Ability" for every modern card. */
  type: string;
  name: string;
  effect: string;
}

export interface RawCard {
  /** TCGdex id: `sv08-076`. */
  id: string;
  set: string;
  localId: string;
  category: "Pokemon" | "Trainer" | "Energy";
  /** English name. */
  name: string;
  rarity?: string;
  regulationMark?: string;
  /** TCGdex's per-card Standard legality (it applies the reprint rule for Trainers and Energy). */
  standard: boolean;
  hp?: number;
  types?: RawType[];
  stage?: "Basic" | "Stage1" | "Stage2";
  suffix?: string;
  evolveFrom?: string;
  abilities?: RawAbility[];
  attacks?: RawAttack[];
  weaknesses?: { type: RawType; value: string }[];
  resistances?: { type: RawType; value: string }[];
  retreat?: number;
  trainerType?: "Item" | "Supporter" | "Tool" | "Stadium";
  energyType?: "Normal" | "Special";
  effect?: string;
  /** Image base URL (append `/high.webp` or `/low.webp`). */
  image?: string;
  illustrator?: string;
  fr?: {
    name: string;
    abilities?: { name: string; effect: string }[];
    attacks?: { name: string; effect?: string }[];
    effect?: string;
    image?: string;
  };
}
