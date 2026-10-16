/**
 * Every implemented Standard card is exercised once (PLAN-B B0, `exercise.ts`): its attacks, Abilities, the Trainer
 * card played, the Special Energy attached, in a generated position, without engine error or broken invariant. A
 * sample in the usual test run; all cards with `PK_EVERY_CARD=all` (`verify --full`).
 */
import { describe, expect, it } from "vitest";
import { CARDS } from "../src/index";
import { exercise } from "./exercise";

const all = process.env.PK_EVERY_CARD === "all";
const defs = Object.values(CARDS)
  .filter((d) => d.standard && d.implemented && !d.energy?.basic)
  .sort((a, b) => (a.id < b.id ? -1 : 1));
const chosen = all ? defs : defs.filter((_, i) => i % 7 === 0);

describe(`every card (${chosen.length} of ${defs.length})`, () => {
  it("each effect runs without engine error or broken invariant", () => {
    const errors: string[] = [];
    let tried = 0;
    for (const d of chosen) {
      const r = exercise(d);
      tried += r.tried.length;
      for (const e of r.errors) errors.push(`${d.name} [${d.id}] ${e}`);
    }
    expect(tried).toBeGreaterThan(chosen.length / 2);
    expect(errors).toEqual([]);
  }, 120_000);
});
