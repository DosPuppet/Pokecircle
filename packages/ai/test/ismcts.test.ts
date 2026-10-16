/** The expert level (ISMCTS): reproducible, blind to hidden cards, and it finds an obvious win. */
import { cloneState, createGame, type GameState, submit } from "@pocketmate/engine";
import { describe, expect, it } from "vitest";
import { decksFor } from "../../../tools/decks";
import { energy, pokemon, scenario } from "../../engine/test/helpers";
import { candidates, expertAgent, mediumAgent, scoreMain } from "../src";

/** A meta-deck game played by two medium AIs until p1's main phase with several candidates, from turn `turn`. */
function position(seed: number, turn: number): GameState {
  const decks = decksFor("meta", seed);
  let s = createGame({
    seed,
    players: [
      { id: "p1", name: "A", deck: decks[0] },
      { id: "p2", name: "B", deck: decks[1] },
    ],
  }).state;
  const agents = { p1: mediumAgent({ seed: 1 }), p2: mediumAgent({ seed: 2 }) };
  for (let i = 0; i < 2000 && !s.over; i++) {
    const p = s.pending;
    if (!p) break;
    if (p.kind === "main" && p.player === "p1" && s.turn.number >= turn && candidates(scoreMain(s, "p1"), 5).length >= 3)
      return s;
    s = submit(s, p.player, agents[p.player as "p1" | "p2"](s, p.player)).state;
  }
  throw new Error("no position found");
}

/** Gives the hidden cards of `ids` other definitions (a permutation of theirs). */
function permute(s: GameState, ids: string[]): void {
  const defs = ids.map((id) => s.objects[id]?.defId as string);
  const rotated = [...defs.slice(1), defs[0] as string];
  ids.forEach((id, i) => {
    const o = s.objects[id];
    if (o) o.defId = rotated[i] as string;
  });
}

const key = (x: unknown) => JSON.stringify(x);

describe("ISMCTS (expert level)", () => {
  it("is reproducible with the same seed and iterations", () => {
    const s = position(11, 4);
    const a = expertAgent({ seed: 7, iterations: 16 })(s, "p1");
    const b = expertAgent({ seed: 7, iterations: 16 })(s, "p1");
    expect(key(a)).toBe(key(b));
  });

  it("doesn't read hidden cards: the opponent's hand, deck and Prizes, its own deck order and Prizes", () => {
    for (const [seed, turn] of [
      [11, 4],
      [23, 6],
    ] as const) {
      const s = position(seed, turn);
      const t = cloneState(s);
      const p1 = t.players.p1;
      const p2 = t.players.p2;
      if (!p1 || !p2) throw new Error("players");
      permute(t, [...p2.hand, ...p2.deck, ...p2.prizes]);
      permute(t, [...p1.deck, ...p1.prizes]);
      const names = (g: GameState) => (g.players.p2?.hand ?? []).map((id) => g.objects[id]?.defId).join();
      expect(names(t)).not.toBe(names(s));
      t.version++;
      const a = expertAgent({ seed: 3, iterations: 16 })(s, "p1");
      const b = expertAgent({ seed: 3, iterations: 16 })(t, "p1");
      expect(key(b)).toBe(key(a));
    }
  });

  it("takes the win: a Knock Out of the opponent's last Pokémon", () => {
    const fire = energy("R");
    const hitter = pokemon({
      name: "Hitter",
      types: ["R"],
      hp: 120,
      attacks: [
        { name: "Tap", cost: [], damage: 10 },
        { name: "Blast", cost: ["R"], damage: 60 },
      ],
    });
    const spare = pokemon({ name: "Spare", hp: 60 });
    const lone = pokemon({ name: "Lone", hp: 60 });
    const { s } = scenario({ p1: { active: { def: hitter, energy: [fire] }, hand: [spare, fire] }, p2: { active: lone } });
    let state = s;
    const agent = expertAgent({ seed: 5, iterations: 24 });
    for (let i = 0; i < 6 && !state.over; i++) {
      if (state.pending?.player !== "p1") break;
      state = submit(state, "p1", agent(state, "p1")).state;
    }
    expect(state.over).toBe(true);
    expect(state.winner).toBe("p1");
  });
});
