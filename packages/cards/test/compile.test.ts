/**
 * The card compiler: fixed texts compile to the expected ops, and the number of implemented Standard definitions never
 * falls back (`data/compile-baseline.json`, the implemented ids; rewrite it when cards are added).
 */
import type { AttackDef, Effect } from "@pokecircle/engine";
import { describe, expect, it } from "vitest";
import baseline from "../data/compile-baseline.json";
import { compileAttack } from "../src/compile/attacks";
import { compileTrainer } from "../src/compile/trainers";
import { CARDS } from "../src/index";
import { scriptNames } from "../src/scripts";

const ops = (effects: Effect[]): string[] =>
  effects.flatMap((e) => {
    if (e.op === "if") return [`if(${ops(e.then).join(",")})`];
    return [e.op];
  });

const attack = (text: string, damage = 30, suffix?: AttackDef["suffix"]) => {
  const c = compileAttack({ name: "A", cost: [], damage, ...(suffix ? { suffix } : {}), text });
  return "unmatched" in c ? `unmatched: ${c.unmatched}` : ops(c.effects).join(" ");
};

describe("attack templates", () => {
  it.each([
    ["Flip a coin. If heads, your opponent's Active Pokémon is now Paralyzed.", 30, undefined, "mainDamage flip if(condition)"],
    ["Flip a coin. If heads, this attack does 30 more damage.", 30, "+", "flip if(bonusDamage) mainDamage"],
    ["Flip a coin. If tails, this attack does nothing.", 30, undefined, "flip if(attackFails) mainDamage"],
    ["This Pokémon also does 30 damage to itself.", 90, undefined, "mainDamage damage"],
    ["Discard 2 Energy from this Pokémon.", 120, undefined, "mainDamage discardEnergy"],
    ["During your next turn, this Pokémon can't attack.", 200, undefined, "mainDamage timed"],
    ["This attack does 20 damage for each Energy attached to this Pokémon.", 20, "x", "setDamage mainDamage"],
    ["Flip 3 coins. This attack does 30 damage for each heads.", 30, "x", "flip setDamage mainDamage"],
    ["Your opponent's Active Pokémon is now Burned and Confused.", 30, undefined, "mainDamage condition condition"],
    [
      "This attack also does 30 damage to 1 of your opponent's Benched Pokémon. (Don't apply Weakness and Resistance for Benched Pokémon.)",
      60,
      undefined,
      "mainDamage choosePokemon damage",
    ],
    [
      "Search your deck for up to 2 Basic Pokémon and put them onto your Bench. Then, shuffle your deck.",
      0,
      undefined,
      "chooseCards move shuffleDeck",
    ],
    ["Put 2 damage counters on your opponent's Active Pokémon.", 0, undefined, "counters"],
  ] as const)("%s", (text, damage, suffix, expected) => {
    expect(attack(text, damage, suffix)).toBe(expected);
  });

  it("leaves unknown texts unmatched", () => {
    expect(attack("Your opponent reveals their hand.")).toMatch(/^unmatched/);
  });
});

describe("Trainer templates", () => {
  it("Ultra Ball: the discard cost first, then the search; a condition on the hand", () => {
    const c = compileTrainer(
      "You can use this card only if you discard 2 other cards from your hand.\n\nSearch your deck for a Pokémon, reveal it, and put it into your hand. Then, shuffle your deck.",
      "item",
    );
    expect("trainer" in c && ops(c.trainer.effects ?? [])).toEqual(["chooseCards", "move", "chooseCards", "move", "shuffleDeck"]);
    expect("trainer" in c && c.trainer.condition?.c).toBe("and");
  });

  it("Tools become static rules", () => {
    const c = compileTrainer("The Pokémon this card is attached to gets +50 HP.", "tool");
    expect("trainer" in c && c.trainer.statics).toEqual([{ s: "hp", scope: { side: "me", self: true }, add: 50 }]);
  });
});

describe("hand scripts", () => {
  it("a script for a name shared by several definitions is keyed by print (Name@print)", () => {
    const shared = scriptNames().filter((k) => !k.includes("@") && Object.values(CARDS).filter((d) => d.name === k).length > 1);
    expect(shared).toEqual([]);
  });
});

describe("coverage", () => {
  it("every definition of the baseline stays implemented (npx tsx tools/card-coverage.ts --write-baseline)", () => {
    const lost = baseline.implemented.filter((id) => !CARDS[id]?.implemented);
    expect(lost).toEqual([]);
  });
});
