/**
 * The single list of imported sets (read by `tools/import-tcgdex.ts` and `sets.ts`). `code` is the TCG Live / Play!
 * Pokémon abbreviation used in decklists ("4 Latias ex SSP 76"). Order: release order; a reprint keeps the definition
 * of its first set.
 */
export interface SetInfo {
  /** TCGdex set id. */
  id: string;
  code: string;
  name: string;
  fr: string;
  released: string;
  serie: "sv" | "me";
  /** Only these prints of the set (a legal reprint in an otherwise rotated set). */
  only?: string[];
}

export const SET_REGISTRY: SetInfo[] = [
  {
    id: "sve",
    code: "SVE",
    name: "Scarlet & Violet Energy",
    fr: "Écarlate et Violet Énergie",
    released: "2023-03-31",
    serie: "sv",
  },
  { id: "svp", code: "SVP", name: "SVP Black Star Promos", fr: "Promos Black Star SVP", released: "2023-03-31", serie: "sv" },
  // Reversal Energy: legal through a reprint (TCGdex `legal.standard`), its set rotated.
  {
    id: "sv04",
    code: "PAR",
    name: "Paradox Rift",
    fr: "Faille Paradoxe",
    released: "2023-11-03",
    serie: "sv",
    only: ["sv04-266"],
  },
  { id: "sv05", code: "TEF", name: "Temporal Forces", fr: "Forces Temporelles", released: "2024-03-22", serie: "sv" },
  { id: "sv06", code: "TWM", name: "Twilight Masquerade", fr: "Mascarade Crépusculaire", released: "2024-05-24", serie: "sv" },
  { id: "sv06.5", code: "SFA", name: "Shrouded Fable", fr: "Fable Nébuleuse", released: "2024-08-02", serie: "sv" },
  { id: "sv07", code: "SCR", name: "Stellar Crown", fr: "Couronne Stellaire", released: "2024-09-13", serie: "sv" },
  { id: "sv08", code: "SSP", name: "Surging Sparks", fr: "Étincelles Déferlantes", released: "2024-11-08", serie: "sv" },
  { id: "sv08.5", code: "PRE", name: "Prismatic Evolutions", fr: "Évolutions Prismatiques", released: "2025-01-17", serie: "sv" },
  { id: "sv09", code: "JTG", name: "Journey Together", fr: "Aventures Ensemble", released: "2025-03-28", serie: "sv" },
  { id: "sv10", code: "DRI", name: "Destined Rivals", fr: "Rivalités Destinées", released: "2025-05-30", serie: "sv" },
  { id: "sv10.5b", code: "BLK", name: "Black Bolt", fr: "Foudre Noire", released: "2025-07-17", serie: "sv" },
  { id: "sv10.5w", code: "WHT", name: "White Flare", fr: "Flamme Blanche", released: "2025-07-17", serie: "sv" },
  { id: "mee", code: "MEE", name: "Mega Evolution Energy", fr: "Méga-Évolution Énergie", released: "2025-09-25", serie: "me" },
  { id: "me01", code: "MEG", name: "Mega Evolution", fr: "Méga-Évolution", released: "2025-09-26", serie: "me" },
  { id: "mep", code: "MEP", name: "MEP Black Star Promos", fr: "Promos Black Star MEP", released: "2025-09-26", serie: "me" },
  { id: "me02", code: "PFL", name: "Phantasmal Flames", fr: "Flammes Fantasmagoriques", released: "2025-11-14", serie: "me" },
  { id: "me02.5", code: "ASC", name: "Ascended Heroes", fr: "Héros Transcendants", released: "2026-01-30", serie: "me" },
  { id: "me03", code: "POR", name: "Perfect Order", fr: "Équilibre Parfait", released: "2026-03-27", serie: "me" },
  { id: "me04", code: "CRI", name: "Chaos Rising", fr: "Chaos Ascendant", released: "2026-05-22", serie: "me" },
  { id: "me05", code: "PBL", name: "Pitch Black", fr: "Nuit Noire", released: "2026-07-17", serie: "me" },
  { id: "30th", code: "30C", name: "30th Celebration", fr: "30ᵉ Anniversaire", released: "2026-09-16", serie: "me" },
  {
    id: "30th-c",
    code: "30C",
    name: "30th Classic Collection",
    fr: "Collection Classique 30ᵉ Anniversaire",
    released: "2026-09-16",
    serie: "me",
  },
];
