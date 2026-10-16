import { describe, expect, it } from "vitest";
import { deckSize } from "../src/decklist";
import { PRECONS } from "../src/decks";
import { imageBase } from "../src/images";
import { CARDS, PRINTS_OF } from "../src/index";

describe("precons", () => {
  it("load with 60 cards, all Standard, with a cover", () => {
    for (const d of PRECONS) {
      expect(deckSize(d.main), d.id).toBe(60);
      for (const [, defId] of d.main) expect(CARDS[defId]?.standard, `${d.id}: ${defId}`).toBe(true);
      expect(d.cover, d.id).toBeDefined();
    }
  });

  it("have images for every card that has one, French first", () => {
    for (const d of PRECONS)
      for (const [, defId, print] of d.main) {
        const def = CARDS[defId];
        // Basic Energy and the few promos without any image get a drawn face.
        if (!def || def.energy?.basic || !(PRINTS_OF[defId] ?? []).some((p) => p.image)) continue;
        // TCGdex, or the fallback hosts for what it lacks (tools/image-fallbacks.ts).
        expect(imageBase(def, "fr", print), defId).toMatch(
          /^https:\/\/(assets\.tcgdex\.net\/(fr|en)\/|limitlesstcg\.nyc3\.cdn\.digitaloceanspaces\.com\/|images\.pokemontcg\.io\/)/,
        );
      }
  });
});
