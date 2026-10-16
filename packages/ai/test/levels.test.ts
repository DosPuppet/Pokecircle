/** AI levels: medium beats the random AI clearly; every level plays legal games. */
import { describe, expect, it } from "vitest";
import { arena } from "../../../tools/ai-arena";

describe("AI levels", () => {
  it("medium beats random at least 80% of the time (starter decks)", () => {
    const r = arena("medium", "random", 30, "starter", 100);
    expect(r.rate).toBeGreaterThanOrEqual(0.8);
  });
});
