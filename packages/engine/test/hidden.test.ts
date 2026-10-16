/** Hidden information in the view and the events (view.ts). */
import { describe, expect, it } from "vitest";
import { filterEvents, fx, HIDDEN, projectView, submit } from "../src/index";
import { energy, handOf, pokemon, scenario, trainer } from "./helpers";

const fire = energy("R");
const plain = pokemon({ name: "Plain" });
const drawer = trainer("item", [fx.draw(2)], {}, "Drawer");

describe("hidden information", () => {
  const { s } = scenario({
    p1: { active: plain, hand: [drawer, fire], deck: [fire, plain, fire] },
    p2: { active: plain, hand: [fire, fire] },
  });

  it("the opponent's hand, every deck and every Prize card are hidden", () => {
    const v = projectView(s, "p1");
    expect(v.players.p2?.hand).toBeNull();
    expect(v.players.p2?.handCount).toBe(2);
    for (const id of s.players.p2?.hand ?? []) expect(v.faces[id]).toBeUndefined();
    for (const p of ["p1", "p2"]) {
      for (const id of [...(s.players[p]?.deck ?? []), ...(s.players[p]?.prizes ?? [])]) expect(v.faces[id]).toBeUndefined();
      expect(v.players[p]?.prizes).toBe(6);
    }
    for (const id of s.players.p1?.hand ?? []) expect(v.faces[id]).toBeDefined();
  });

  it("the opponent's draws are masked", () => {
    const { events } = submit(s, "p1", { type: "playTrainer", card: handOf(s, "p1", drawer)[0] as string });
    const draw = filterEvents(events, "p2").find((e) => e.type === "draw");
    expect(draw).toEqual({ type: "draw", player: "p1", cards: [HIDDEN, HIDDEN] });
    const own = filterEvents(events, "p1").find((e) => e.type === "draw");
    expect(own && "defIds" in own && own.defIds?.length).toBe(2);
  });

  it("only the decider sees a question's cards", () => {
    const search = trainer(
      "item",
      [fx.chooseCards("deck", "x", "Choose", { max: 1 }), fx.move("x", "hand"), fx.shuffle()],
      {},
      "Searcher",
    );
    const sc = scenario({ p1: { active: plain, hand: [search], deck: [fire, plain] }, p2: { active: plain } });
    const after = submit(sc.s, "p1", { type: "playTrainer", card: handOf(sc.s, "p1", search)[0] as string }).state;
    const mine = projectView(after, "p1");
    const theirs = projectView(after, "p2");
    expect(mine.pending?.request?.cards).toBeDefined();
    expect(theirs.pending?.request).toBeUndefined();
    for (const id of after.players.p1?.deck ?? []) {
      expect(mine.faces[id]).toBeDefined();
      expect(theirs.faces[id]).toBeUndefined();
    }
  });

  it("a random card from the opponent's hand: no question, the card is revealed to both, the rest stays hidden", () => {
    const random = trainer(
      "item",
      [
        fx.chooseCards("hand", "r", "Random", { side: "opp", min: 1, max: 1, random: true, reveal: true }),
        fx.move("r", "discard"),
      ],
      {},
      "Random",
    );
    const sc = scenario({ p1: { active: plain, hand: [random] }, p2: { active: plain, hand: [fire, plain, fire] } });
    const { state, events } = submit(sc.s, "p1", { type: "playTrainer", card: handOf(sc.s, "p1", random)[0] as string });
    expect(state.pending?.kind).toBe("main");
    expect(state.players.p2?.hand).toHaveLength(2);
    for (const viewer of ["p1", "p2"] as const) {
      const reveal = filterEvents(events, viewer).find((e) => e.type === "reveal");
      expect(reveal?.type === "reveal" && reveal.defIds).toHaveLength(1);
    }
    const v = projectView(state, "p1");
    for (const id of state.players.p2?.hand ?? []) expect(v.faces[id]).toBeUndefined();
  });

  it("the opponent chooses what they discard from their own hand: only they see the question", () => {
    const discard = trainer(
      "item",
      [fx.chooseCards("hand", "d", "Discard", { side: "opp", chooser: "opp", min: 1, max: 1 }), fx.move("d", "discard")],
      {},
      "Discarder",
    );
    const sc = scenario({ p1: { active: plain, hand: [discard] }, p2: { active: plain, hand: [fire, plain] } });
    const after = submit(sc.s, "p1", { type: "playTrainer", card: handOf(sc.s, "p1", discard)[0] as string }).state;
    expect(after.pending?.kind === "choice" && after.pending.player).toBe("p2");
    expect(projectView(after, "p1").pending?.request).toBeUndefined();
    expect(projectView(after, "p2").pending?.request?.cards).toBeDefined();
    for (const id of after.players.p2?.hand ?? []) expect(projectView(after, "p1").faces[id]).toBeUndefined();
  });
});
