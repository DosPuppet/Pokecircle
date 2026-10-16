/** The main phase (docs/rules.md R-TURN, R-EVOLVE, R-RETREAT, R-BENCH, R-TOOL, R-STADIUM). */
import { describe, expect, it } from "vitest";
import { fx, legalActions, plainText } from "../src/index";
import { energy, handOf, play, pokemon, scenario, trainer } from "./helpers";

const fire = energy("R");
const charm = pokemon({ name: "Charm", attacks: [{ cost: ["R"], damage: 20 }], retreat: 1 });
const charmeleon = pokemon({ name: "Charmeleon", stage: "stage1", evolvesFrom: "Charm", hp: 120 });
const other = pokemon({ name: "Other" });
const draw2 = trainer("supporter", [fx.draw(2)], {}, "Drawer");
const item = trainer("item", [fx.draw(1)], {}, "Gadget");
const stadium = trainer("stadium", [], { statics: [] }, "Arena");

describe("main phase", () => {
  it("R-TURN-2c: one Energy per turn", () => {
    const { s, p1 } = scenario({ p1: { active: charm, hand: [fire, fire] }, p2: { active: other } });
    const [a, b] = handOf(s, "p1", fire);
    const s2 = play(s, "p1", { type: "attachEnergy", card: a as string, target: p1.active as string });
    expect(s2.pokemon[p1.active as string]?.energy).toHaveLength(1);
    expect(() => play(s2, "p1", { type: "attachEnergy", card: b as string, target: p1.active as string })).toThrow();
  });

  it("R-TURN-2d: one Supporter per turn; Items without limit", () => {
    const { s } = scenario({
      p1: { active: charm, hand: [draw2, draw2, item, item], deck: [fire, fire, fire, fire, fire, fire] },
      p2: { active: other },
    });
    const [s1, s2] = handOf(s, "p1", draw2);
    const after = play(s, "p1", { type: "playTrainer", card: s1 as string });
    expect(after.players.p1?.hand).toHaveLength(3 + 2);
    expect(() => play(after, "p1", { type: "playTrainer", card: s2 as string })).toThrow();
    const [i1, i2] = handOf(after, "p1", item);
    const x = play(play(after, "p1", { type: "playTrainer", card: i1 as string }), "p1", {
      type: "playTrainer",
      card: i2 as string,
    });
    expect(x.players.p1?.discard).toHaveLength(3);
  });

  it("R-TURN-4: the first player cannot play a Supporter or attack on turn 1", () => {
    const { s } = scenario({ turn: 1, p1: { active: { def: charm, energy: [fire] }, hand: [draw2] }, p2: { active: other } });
    const types = legalActions(s, "p1").map((o) => o.type);
    expect(types).not.toContain("attack");
    expect(types).not.toContain("playTrainer");
    const { s: t2 } = scenario({
      turn: 2,
      active: "p2",
      p2: { active: { def: charm, energy: [fire] }, hand: [draw2] },
      p1: { active: other },
    });
    expect(legalActions(t2, "p2").map((o) => o.type)).toEqual(expect.arrayContaining(["attack", "playTrainer"]));
  });

  it("R-EVOLVE-2: not on a player's first turn, not a Pokémon put into play this turn", () => {
    const first = scenario({ turn: 2, active: "p2", p2: { active: charm, hand: [charmeleon] }, p1: { active: other } });
    expect(legalActions(first.s, "p2").some((o) => o.type === "evolve")).toBe(false);
    const fresh = scenario({ turn: 3, p1: { active: { def: charm, entered: 3 }, hand: [charmeleon] }, p2: { active: other } });
    expect(legalActions(fresh.s, "p1").some((o) => o.type === "evolve")).toBe(false);
    const ok = scenario({
      turn: 3,
      p1: { active: { def: charm, damage: 30, cond: { rotating: "asleep" } }, hand: [charmeleon] },
      p2: { active: other },
    });
    const card = handOf(ok.s, "p1", charmeleon)[0] as string;
    const s2 = play(ok.s, "p1", { type: "evolve", card, target: ok.p1.active as string });
    const pk = s2.pokemon[ok.p1.active as string];
    // R-EVOLVE-3: damage stays, Special Conditions go.
    expect(pk?.damage).toBe(30);
    expect(pk?.cond.rotating).toBeUndefined();
    expect(pk?.cards).toHaveLength(2);
  });

  it("R-RETREAT: discard Energy for the Retreat Cost, once per turn, not Asleep or Paralyzed", () => {
    const { s, p1 } = scenario({
      p1: { active: { def: charm, energy: [fire, fire], cond: { burned: true } }, bench: [other, other] },
      p2: { active: other },
    });
    const opt = legalActions(s, "p1").find((o) => o.type === "retreat");
    expect(opt).toMatchObject({ cost: 1 });
    const pk = s.pokemon[p1.active as string];
    expect(() => play(s, "p1", { type: "retreat", to: p1.bench[0] as string, discard: pk?.energy ?? [] })).toThrow(
      /Retreat Cost/,
    );
    const s2 = play(s, "p1", { type: "retreat", to: p1.bench[0] as string, discard: [pk?.energy[0] as string] });
    expect(s2.players.p1?.active).toBe(p1.bench[0]);
    expect(s2.pokemon[p1.active as string]?.cond.burned).toBeUndefined();
    expect(legalActions(s2, "p1").some((o) => o.type === "retreat")).toBe(false);
    const asleep = scenario({
      p1: { active: { def: charm, cond: { rotating: "asleep" } }, bench: [other] },
      p2: { active: other },
    });
    expect(legalActions(asleep.s, "p1").some((o) => o.type === "retreat")).toBe(false);
  });

  it("R-BENCH-1: at most 5 Benched Pokémon", () => {
    const { s } = scenario({
      p1: { active: charm, bench: [other, other, other, other, other], hand: [charm] },
      p2: { active: other },
    });
    expect(legalActions(s, "p1").some((o) => o.type === "playBasic")).toBe(false);
  });

  it("R-STADIUM: one Stadium; not the same name; the previous one is discarded", () => {
    const other2 = trainer("stadium", [], { statics: [] }, "Other Arena");
    const { s } = scenario({ p1: { active: charm, hand: [stadium] }, p2: { active: other, hand: [stadium, other2] } });
    const s1 = play(s, "p1", { type: "playTrainer", card: handOf(s, "p1", stadium)[0] as string });
    expect(s1.stadium).toBeTruthy();
    const s2 = play(s1, "p1", { type: "endTurn" });
    expect(legalActions(s2, "p2").some((o) => o.type === "playTrainer" && handOf(s2, "p2", stadium).includes(o.card))).toBe(
      false,
    );
    const s3 = play(s2, "p2", { type: "playTrainer", card: handOf(s2, "p2", other2)[0] as string });
    expect(s3.players.p1?.discard.some((c) => s3.objects[c]?.defId === stadium.id)).toBe(true);
  });

  it("an illegal decision throws a RulesError with a player-facing message", () => {
    const { s, p2 } = scenario({ p1: { active: charm, hand: [fire] }, p2: { active: other } });
    try {
      play(s, "p1", { type: "attachEnergy", card: handOf(s, "p1", fire)[0] as string, target: p2.active as string });
    } catch (e) {
      expect(plainText((e as Error).message)).toBe("You cannot attach this Energy now");
      return;
    }
    throw new Error("no error");
  });
});
