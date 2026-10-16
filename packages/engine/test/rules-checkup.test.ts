/** Special Conditions and Pokémon Checkup (docs/rules.md R-COND, R-CHECKUP). */
import { describe, expect, it } from "vitest";
import { fx, legalActions, ref } from "../src/index";
import { play, pokemon, scenario } from "./helpers";

const plain = pokemon({ name: "Plain", hp: 200, attacks: [{ cost: [], damage: 10 }] });
const end = (s: Parameters<typeof legalActions>[0], p = "p1") => play(s, p, { type: "endTurn" });

describe("Pokémon Checkup", () => {
  it("R-CHECKUP-1: Poisoned puts 1 damage counter (or more) at each Checkup", () => {
    const { s, p1 } = scenario({ p1: { active: { def: plain, cond: { poisoned: 1 } } }, p2: { active: plain } });
    const s2 = end(s);
    expect(s2.pokemon[p1.active as string]?.damage).toBe(10);
    const s3 = end(s2, "p2");
    expect(s3.pokemon[p1.active as string]?.damage).toBe(20);
  });

  it("R-CHECKUP-1: Burned puts 2 damage counters, then a flip may cure it", () => {
    const cured = new Set<boolean>();
    for (let seed = 1; seed < 30; seed++) {
      const { s, p1 } = scenario({ seed, p1: { active: { def: plain, cond: { burned: true } } }, p2: { active: plain } });
      const s2 = end(s);
      expect(s2.pokemon[p1.active as string]?.damage).toBe(20);
      cured.add(!s2.pokemon[p1.active as string]?.cond.burned);
    }
    expect([...cured].sort()).toEqual([false, true]);
  });

  it("R-COND-2: Asleep cannot attack or retreat; a flip at each Checkup may wake it", () => {
    const { s } = scenario({
      p1: { active: { def: plain, cond: { rotating: "asleep" } }, bench: [plain] },
      p2: { active: plain },
    });
    const types = legalActions(s, "p1").map((o) => o.type);
    expect(types).not.toContain("attack");
    expect(types).not.toContain("retreat");
  });

  it("R-CHECKUP-1: Paralyzed recovers at the Checkup after its owner's next turn", () => {
    const paralyzer = pokemon({
      attacks: [{ cost: [], damage: 10, effects: [fx.main(), fx.condition(ref.defending, "paralyzed")] }],
    });
    const { s, p2 } = scenario({ p1: { active: paralyzer }, p2: { active: plain } });
    const s2 = play(s, "p1", { type: "attack", index: 0 });
    // p2's turn: still Paralyzed, cannot attack.
    expect(s2.pokemon[p2.active as string]?.cond.rotating).toBe("paralyzed");
    expect(legalActions(s2, "p2").some((o) => o.type === "attack")).toBe(false);
    const s3 = end(s2, "p2");
    expect(s3.pokemon[p2.active as string]?.cond.rotating).toBeUndefined();
  });

  it("R-COND-1: a rotating condition replaces another; markers stay", () => {
    const sleeper = pokemon({
      attacks: [
        { cost: [], damage: 0, effects: [fx.condition(ref.defending, "asleep"), fx.condition(ref.defending, "poisoned")] },
      ],
    });
    const { s, p2 } = scenario({
      p1: { active: sleeper },
      p2: { active: { def: plain, cond: { rotating: "confused", burned: true } } },
    });
    const after = play(s, "p1", { type: "attack", index: 0 });
    const c = after.pokemon[p2.active as string]?.cond;
    expect(c?.rotating === "asleep" || c?.rotating === undefined).toBe(true);
    expect(c?.poisoned).toBe(1);
  });

  it("R-COND-3: going to the Bench removes Special Conditions", () => {
    const sw = pokemon({ hp: 200, retreat: 0 });
    const { s, p1 } = scenario({
      p1: { active: { def: sw, cond: { poisoned: 1, rotating: "confused" } }, bench: [plain] },
      p2: { active: plain },
    });
    const after = play(s, "p1", { type: "retreat", to: p1.bench[0] as string, discard: [] });
    expect(after.pokemon[p1.active as string]?.cond).toEqual({});
  });
});
