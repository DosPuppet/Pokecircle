/**
 * Card images TCGdex lacks (recent promos, some French scans): looked up on the Limitless TCG image CDN and written to
 * `packages/cards/data/image-fallbacks.json` (then pokemontcg.io, English only) (print id → { en?, fr? } full URLs). TCGdex images always come first.
 *
 *   npx tsx tools/image-fallbacks.ts
 */
import { writeFileSync } from "node:fs";
import { CARDS, PRINTS, PRINTS_OF } from "../packages/cards/src/index";

const CDN = "https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpci";
const PTCGIO = "https://images.pokemontcg.io";
const OUT = "packages/cards/data/image-fallbacks.json";

const url = (code: string, number: string, lang: "EN" | "FR") =>
  `${CDN}/${code}/${code}_${number.padStart(3, "0")}_R_${lang}_LG.png`;

async function exists(u: string): Promise<boolean> {
  for (let i = 0; i < 3; i++)
    try {
      const res = await fetch(u, { method: "HEAD" });
      return res.ok;
    } catch {}
  return false;
}

/** The print's TCGdex images only (the catalog already includes this file's fallbacks). */
const fromTcgdex = (id: string) => {
  const img = PRINTS[id]?.image ?? {};
  const own = (u?: string) => (u?.startsWith("https://assets.tcgdex.net/") ? u : undefined);
  return { en: own(img.en), fr: own(img.fr) };
};

const out: Record<string, { en?: string; fr?: string }> = {};
const wanted = Object.values(CARDS)
  .filter((d) => d.standard)
  .flatMap((d) => PRINTS_OF[d.id] ?? [])
  .filter((p) => !fromTcgdex(p.id).en || !fromTcgdex(p.id).fr);
for (const p of wanted) {
  const info = PRINTS[p.id];
  if (!info) continue;
  const entry: { en?: string; fr?: string } = {};
  const tcgdex = fromTcgdex(p.id);
  for (const lang of ["en", "fr"] as const) {
    if (tcgdex[lang]) continue;
    const u = url(info.code, info.number, lang === "en" ? "EN" : "FR");
    if (await exists(u)) entry[lang] = u;
  }
  const other = `${PTCGIO}/${info.set}/${info.number}_hires.png`;
  if (!entry.en && !entry.fr && !tcgdex.en && !tcgdex.fr && (await exists(other))) entry.en = other;
  if (entry.en || entry.fr) out[p.id] = entry;
}
const sorted = Object.fromEntries(Object.entries(out).sort(([a], [b]) => a.localeCompare(b)));
writeFileSync(OUT, `${JSON.stringify(sorted, null, 1)}\n`);
const missing = wanted.filter((p) => !out[p.id] && !fromTcgdex(p.id).en && !fromTcgdex(p.id).fr).map((p) => p.id);
console.log(`${Object.keys(out).length} prints with a fallback image; still without any image: ${missing.join(", ") || "none"}`);
