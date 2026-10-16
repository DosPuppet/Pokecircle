/**
 * Basic Energy art. TCGdex has no image for the Scarlet & Violet and Mega Evolution basic Energy prints (`sve`, `mee`),
 * so other prints of the same cards (always legal: R-FORMAT-4) give them their faces: Crown Zenith first (the
 * default), then the Scarlet & Violet gold prints, then Generations. They are ordinary prints: the deck builder offers
 * them, decklists read and write their codes.
 */
import type { PrintInfo } from "@pokecircle/engine";

const TYPES = ["grass", "fire", "water", "lightning", "psychic", "fighting", "darkness", "metal"] as const;

/** [TCGdex id, series, decklist code] of each type's print, in `TYPES` order. */
const ART: { series: string; code: string; ids: string[] }[] = [
  { series: "swsh", code: "CRZ", ids: TYPES.map((_, i) => `swsh12.5-${152 + i}`) },
  {
    series: "sv",
    code: "",
    ids: ["sv02-278", "sv03-230", "sv02-279", "sv01-257", "sv03.5-207", "sv01-258", "sv06.5-098", "sv06.5-099"],
  },
  { series: "xy", code: "GEN", ids: TYPES.map((_, i) => `g1-${75 + i}`) },
];

/** Decklist codes of the Scarlet & Violet sets these prints come from. */
const SV_CODES: Record<string, string> = { sv01: "SVI", sv02: "PAL", sv03: "OBF", "sv03.5": "MEW", "sv06.5": "SFA" };

/** The extra prints of each basic Energy definition (`basic-fire-energy`…), the default first. */
export const ENERGY_ART: Record<string, PrintInfo[]> = {};
for (const art of ART)
  art.ids.forEach((id, i) => {
    const defId = `basic-${TYPES[i]}-energy`;
    const [set, number] = id.split("-") as [string, string];
    const path = `${art.series}/${set}/${number}`;
    const print: PrintInfo = {
      id,
      defId,
      set,
      code: art.code || (SV_CODES[set] ?? set.toUpperCase()),
      number: String(Number(number)),
      standard: true,
      image: { en: `https://assets.tcgdex.net/en/${path}`, fr: `https://assets.tcgdex.net/fr/${path}` },
    };
    ENERGY_ART[defId] = [...(ENERGY_ART[defId] ?? []), print];
  });
