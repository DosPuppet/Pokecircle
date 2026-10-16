/**
 * Compares the imported Standard legality with TCGdex's current list (`legal.standard=true`): a print that changed
 * (rotation, ban, data fix) means a reimport (`npm run import-cards -- all --refresh`). Exit code 1 on a difference.
 *
 *   npx tsx tools/check-legality.ts
 */
import { PRINTS } from "../packages/cards/src/index";

const res = await fetch("https://api.tcgdex.net/v2/en/cards?legal.standard=true");
if (!res.ok) throw new Error(`TCGdex: HTTP ${res.status}`);
const live = new Set(((await res.json()) as { id: string }[]).map((c) => c.id));
const ours = Object.values(PRINTS);
const known = new Set(ours.map((p) => p.id));
const nowLegal = ours.filter((p) => !p.standard && live.has(p.id)).map((p) => p.id);
const nowIllegal = ours.filter((p) => p.standard && !live.has(p.id) && !p.defId.startsWith("basic-")).map((p) => p.id);
// Legal prints of sets we do not import (old Basic Energy prints, new sets).
const missing = [...live].filter((id) => !known.has(id));
const newSets = [...new Set(missing.map((id) => id.replace(/-[^-]+$/, "")))];
console.log(`now legal: ${nowLegal.length ? nowLegal.join(", ") : "none"}`);
console.log(`no longer legal: ${nowIllegal.length ? nowIllegal.join(", ") : "none"}`);
console.log(`legal prints of sets not imported: ${missing.length} (${newSets.join(", ")})`);
process.exitCode = nowLegal.length || nowIllegal.length ? 1 : 0;
