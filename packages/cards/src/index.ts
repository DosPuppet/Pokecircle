/**
 * The card catalog: definitions (`CARDS`, by definition id) and prints (`PRINTS`, by TCGdex id), built at load time
 * from the imported set data.
 */
import type { CardDef, PrintInfo } from "@pocketmate/engine";
import { SET_REGISTRY } from "./setRegistry";
import { SET_DATA } from "./sets";
import { buildCatalog } from "./tcgdex";

export { FRENCH_CATALOGS } from "./locales";
export type { RawCard } from "./raw";
export { SET_REGISTRY } from "./setRegistry";
export { basicEnergyType, prizeValue, slug } from "./tcgdex";

const catalog = buildCatalog(SET_REGISTRY.map((s) => SET_DATA[s.id] ?? []));

export const CARDS: Record<string, CardDef> = catalog.defs;
export const PRINTS: Record<string, PrintInfo> = catalog.prints;
export const DEF_OF_PRINT: Record<string, string> = catalog.defOfPrint;

/** Prints of each definition, in registry order. */
export const PRINTS_OF: Record<string, PrintInfo[]> = {};
for (const p of Object.values(PRINTS)) PRINTS_OF[p.defId] = [...(PRINTS_OF[p.defId] ?? []), p];
