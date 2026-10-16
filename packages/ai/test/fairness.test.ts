/** The AI never reads hidden cards: determinization redeals them and reseeds the coin flips. */

import { createGame, submit } from "@pocketmate/engine";
import { describe, expect, it } from "vitest";
import { decksFor } from "../../../tools/decks";
import { determinize } from "../src/determinize";
import { mulberry32 } from "../src/rng";

describe("determinization", () => {
  it("keeps what the player sees and redeals the rest", () => {
    const decks = decksFor("starter", 5);
    let state = createGame({
      seed: 5,
      players: [
        { id: "p1", name: "A", deck: decks[0] },
        { id: "p2", name: "B", deck: decks[1] },
      ],
    }).state;
    // Past the choice of the first player: hands are dealt.
    while (state.pending?.kind === "choice")
      state = submit(state, state.pending.player, { type: "choose", values: state.pending.request.suggested }).state;
    const rng = mulberry32(1);
    const defs = (s: typeof state, ids: string[]) => ids.map((id) => s.objects[id]?.defId).join(",");
    let changedDeck = false;
    let changedOpp = false;
    for (let i = 0; i < 10; i++) {
      const d = determinize(state, "p1", rng);
      expect(defs(d, d.players.p1?.hand ?? [])).toBe(defs(state, state.players.p1?.hand ?? []));
      expect(d.rng).not.toBe(state.rng);
      if (defs(d, d.players.p1?.deck ?? []) !== defs(state, state.players.p1?.deck ?? [])) changedDeck = true;
      if (defs(d, d.players.p2?.hand ?? []) !== defs(state, state.players.p2?.hand ?? [])) changedOpp = true;
    }
    expect(changedDeck).toBe(true);
    expect(changedOpp).toBe(true);
  });
});
