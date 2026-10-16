/**
 * Card images: TCGdex asset URLs (`<base>/high.webp`, `<base>/low.webp`). French first, then English, then another
 * print of the same definition; none: the interface draws a text face.
 */
import type { CardDef, PrintInfo } from "@pokecircle/engine";
import { PRINTS, PRINTS_OF } from "./index";

export type Quality = "high" | "low";

export function imageBase(def: CardDef, lang: "fr" | "en", print?: string): string | undefined {
  const p: PrintInfo | undefined = print ? PRINTS[print] : undefined;
  const pick = (img?: { en?: string; fr?: string }) => (lang === "fr" ? (img?.fr ?? img?.en) : (img?.en ?? img?.fr));
  return pick(p?.image) ?? pick(def.image) ?? (PRINTS_OF[def.id] ?? []).map((x) => pick(x.image)).find(Boolean);
}

export function imageUrl(base: string, quality: Quality = "high"): string {
  // A fallback image (Limitless TCG CDN) is a whole file, in one size.
  return /\.(png|jpe?g|webp)$/.test(base) ? base : `${base}/${quality}.webp`;
}
