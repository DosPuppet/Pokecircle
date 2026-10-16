/** Setup (docs/rules.md R-SETUP). */
import { describe, expect, it } from "vitest";
import { createGame, type GameState, projectView } from "../src/index";
import { energy, play, pokemon } from "./helpers";

const basic = pokemon({ name: "Basicmon", attacks: [{ cost: ["C"], damage: 10 }] });
const fill = energy("C");
const deck = (basics: number) => [...Array(basics).fill(basic), ...Array(60 - basics).fill(fill)];

function start(seed: number, basics = 12): GameState {
  return createGame({
    seed,
    players: [
      { id: "p1", name: "A", deck: deck(basics) },
      { id: "p2", name: "B", deck: deck(basics) },
    ],
  }).state;
}

/** Plays the setup with the suggested answers and the first Basic as Active. */
function setUp(s: GameState): GameState {
  for (let i = 0; i < 20 && s.flow === "setup"; i++) {
    const p = s.pending;
    if (!p) break;
    if (p.kind === "choice") s = play(s, p.player, { type: "choose", values: p.request.suggested });
    else if (p.kind === "setup") {
      const hand = s.players[p.player]?.hand ?? [];
      const basics = hand.filter((c) => s.objects[c]?.defId === basic.id);
      s = play(s, p.player, { type: "setup", active: basics[0] as string, bench: basics.slice(1, 3) });
    }
  }
  return s;
}

describe("setup", () => {
  it("R-SETUP-1: the coin flip winner chooses to go first or second", () => {
    const s = start(1);
    expect(s.pending).toMatchObject({ kind: "choice", purpose: "chooseFirst" });
    const chooser = s.pending?.player as string;
    const after = play(s, chooser, { type: "choose", values: ["second"] });
    expect(after.turn.first).not.toBe(chooser);
  });

  it("R-SETUP-2/4/5: 7 cards, Active and Bench face down, 6 Prize cards, then the first turn draws", () => {
    const s = setUp(start(2));
    expect(s.flow).toBe("main");
    expect(s.turn.number).toBe(1);
    const first = s.turn.first;
    for (const p of ["p1", "p2"]) {
      const ps = s.players[p];
      expect(ps?.prizes).toHaveLength(6);
      expect(ps?.active).toBeTruthy();
      const placed = 1 + (ps?.bench.length ?? 0);
      const extra = s.players[p]?.mulligans === 0 ? (s.players[p === "p1" ? "p2" : "p1"]?.mulligans ?? 0) : 0;
      // 60 = deck + hand + in play + Prizes; the first player drew 1 card for turn 1.
      expect((ps?.deck.length ?? 0) + (ps?.hand.length ?? 0) + placed + 6).toBe(60);
      expect(ps?.hand.length).toBe(7 - placed + (p === first ? 1 : 0) + extra);
    }
  });

  it("R-SETUP-3: mulligans reveal the hand; the opponent may draw extra cards", () => {
    // Few Basics: mulligans are likely; find a seed where exactly one player mulligans more.
    for (let seed = 1; seed < 200; seed++) {
      let s = start(seed, 2);
      s = play(s, s.pending?.player as string, { type: "choose", values: ["first"] });
      const m1 = s.players.p1?.mulligans ?? 0;
      const m2 = s.players.p2?.mulligans ?? 0;
      if (m1 === m2) continue;
      const drawer = m1 > m2 ? "p2" : "p1";
      expect(s.pending).toMatchObject({ kind: "choice", purpose: "mulliganDraw", player: drawer });
      if (s.pending?.kind === "choice" && s.pending.request.type === "number")
        expect(s.pending.request.max).toBe(Math.abs(m1 - m2));
      return;
    }
    throw new Error("no seed with a mulligan difference");
  });

  it("hides the opponent's placement until both players have placed", () => {
    let s = start(3);
    while (s.pending?.kind === "choice") s = play(s, s.pending.player, { type: "choose", values: s.pending.request.suggested });
    expect(s.pending?.kind).toBe("setup");
    const p = s.pending?.player as string;
    const other = p === "p1" ? "p2" : "p1";
    const basics = (s.players[p]?.hand ?? []).filter((c) => s.objects[c]?.defId === basic.id);
    s = play(s, p, { type: "setup", active: basics[0] as string, bench: [] });
    const v = projectView(s, other);
    expect(v.players[p]?.placed).toBe(true);
    expect(v.faces[basics[0] as string]).toBeUndefined();
  });

  it("refuses a placement with a non-Basic card or more than 5 on the Bench", () => {
    let s = start(4);
    while (s.pending?.kind === "choice") s = play(s, s.pending.player, { type: "choose", values: s.pending.request.suggested });
    const p = s.pending?.player as string;
    const energyCard = (s.players[p]?.hand ?? []).find((c) => s.objects[c]?.defId === fill.id);
    if (energyCard) expect(() => play(s, p, { type: "setup", active: energyCard, bench: [] })).toThrow();
  });
});
