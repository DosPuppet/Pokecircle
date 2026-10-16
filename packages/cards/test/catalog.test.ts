/** The catalog built from TCGdex data: sets, definitions, prints, tags and legality (docs/rules.md R-FORMAT-1). */
import { describe, expect, it } from "vitest";
import tagData from "../data/card-tags.json";
import frenchOverrides from "../data/french-overrides.json";
import { CARDS, DEF_OF_PRINT, PRINTS, PRINTS_OF } from "../src/index";
import { SET_REGISTRY } from "../src/setRegistry";
import { SET_DATA } from "../src/sets";

const defs = Object.values(CARDS);

describe("catalog", () => {
  it("lists every registered set, with data", () => {
    expect(Object.keys(SET_DATA)).toEqual(SET_REGISTRY.map((s) => s.id));
    for (const s of SET_REGISTRY) expect(SET_DATA[s.id]?.length, s.id).toBeGreaterThan(0);
  });

  it("maps every print to a definition, and back", () => {
    for (const [print, defId] of Object.entries(DEF_OF_PRINT)) {
      expect(CARDS[defId], print).toBeDefined();
      expect(PRINTS_OF[defId]?.some((p) => p.id === print)).toBe(true);
    }
    for (const d of defs) expect(PRINTS[d.print]?.defId, d.id).toBe(d.id);
  });

  it("has one definition per Basic Energy type, legal and implemented", () => {
    const basics = defs.filter((d) => d.energy?.basic);
    expect(basics.map((d) => d.energy?.provides[0]?.[0]).sort()).toEqual(["D", "F", "G", "L", "M", "P", "R", "W"]);
    for (const d of basics) {
      expect(d.standard && d.implemented).toBe(true);
      expect(d.text.fr?.name).toMatch(/de base$/);
    }
  });

  it("merges reprints with the same gameplay (Ultra Ball, Switch)", () => {
    for (const name of ["Ultra Ball", "Switch", "Rare Candy"]) {
      const list = defs.filter((d) => d.name === name);
      expect(list.length, name).toBe(1);
    }
  });

  it("is mostly Standard: about 2,100 legal definitions", () => {
    const legal = defs.filter((d) => d.standard).length;
    expect(legal).toBeGreaterThan(2000);
  });

  it("has French names for every Standard definition, except the listed ones", () => {
    const missing = defs.filter((d) => d.standard && !d.text.fr?.name).map((d) => d.name);
    expect(missing.sort()).toEqual(Object.keys(frenchOverrides.missing).sort());
  });

  it("derives tags: ex, Mega, ACE SPEC, Tera, Trainer's Pokémon", () => {
    const named = (n: string) => defs.find((d) => d.name === n && d.standard);
    expect(named("Latias ex")?.tags).toEqual(expect.arrayContaining(["ex", "ruleBox"]));
    expect(named("Mega Lucario ex")?.tags).toEqual(expect.arrayContaining(["ex", "mega", "ruleBox"]));
    expect(named("Secret Box")?.tags).toContain("aceSpec");
    expect(named("Teal Mask Ogerpon ex")?.tags).toContain("tera");
    expect(named("N's Zoroark ex")?.tags).toContain("trainersPokemon");
    for (const d of defs) {
      if (d.tags.includes("mega")) expect(d.tags, d.id).toContain("ex");
      if (d.tags.includes("tera")) expect(d.tags, d.id).toContain("ex");
      if (d.tags.includes("aceSpec")) expect(d.category, d.id).not.toBe("pokemon");
    }
  });

  it("tags only known prints", () => {
    for (const ids of Object.values(tagData as Record<string, string[]>))
      for (const id of ids) expect(PRINTS[id], id).toBeDefined();
  });

  it("reads Pokémon characteristics", () => {
    const latias = defs.find((d) => d.name === "Latias ex" && d.standard);
    expect(latias).toMatchObject({ hp: 210, types: ["P"], stage: "basic", retreat: 2 });
    expect(latias?.weakness).toEqual({ type: "D", mult: 2 });
    expect(latias?.resistance).toEqual({ type: "F", amount: 30 });
    expect(latias?.attacks?.[0]).toMatchObject({ name: "Eon Blade", cost: ["P", "P", "C"], damage: 200 });
    expect(latias?.text.fr?.name).toBe("Latias-ex");
  });
});
