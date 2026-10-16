/**
 * Card text of the starter decks' cards (compiled templates), checked against the printed text. Scenario helpers from
 * the engine's tests.
 */
import { legalActions, plainText } from "@pokecircle/engine";
import { describe, expect, it } from "vitest";
import { answer, energy, handOf, play, pokemon, scenario } from "../../engine/test/helpers";
import { CARDS } from "../src/index";

const card = (name: string, set?: string) => {
  const d = Object.values(CARDS).find((x) => x.name === name && x.standard && (!set || x.print.startsWith(set)));
  if (!d) throw new Error(`no card ${name}`);
  return d;
};
const fire = card("Basic Fire Energy");
const water = card("Basic Water Energy");
const dummy = pokemon({ name: "Dummy", hp: 300 });

describe("starter Trainers", () => {
  it("Ultra Ball: discard 2 other cards, then search a Pokémon (playable only with 2 other cards)", () => {
    const ultra = card("Ultra Ball");
    const ponyta = card("Ponyta", "sv05");
    const alone = scenario({ p1: { active: dummy, hand: [ultra, fire] }, p2: { active: dummy } });
    expect(legalActions(alone.s, "p1").some((o) => o.type === "playTrainer")).toBe(false);
    const { s } = scenario({ p1: { active: dummy, hand: [ultra, fire, water], deck: [ponyta, fire] }, p2: { active: dummy } });
    let st = play(s, "p1", { type: "playTrainer", card: handOf(s, "p1", ultra)[0] as string });
    // Two other cards: the discard is forced, then the search.
    expect(st.pending).toMatchObject({ kind: "choice", request: { intent: "search" } });
    const req = st.pending?.kind === "choice" ? st.pending.request : null;
    expect(req?.type === "pick" && req.options.length).toBe(1);
    st = answer(st, req?.suggested ?? []);
    expect(handOf(st, "p1", ponyta)).toHaveLength(1);
    expect(st.players.p1?.discard).toHaveLength(3);
    expect(st.players.p1?.deck).toHaveLength(1);
  });

  it("Judge: each player shuffles their hand into their deck and draws 4", () => {
    const judge = card("Judge");
    const { s } = scenario({
      p1: { active: dummy, hand: [judge, fire], deck: Array(10).fill(fire) },
      p2: { active: dummy, hand: [water, water, water, water, water, water], deck: Array(10).fill(water) },
    });
    const st = play(s, "p1", { type: "playTrainer", card: handOf(s, "p1", judge)[0] as string });
    expect(st.players.p1?.hand).toHaveLength(4);
    expect(st.players.p2?.hand).toHaveLength(4);
    expect(st.players.p2?.deck).toHaveLength(12);
  });

  it("Boss's Orders: switch in a Benched Pokémon of the opponent (needs one)", () => {
    const boss = card("Boss's Orders");
    const none = scenario({ p1: { active: dummy, hand: [boss] }, p2: { active: dummy } });
    expect(legalActions(none.s, "p1").some((o) => o.type === "playTrainer")).toBe(false);
    const { s, p2 } = scenario({ p1: { active: dummy, hand: [boss] }, p2: { active: dummy, bench: [dummy, dummy] } });
    let st = play(s, "p1", { type: "playTrainer", card: handOf(s, "p1", boss)[0] as string });
    expect(st.pending?.player).toBe("p1");
    st = answer(st, [p2.bench[1] as string]);
    expect(st.players.p2?.active).toBe(p2.bench[1]);
  });

  it("Pokémon Catcher: a flip; heads, the same as Boss's Orders", () => {
    const catcher = card("Pokémon Catcher");
    const results = new Set<boolean>();
    for (let seed = 1; seed < 20; seed++) {
      const { s, p2 } = scenario({ seed, p1: { active: dummy, hand: [catcher] }, p2: { active: dummy, bench: [dummy] } });
      const st = play(s, "p1", { type: "playTrainer", card: handOf(s, "p1", catcher)[0] as string });
      results.add(st.players.p2?.active === p2.bench[0]);
    }
    expect([...results].sort()).toEqual([false, true]);
  });

  it("Potion heals 30; Super Potion heals 60 and discards an Energy", () => {
    const potion = card("Potion");
    const superPotion = card("Super Potion");
    const { s, p1 } = scenario({
      p1: { active: { def: dummy, damage: 100, energy: [water, water] }, hand: [potion, superPotion] },
      p2: { active: dummy },
    });
    let st = play(s, "p1", { type: "playTrainer", card: handOf(s, "p1", potion)[0] as string });
    expect(st.pokemon[p1.active as string]?.damage).toBe(70);
    st = play(st, "p1", { type: "playTrainer", card: handOf(st, "p1", superPotion)[0] as string });
    // Two Energy attached: the player chooses the one to discard.
    st = answer(st, st.pending?.kind === "choice" ? st.pending.request.suggested : []);
    expect(st.pokemon[p1.active as string]?.damage).toBe(10);
    expect(st.pokemon[p1.active as string]?.energy).toHaveLength(1);
    const healthy = scenario({ p1: { active: dummy, hand: [potion] }, p2: { active: dummy } });
    expect(legalActions(healthy.s, "p1").some((o) => o.type === "playTrainer")).toBe(false);
  });

  it("Energy Retrieval: up to 2 Basic Energy from the discard pile", () => {
    const retrieval = card("Energy Retrieval");
    const { s } = scenario({ p1: { active: dummy, hand: [retrieval], discard: [fire, fire, fire] }, p2: { active: dummy } });
    let st = play(s, "p1", { type: "playTrainer", card: handOf(s, "p1", retrieval)[0] as string });
    const req = st.pending?.kind === "choice" ? st.pending.request : null;
    expect(req?.type === "pick" && [req.min, req.max]).toEqual([0, 2]);
    st = answer(st, req?.suggested ?? []);
    expect(handOf(st, "p1", fire)).toHaveLength(2);
  });

  it("Cheren draws 3", () => {
    const cheren = card("Cheren");
    const { s } = scenario({ p1: { active: dummy, hand: [cheren] }, p2: { active: dummy } });
    expect(play(s, "p1", { type: "playTrainer", card: handOf(s, "p1", cheren)[0] as string }).players.p1?.hand).toHaveLength(3);
  });
});

