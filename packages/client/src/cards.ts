/** Card data for the interface: names, texts and images in the interface language. */
import { CARDS, type DeckEntries, PRINTS } from "@pocketmate/cards";
import { imageBase, imageUrl, type Quality } from "@pocketmate/cards/images";
import type { CardDef, CardText } from "@pocketmate/engine";
import type { Lang } from "./translate";

export function defOf(defId: string | undefined): CardDef | undefined {
  return defId ? CARDS[defId] : undefined;
}

export function textOf(def: CardDef, lang: Lang): CardText {
  return (lang === "fr" ? def.text.fr : undefined) ?? def.text.en;
}

export function cardName(defId: string | undefined, lang: Lang): string {
  const d = defOf(defId);
  return d ? textOf(d, lang).name : "?";
}

export function cardImage(defId: string | undefined, lang: Lang, print?: string, quality: Quality = "low"): string | undefined {
  const d = defOf(defId);
  if (!d) return undefined;
  const base = imageBase(d, lang, print);
  return base ? imageUrl(base, quality) : undefined;
}

const TCGDEX = "https://assets.tcgdex.net/";

/** The same image through the PocketMate server (`/tcgdex/` relay), for networks that block assets.tcgdex.net. */
export function relayed(url: string): string {
  return url.startsWith(TCGDEX) ? `/tcgdex/${url.slice(TCGDEX.length)}` : url;
}

/** Definitions used by decks (sent to the game worker). */
export function defsOf(...decks: DeckEntries[]): Record<string, CardDef> {
  const out: Record<string, CardDef> = {};
  for (const deck of decks)
    for (const [, id] of deck) {
      const d = CARDS[id];
      if (d) out[id] = d;
    }
  return out;
}

export { CARDS, PRINTS };
