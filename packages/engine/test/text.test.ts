import { describe, expect, it } from "vitest";
import { msg, parseText, plainText, renderText } from "../src/text";

describe("text markers", () => {
  it("round-trips a template and its values", () => {
    const t = msg("Draw {n} card(s)", { n: 2 });
    expect(parseText(t)).toEqual({ id: "Draw {n} card(s)", args: { n: "2" } });
    expect(plainText(t)).toBe("Draw 2 card(s)");
  });
  it("translates nested texts and card references", () => {
    const t = msg("{who} plays {card}", { who: msg("Your opponent"), card: "⟦pikachu⟧" });
    const fr: Record<string, string> = { "{who} plays {card}": "{who} joue {card}", "Your opponent": "Votre adversaire" };
    expect(renderText(t, { translate: (id) => fr[id], card: () => "Pikachu" })).toBe("Votre adversaire joue Pikachu");
  });
});
