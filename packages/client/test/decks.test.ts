/** Deck builder logic: catalog search (French and English) and share links. */

import { parseDeckList } from "@pokecircle/cards/decklist";
import { PRECONS } from "@pokecircle/cards/decks";
import { describe, expect, it } from "vitest";
import { fold, NO_FILTERS, searchCards } from "../src/decks/search";
import { deckLink, decodeDeck, sharedDeckData, sharedName } from "../src/decks/share";

describe("search", () => {
  it("finds a card by its French or English name, without accents", () => {
    const fr = searchCards({ ...NO_FILTERS, text: "nemelios" }, "fr").map((d) => d.name);
    expect(fr).toContain("Pyroar");
    const en = searchCards({ ...NO_FILTERS, text: "pyroar" }, "en").map((d) => d.name);
    expect(en).toContain("Pyroar");
    expect(fold("Énergie Électrique")).toBe("energie electrique");
  });

  it("filters by category, Trainer kind and type", () => {
    const supporters = searchCards({ ...NO_FILTERS, category: "trainer", trainer: "supporter" }, "fr");
    expect(supporters.length).toBeGreaterThan(5);
    expect(supporters.every((d) => d.trainer?.kind === "supporter")).toBe(true);
    const fire = searchCards({ ...NO_FILTERS, category: "pokemon", type: "R" }, "fr");
    expect(fire.every((d) => d.types?.includes("R"))).toBe(true);
  });

  it("hides unplayable cards when asked (outside Standard: every Standard card is playable)", () => {
    const wide = { ...NO_FILTERS, standardOnly: false };
    const all = searchCards({ ...wide, implementedOnly: false }, "en").length;
    const playable = searchCards({ ...wide, implementedOnly: true }, "en").length;
    expect(all).toBeGreaterThan(playable);
    expect(searchCards({ ...NO_FILTERS, implementedOnly: false }, "en").every((d) => d.implemented)).toBe(true);
  });
});

describe("share links", () => {
  it("round-trips a deck through a link", async () => {
    const deck = PRECONS[0]?.main ?? [];
    const link = await deckLink("Feu", deck, "https://pokecircle.test");
    expect(link.startsWith("https://pokecircle.test/#deck=1.")).toBe(true);
    const text = await decodeDeck(sharedDeckData(link) as string);
    expect(text).not.toBeNull();
    expect(sharedName(text as string)).toBe("Feu");
    expect(parseDeckList(text as string).entries).toEqual(deck);
  });

  it("refuses a damaged link", async () => {
    expect(await decodeDeck("1.!!!")).toBeNull();
    expect(await decodeDeck("9.abc")).toBeNull();
  });
});
