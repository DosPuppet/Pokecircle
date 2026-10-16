/**
 * The card catalog: definitions (`CARDS`, by definition id) and prints (`PRINTS`, by TCGdex id), built at load time
 * from the imported set data.
 */
import type { CardDef, PrintInfo } from "@pokecircle/engine";
import { type CompileReport, compileDef } from "./compile/index";
import { ENERGY_ART } from "./energyArt";
import { applyScript } from "./scripts";
// Hand scripts register themselves before the catalog is compiled.
import "./scripts/meta";
import "./scripts/meta2";
import "./scripts/me05";
import "./scripts/me04";
import "./scripts/me03";
import "./scripts/me02.5";
import "./scripts/me02";
import "./scripts/me01";
import "./scripts/sv10.5";
import { SET_REGISTRY } from "./setRegistry";
import { SET_DATA } from "./sets";
import { buildCatalog } from "./tcgdex";

export type { DeckEntries, DeckList, Format } from "./decklist";
export { FRENCH_CATALOGS } from "./locales";
export type { RawCard } from "./raw";
export { SET_REGISTRY } from "./setRegistry";
export { basicEnergyType, prizeValue, slug } from "./tcgdex";

const catalog = buildCatalog(SET_REGISTRY.map((s) => SET_DATA[s.id] ?? []));

/** What the compiler did not understand, per definition (coverage tool). */
export const COMPILE_REPORT: CompileReport = { templates: {}, unmatched: {} };

export const CARDS: Record<string, CardDef> = {};
for (const [id, def] of Object.entries(catalog.defs)) CARDS[id] = compileDef(applyScript(def), COMPILE_REPORT);

// Rare Candy: the Basic Pokémon two stages below each Stage 2, over the whole catalog.
const evolvesFrom = new Map<string, Set<string>>();
for (const d of Object.values(CARDS))
  if (d.category === "pokemon" && d.evolvesFrom)
    evolvesFrom.set(d.name, new Set([...(evolvesFrom.get(d.name) ?? []), d.evolvesFrom]));
for (const d of Object.values(CARDS))
  if (d.stage === "stage2" && d.evolvesFrom) d.basicOf = [...(evolvesFrom.get(d.evolvesFrom) ?? [])].sort();
export const PRINTS: Record<string, PrintInfo> = catalog.prints;
export const DEF_OF_PRINT: Record<string, string> = catalog.defOfPrint;

/** Prints of each definition, in registry order (basic Energy: the art prints first, `energyArt.ts`). */
export const PRINTS_OF: Record<string, PrintInfo[]> = {};
for (const [defId, prints] of Object.entries(ENERGY_ART)) {
  const def = CARDS[defId];
  if (!def) continue;
  for (const p of prints) {
    PRINTS[p.id] = p;
    DEF_OF_PRINT[p.id] = defId;
  }
  PRINTS_OF[defId] = [...prints];
  def.image = prints[0]?.image ?? def.image;
}
for (const p of Object.values(catalog.prints))
  if (!ENERGY_ART[p.defId]?.includes(p)) PRINTS_OF[p.defId] = [...(PRINTS_OF[p.defId] ?? []), p];