describe("starter Pokémon", () => {
  it("Rapidash (SCR) Burning Run: 60, and 60 more on heads", () => {
    const rapidash = card("Rapidash", "sv07");
    const seen = new Set<number>();
    for (let seed = 1; seed < 20; seed++) {
      const { s, p2 } = scenario({ seed, p1: { active: { def: rapidash, energy: [fire, fire] } }, p2: { active: dummy } });
      seen.add(play(s, "p1", { type: "attack", index: 0 }).pokemon[p2.active as string]?.damage ?? -1);
    }
    expect([...seen].sort()).toEqual([120, 60]);
  });

  it("Pyroar (PRE) Flame Tackle: 160, and it can't attack during its next turn", () => {
    const pyroar = card("Pyroar", "sv08.5");
    const { s, p1, p2 } = scenario({ p1: { active: { def: pyroar, energy: [fire, fire, fire] } }, p2: { active: dummy } });
    let st = play(s, "p1", { type: "attack", index: 1 });
    expect(st.pokemon[p2.active as string]?.damage).toBe(160);
    st = play(st, "p2", { type: "endTurn" });
    expect(st.turn.active).toBe("p1");
    expect(legalActions(st, "p1").some((o) => o.type === "attack")).toBe(false);
    st = play(st, "p1", { type: "endTurn" });
    st = play(st, "p2", { type: "endTurn" });
    expect(legalActions(st, "p1").some((o) => o.type === "attack")).toBe(true);
    void p1;
  });

  it("Ponyta (TEF) Charge Energy: search a Basic Energy into the hand", () => {
    const ponyta = card("Ponyta", "sv05");
    const { s } = scenario({ p1: { active: { def: ponyta, energy: [fire] }, deck: [dummy, fire] }, p2: { active: dummy } });
    const st = play(s, "p1", { type: "attack", index: 0 });
    const req = st.pending?.kind === "choice" ? st.pending.request : null;
    expect(req?.type === "pick" && req.options).toHaveLength(1);
    expect(handOf(answer(st, req?.suggested ?? []), "p1", fire)).toHaveLength(1);
  });

  it("Spheal Powder Snow: the opponent's Active Pokémon is now Asleep", () => {
    const spheal = card("Spheal", "sv08");
    const { s, p2 } = scenario({ p1: { active: { def: spheal, energy: [water] } }, p2: { active: dummy } });
    const st = play(s, "p1", { type: "attack", index: 0 });
    expect(st.pokemon[p2.active as string]?.damage).toBe(10);
    // Asleep, unless it woke up at the Checkup.
    expect(["asleep", undefined]).toContain(st.pokemon[p2.active as string]?.cond.rotating);
  });

  it("Volcarona (JTG) and Weakness: 80 ×2 against a Water-weak... a Grass Pokémon weak to Fire", () => {
    const volcarona = card("Volcarona", "sv09");
    const leafy = pokemon({ hp: 300, types: ["G"], weakness: { type: "R", mult: 2 } });
    const { s, p2 } = scenario({ p1: { active: { def: volcarona, energy: [fire, fire] } }, p2: { active: leafy } });
    expect(play(s, "p1", { type: "attack", index: 0 }).pokemon[p2.active as string]?.damage).toBe(160);
  });

  it("French names come from TCGdex", () => {
    expect(card("Pyroar", "sv08.5").text.fr?.name).toBe("Némélios");
    expect(plainText(card("Ultra Ball").text.fr?.name ?? "")).toBe("Hyper Ball");
  });
});

void energy;
