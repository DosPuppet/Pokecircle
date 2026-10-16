/** AI levels: medium beats the random AI clearly; every level plays legal games. */
import { CARDS } from "@pokecircle/cards";
import { legalActions } from "@pokecircle/engine";
import { describe, expect, it } from "vitest";
import { arena } from "../../../tools/ai-arena";
import { decksFor } from "../../../tools/decks";
import { play, pokemon, scenario } from "../../engine/test/helpers";
import { aiAgent, playGame } from "../src";
import { mediumAgent } from "../src/medium";

describe("AI levels", () => {
  it("medium beats random at least 80% of the time (starter decks)", () => {
    const r = arena("medium", "random", 30, "starter", 100);
    expect(r.rate).toBeGreaterThanOrEqual(0.8);
  });
});

describe("expert level", () => {
  it("plays whole legal games against medium (invariants checked)", () => {
    for (const seed of [3, 4]) {
      const decks = decksFor("meta", seed);
      const r = playGame({
        seed,
        decks,
        agents: [aiAgent("expert", { seed, iterations: 6 }), aiAgent("medium", { seed: seed + 1 })],
      });
      expect(r.errors).toEqual([]);
      expect(r.state.over).toBe(true);
    }
  });
});

describe("questions", () => {
  it("a number is simulated: Walking Wake with 30 HP left puts at most 2 damage counters on itself", () => {
    const wake = Object.values(CARDS).find(
      (d) => d.name === "Walking Wake" && d.attacks?.some((a) => a.name === "Undulating Slice"),
    );
    const water = CARDS["basic-water-energy"];
    if (!wake || !water) throw new Error("no Walking Wake");
    const foe = pokemon({ name: "Foe", hp: 300 });
    const { s } = scenario({ p1: { active: { def: wake, energy: [water, water, water], damage: 100 } }, p2: { active: foe } });
    const o = legalActions(s, "p1").find((x) => x.type === "attack" && x.name === "Undulating Slice");
    if (o?.type !== "attack") throw new Error("Undulating Slice is not usable");
    const st = play(s, "p1", { type: "attack", index: o.index });
    expect(st.pending?.kind === "choice" && st.pending.request.type).toBe("number");
    const d = mediumAgent({ seed: 1 })(st, "p1");
    expect(d.type === "choose" && Number(d.values[0])).toBeLessThanOrEqual(2);
  });
});
