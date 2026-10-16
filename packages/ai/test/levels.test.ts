/** AI levels: medium beats the random AI clearly; every level plays legal games. */
import { describe, expect, it } from "vitest";
import { arena } from "../../../tools/ai-arena";
import { decksFor } from "../../../tools/decks";
import { aiAgent, playGame } from "../src";

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
