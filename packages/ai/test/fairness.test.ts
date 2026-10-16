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

describe("determinization of the opponent's hidden cards", () => {
  it("draws them from what was seen of the opponent (and Basic Energy of their types)", () => {
    const decks = decksFor("meta", 9);
    let state = createGame({
      seed: 9,
      players: [
        { id: "p1", name: "A", deck: decks[0] },
        { id: "p2", name: "B", deck: decks[1] },
      ],
    }).state;
    // Past the setup: the opponent's Pokémon are revealed.
    for (let i = 0; i < 40 && state.flow === "setup"; i++) {
      const p = state.pending;
      if (!p) break;
      const d =
        p.kind === "choice"
          ? { type: "choose" as const, values: p.request.suggested }
          : p.kind === "setup"
            ? setupOf(state, p.player)
            : { type: "endTurn" as const };
      state = submit(state, p.player, d).state;
    }
    const opp = state.players.p2;
    if (!opp) throw new Error("p2");
    const seen = new Set<string>();
    for (const pk of Object.values(state.pokemon))
      if (pk.owner === "p2") for (const c of [...pk.cards, ...pk.energy, ...pk.tools]) seen.add(state.objects[c]?.defId ?? "");
    const d = determinize(state, "p1", mulberry32(4));
    for (const id of [...opp.hand, ...opp.deck, ...opp.prizes]) {
      const def = d.defs[d.objects[id]?.defId ?? ""];
      expect(seen.has(def?.id ?? "") || !!def?.energy?.basic).toBe(true);
    }
  });
});

function setupOf(s: Parameters<typeof determinize>[0], p: string) {
  const basics = (s.players[p]?.hand ?? []).filter((c) => {
    const d = s.defs[s.objects[c]?.defId ?? ""];
    return d?.category === "pokemon" && d.stage === "basic";
  });
  return { type: "setup" as const, active: basics[0] as string, bench: basics.slice(1, 3) };
}
