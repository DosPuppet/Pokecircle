/**
 * me05 (PLAN-B B5): the cards finishing the set, checked against the printed text with the engine's scenario helpers.
 */
import { type CardDef, type GameState, legalActions } from "@pokecircle/engine";
import { describe, expect, it } from "vitest";
import { answer, play, pokemon, scenario } from "../../engine/test/helpers";
import { CARDS } from "../src/index";

const card = (name: string, print?: string): CardDef => {
  const d = Object.values(CARDS).find((x) => x.name === name && x.standard && x.implemented && (!print || x.print === print));
  if (!d) throw new Error(`no card ${name} ${print ?? ""}`);
  return d;
};
const E = (t: string) => card(`Basic ${t} Energy`);
const dummy = pokemon({ name: "Dummy", hp: 300 });
const use = (s: GameState, name: string) => {
  const o = legalActions(s, "p1").find((x) => x.type === "attack" && x.name === name);
  if (o?.type !== "attack") throw new Error(`${name} is not usable`);
  return play(s, "p1", { type: "attack", index: o.index });
};
const hitter = (damage: number, extra: Partial<CardDef> = {}) =>
  pokemon({ name: "Hitter", hp: 300, attacks: [{ name: "Hit", cost: [], damage }], ...extra });

describe("PLAN-B B5: me05", () => {
  it("Charjabug Parallel Placement: up to 3 Charjabug (Stage 1) from the deck onto the Bench", () => {
    const charjabug = Object.values(CARDS).find(
      (x) => x.name === "Charjabug" && x.implemented && x.attacks?.some((a) => a.name === "Parallel Placement"),
    ) as CardDef;
    const { s } = scenario({
      p1: { active: { def: charjabug, energy: [E("Lightning")] }, deck: [charjabug, charjabug, dummy] },
      p2: { active: dummy },
    });
    let st = use(s, "Parallel Placement");
    const found = (st.players.p1?.deck ?? []).filter((c) => st.objects[c]?.defId === charjabug.id);
    st = answer(st, found);
    expect(st.players.p1?.bench).toHaveLength(2);
  });

  it("Jynx Intense Kiss: the Defending Pokémon is discarded at the end of the opponent's next turn", () => {
    const { s, p2 } = scenario({
      p1: { active: { def: card("Jynx", "me05-032"), energy: [E("Psychic")] } },
      p2: { active: dummy, bench: [dummy] },
    });
    let st = use(s, "Intense Kiss");
    expect(st.pokemon[p2.active as string]).toBeDefined();
    // The opponent's turn: it ends, and the Defending Pokémon is discarded (no Prize card).
    st = play(st, "p2", { type: "endTurn" });
    const ended = st.pending?.kind === "choice" ? answer(st, st.pending.request.suggested) : st;
    expect(ended.pokemon[p2.active as string]).toBeUndefined();
    expect(ended.players.p1?.prizes).toHaveLength(6);
  });

  it("Mega Slowbro ex Shellnado Spin: during the opponent's next turn, 12 damage counters on the Attacking Pokémon", () => {
    const slowbro = card("Mega Slowbro ex");
    const { s, p1, p2 } = scenario({
      p1: { active: { def: slowbro, energy: [E("Psychic"), E("Psychic"), E("Psychic")] } },
      p2: { active: hitter(10, { hp: 400 }) },
    });
    let st = use(s, "Shellnado Spin");
    st = play(st, "p2", { type: "attack", index: 0 });
    expect(st.pokemon[p1.active as string]?.damage).toBe(10);
    expect(st.pokemon[p2.active as string]?.damage).toBe(180 + 120);
  });

  it("Tremendous Bomb: 240 or more damage from a Mega Evolution Pokémon ex puts 12 damage counters on it, then the Bomb is discarded", () => {
    const bomb = card("Tremendous Bomb");
    const mega = pokemon({
      name: "Mega Hitter ex",
      hp: 400,
      tags: ["mega", "ex", "ruleBox"],
      attacks: [{ cost: [], damage: 250 }],
    });
    const { s, p1 } = scenario({ p1: { active: mega }, p2: { active: { def: dummy, tools: [bomb] }, bench: [dummy] } });
    const st = play(s, "p1", { type: "attack", index: 0 });
    // The holder is Knocked Out? 250 < 300: it stays; the Bomb is gone.
    expect(st.pokemon[p1.active as string]?.damage).toBe(120);
    expect(st.players.p2?.discard.some((c) => st.objects[c]?.defId === bomb.id)).toBe(true);
    const small = scenario({ p1: { active: { def: mega, damage: 0 } }, p2: { active: { def: dummy, tools: [bomb] } } });
    small.s.defs[mega.id] = { ...mega, attacks: [{ name: "Hit", cost: [], damage: 200 }] };
    const st2 = play(small.s, "p1", { type: "attack", index: 0 });
    expect(st2.pokemon[small.p1.active as string]?.damage).toBe(0);
  });

  it("Counterattack abilities still apply when the damaged Pokémon is Knocked Out (Mega Scrafty ex)", () => {
    const scrafty = card("Mega Scrafty ex");
    const { s, p1 } = scenario({ p1: { active: hitter(500) }, p2: { active: scrafty, bench: [dummy] } });
    const st = play(s, "p1", { type: "attack", index: 0 });
    expect(st.pokemon[p1.active as string]?.damage).toBe(50);
  });

  it("Miraidon Photon Cord: Knocked Out in the Active Spot, up to 2 Basic {L} Energy move to a Benched Pokémon", () => {
    const miraidon = card("Miraidon", "me05-028");
    const L = E("Lightning");
    const { s, p2 } = scenario({
      p1: { active: hitter(500) },
      p2: { active: { def: miraidon, energy: [L, L] }, bench: [dummy] },
    });
    let st = play(s, "p1", { type: "attack", index: 0 });
    for (let i = 0; i < 6 && st.pending?.kind === "choice"; i++) st = answer(st, st.pending.request.suggested);
    const benched = st.players.p2?.active ?? p2.bench[0];
    expect(st.pokemon[benched as string]?.energy).toHaveLength(2);
  });

  it("Spiritomb Spiritual End: with 13 Hide 'n' Sneak Pokémon in the discard pile, damage counters are quadrupled", () => {
    const shuppet = card("Shuppet", "me05-033");
    const { s, p2 } = scenario({
      p1: { active: { def: card("Spiritomb", "me05-035"), energy: [E("Psychic")] }, discard: Array(13).fill(shuppet) },
      p2: { active: { def: dummy, damage: 30 }, bench: [{ def: dummy, damage: 20 }] },
    });
    let st = use(s, "Spiritual End");
    // Exactly 2 Pokémon to choose: no question.
    if (st.pending?.kind === "choice") st = answer(st, [p2.active as string, p2.bench[0] as string]);
    expect(st.pokemon[p2.active as string]?.damage).toBe(120);
    expect(st.pokemon[p2.bench[0] as string]?.damage).toBe(80);
  });

  it("Backtrack Badge: once during the turn, the coins of the holder's attack may be flipped again", () => {
    const badge = card("Backtrack Badge");
    const flipper = pokemon({
      name: "Flipper",
      types: ["C"],
      attacks: [{ name: "Flip", cost: [], damage: 0, effects: [{ op: "flip", n: 3 }, fx_bonus()] }],
    });
    const { s } = scenario({ p1: { active: { def: flipper, tools: [badge] } }, p2: { active: dummy } });
    const st = play(s, "p1", { type: "attack", index: 0 });
    expect(st.pending?.kind === "choice" && st.pending.request.type).toBe("yesNo");
    const again = answer(st, [1]);
    // A second attack would not offer it again this turn: the question is gone.
    expect(again.pending?.kind).not.toBe("choice");
  });
});

/** "This attack does 10 damage for each heads." */
function fx_bonus() {
  return { op: "setDamage" as const, amount: { k: "mul" as const, of: [10, { k: "heads" as const }] } };
}
