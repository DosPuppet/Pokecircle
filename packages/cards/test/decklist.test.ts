/** TCG Live decklists (FR and EN) and deck construction rules (docs/rules.md R-FORMAT-2 to 5). */
import { plainText } from "@pocketmate/engine";
import { describe, expect, it } from "vitest";
import { type DeckEntries, parseDeckList, serializeDeckList, validateDeck } from "../src/decklist";
import { CARDS } from "../src/index";

const id = (name: string) => Object.values(CARDS).find((d) => d.name === name && d.standard)?.id as string;

const LIST = `Pokémon: 8
4 Latias ex SSP 76
4 Riolu MEG 76

Trainer: 8
4 Ultra Ball MEG 131
4 Switch MEG 130

Energy: 44
40 Psychic Energy MEE 13
4 Basic {F} Energy SVE 6

Total Cards: 60`;

describe("decklists", () => {
  it("reads a TCG Live list by code and number", () => {
    const { entries, errors } = parseDeckList(LIST);
    expect(errors).toEqual([]);
    expect(entries.find((e) => e[1] === id("Latias ex"))).toEqual([4, id("Latias ex"), "sv08-076"]);
    expect(entries.reduce((n, e) => n + e[0], 0)).toBe(60);
  });

  it("reads French names and headers, and Basic Energy by type", () => {
    const { entries, errors } = parseDeckList(
      "Pokémon : 4\n4 Latias-ex\nDresseur : 4\n4 Super Bonbon\nÉnergie : 12\n6 Énergie Psy de base\n6 Basic {P} Energy\nTotal de cartes : 20",
    );
    expect(errors).toEqual([]);
    const psy = Object.values(CARDS).find((d) => d.energy?.basic && d.energy.provides[0]?.[0] === "P")?.id;
    expect(entries).toEqual([
      [4, id("Latias ex")],
      [4, id("Rare Candy")],
      [12, psy],
    ]);
  });

  it("reports unknown lines", () => {
    const { errors } = parseDeckList("4 Totally Unknown Card XYZ 999\nnonsense");
    expect(errors.map(plainText)).toEqual(["Unknown card: 4 Totally Unknown Card XYZ 999", "Unreadable line: nonsense"]);
  });

  it("round-trips in English and French", () => {
    const { entries } = parseDeckList(LIST);
    for (const lang of ["en", "fr"] as const) {
      const text = serializeDeckList(entries, lang);
      expect(parseDeckList(text).entries).toEqual(entries);
    }
    expect(serializeDeckList(entries, "fr")).toContain("Total de cartes : 60");
  });
});

describe("validateDeck", () => {
  const energy = Object.values(CARDS).find((d) => d.energy?.basic)?.id as string;
  const base = (extra: DeckEntries): DeckEntries => [[4, id("Riolu")], ...extra];
  const problems = (entries: DeckEntries) => validateDeck(entries, "unlimited").map(plainText);

  it("needs exactly 60 cards (R-FORMAT-2)", () => {
    expect(problems(base([[55, energy]]))).toContain("A deck has exactly 60 cards (59 here)");
  });

  it("allows 4 cards of a name, Basic Energy excepted (R-FORMAT-3)", () => {
    expect(problems(base([[56, energy]])).filter((p) => p.startsWith("At most 4"))).toEqual([]);
    expect(
      problems([
        [5, id("Riolu")],
        [55, energy],
      ]),
    ).toContain(`At most 4 cards named ${id("Riolu")} (5 here)`);
  });

  it("needs a Basic Pokémon (R-FORMAT-4)", () => {
    expect(problems([[60, energy]])).toContain("A deck needs at least 1 Basic Pokémon");
  });

  it("allows 1 ACE SPEC (R-FORMAT-5)", () => {
    expect(
      problems(
        base([
          [2, id("Secret Box")],
          [54, energy],
        ]),
      ),
    ).toContain("At most 1 ACE SPEC card (2 here)");
  });
});
