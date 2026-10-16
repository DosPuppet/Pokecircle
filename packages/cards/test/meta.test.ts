/**
 * Card text of the meta decks' key cards (PLAN-A P6): compiled templates and hand scripts, checked against the printed
 * text with the engine's scenario helpers.
 */
import { type CardDef, type GameState, legalActions } from "@pokecircle/engine";
import { describe, expect, it } from "vitest";
import { answer, handOf, play, pokemon, scenario } from "../../engine/test/helpers";
import { CARDS } from "../src/index";

const card = (name: string, set?: string): CardDef => {
  const list = Object.values(CARDS).filter((x) => x.name === name && x.standard && (!set || x.print.startsWith(set)));
  const d = list.find((x) => x.implemented) ?? list[0];
  if (!d) throw new Error(`no card ${name}`);
  return d;
};
const E = (t: string) => card(`Basic ${t} Energy`);
const psy = E("Psychic");
const fire = E("Fire");
const grass = E("Grass");
const dark = E("Darkness");
const dummy = pokemon({ name: "Dummy", hp: 300 });
const small = pokemon({ name: "Small", hp: 60 });
const attack = (s: GameState, index = 0) => play(s, "p1", { type: "attack", index });
/** Answers the pending question with its suggestion, if one is asked (a single possible answer is never asked). */
const suggested = (s: GameState) => (s.pending?.kind === "choice" ? answer(s, s.pending.request.suggested) : s);

describe("meta Pokémon", () => {
  it("Dragapult ex Phantom Dive: 200 damage, then 6 damage counters on the Benched Pokémon in any way", () => {
    const { s, p2 } = scenario({
      p1: { active: { def: card("Dragapult ex"), energy: [fire, psy] } },
      p2: { active: dummy, bench: [small, small] },
    });
    let st = attack(s, 1);
    expect(st.pokemon[p2.active as string]?.damage).toBe(200);
    expect(st.pending?.kind === "choice" && st.pending.request.type).toBe("divide");
    st = answer(st, [2, 4]);
    expect(st.pokemon[p2.bench[0] as string]?.damage).toBe(20);
    // The second Benched Pokémon (60 HP) is Knocked Out by 4 counters... no: 40 < 60.
    expect(st.pokemon[p2.bench[1] as string]?.damage).toBe(40);
  });

  it("Battle Cage prevents the damage counters on the Bench", () => {
    const { s, p2 } = scenario({
      p1: { active: { def: card("Dragapult ex"), energy: [fire, psy] }, hand: [card("Battle Cage")] },
      p2: { active: dummy, bench: [small] },
    });
    const st = attack(play(s, "p1", { type: "playTrainer", card: handOf(s, "p1", card("Battle Cage"))[0] as string }), 1);
    expect(st.pokemon[p2.bench[0] as string]?.damage).toBe(0);
  });

  it("Dusknoir Cursed Blast: 13 damage counters, then Dusknoir is Knocked Out (the opponent takes a Prize)", () => {
    const { s, p1, p2 } = scenario({ p1: { active: dummy, bench: [card("Dusknoir")] }, p2: { active: dummy, bench: [small] } });
    let st = play(s, "p1", { type: "useAbility", pokemon: p1.bench[0] as string, ability: 0 });
    st = answer(st, [p2.active as string]);
    expect(st.pokemon[p2.active as string]?.damage).toBe(130);
    expect(st.pokemon[p1.bench[0] as string]).toBeUndefined();
    expect(st.players.p2?.prizes).toHaveLength(5);
  });

  it("Psyduck's Damp turns off Cursed Blast", () => {
    const psyduck = Object.values(CARDS).find(
      (d) => d.name === "Psyduck" && d.standard && d.implemented && d.abilities?.some((a) => a.name === "Damp"),
    );
    if (!psyduck) throw new Error("no Psyduck with Damp");
    const { s, p1 } = scenario({ p1: { active: dummy, bench: [card("Dusknoir")] }, p2: { active: psyduck } });
    expect(legalActions(s, "p1").some((o) => o.type === "useAbility" && o.pokemon === p1.bench[0])).toBe(false);
  });

  it("Festival Lead: with Festival Grounds, Dipplin attacks twice", () => {
    const { s, p2 } = scenario({
      p1: { active: { def: card("Dipplin"), energy: [grass] }, bench: [small, small], hand: [card("Festival Grounds")] },
      p2: { active: dummy },
    });
    let st = play(s, "p1", { type: "playTrainer", card: handOf(s, "p1", card("Festival Grounds"))[0] as string });
    st = attack(st, 0);
    expect(st.pokemon[p2.active as string]?.damage).toBe(40);
    expect(st.turn.active).toBe("p1");
    expect(legalActions(st, "p1").map((o) => o.type)).toEqual(["attack", "endTurn"]);
    st = attack(st, 0);
    expect(st.pokemon[p2.active as string]?.damage).toBe(80);
    expect(st.turn.active).toBe("p2");
  });

  it("Meganium's Wild Growth: each Basic {G} Energy provides {G}{G} (Hydrapple ex's Syrup Storm counts them)", () => {
    const { s, p2 } = scenario({
      p1: { active: { def: card("Hydrapple ex"), energy: [grass, grass] }, bench: [card("Meganium")] },
      p2: { active: dummy },
    });
    // 2 Basic {G} Energy provide 4 {G} Energy: 30 + 4 × 30.
    expect(attack(s, 0).pokemon[p2.active as string]?.damage).toBe(150);
  });

  it("Lillie's Clefairy ex's Fairy Zone: the opponent's {N} Pokémon are weak to {P}", () => {
    const dragon = pokemon({ name: "Dragonish", hp: 300, types: ["N"] });
    const hitter = pokemon({ types: ["P"], attacks: [{ cost: [], damage: 50 }] });
    const { s, p2 } = scenario({ p1: { active: hitter, bench: [card("Lillie's Clefairy ex")] }, p2: { active: dragon } });
    expect(attack(s, 0).pokemon[p2.active as string]?.damage).toBe(100);
  });

  it("Mew ex's Memory Helix: it can use the attacks of the Benched Pokémon", () => {
    const { s, p2 } = scenario({
      p1: { active: { def: card("Mew ex"), energy: [fire, fire] }, bench: [{ def: card("Dragapult ex") }] },
      p2: { active: dummy },
    });
    const attacks = legalActions(s, "p1").filter((o) => o.type === "attack");
    expect(attacks.map((o) => (o.type === "attack" ? o.name : ""))).toContain("Jet Headbutt");
    const jet = attacks.find((o) => o.type === "attack" && o.name === "Jet Headbutt");
    if (jet?.type !== "attack") throw new Error("no Jet Headbutt");
    const st = play(s, "p1", { type: "attack", index: jet.index, ...(jet.source ? { source: jet.source } : {}) });
    expect(st.pokemon[p2.active as string]?.damage).toBe(70);
  });

  it("N's Zoroark ex's Night Joker uses an attack of a Benched N's Pokémon", () => {
    const { s, p2 } = scenario({
      p1: { active: { def: card("N's Zoroark ex"), energy: [dark, dark] }, bench: [card("N's Zekrom")] },
      p2: { active: dummy },
    });
    let st = attack(s, 0);
    const req = st.pending?.kind === "choice" ? st.pending.request : null;
    expect(req?.attacks).toBeDefined();
    const shred = Object.entries(req?.attacks ?? {}).find(([, a]) => CARDS[a.defId]?.attacks?.[a.index]?.name === "Shred")?.[0];
    st = answer(st, [shred as string]);
    expect(st.pokemon[p2.active as string]?.damage).toBe(70);
  });

  it("Slowking's Seek Inspiration discards the top card and uses one of its attacks (no Rule Box)", () => {
    const { s, p2 } = scenario({
      p1: { active: { def: card("Slowking"), energy: [psy, psy] }, deck: [card("Seaking"), dummy] },
      p2: { active: dummy },
    });
    let st = attack(s, 0);
    st = suggested(st);
    // Seaking's Rapid Draw: 60 damage, draw 2 cards.
    expect(st.pokemon[p2.active as string]?.damage).toBe(60);
    expect(st.players.p1?.discard.some((c) => st.objects[c]?.defId === card("Seaking").id)).toBe(true);
  });

  it("Mega Lopunny ex's Gale Thrust: 170 more damage if it moved from the Bench to the Active Spot this turn", () => {
    const lopunny = card("Mega Lopunny ex");
    const free = pokemon({ hp: 100, retreat: 0 });
    const { s, p1, p2 } = scenario({ p1: { active: free, bench: [{ def: lopunny, energy: [psy] }] }, p2: { active: dummy } });
    const st = attack(play(s, "p1", { type: "retreat", to: p1.bench[0] as string, discard: [] }), 0);
    expect(st.pokemon[p2.active as string]?.damage).toBe(230);
  });

  it("Budew's Itchy Pollen: the opponent cannot play Items during their next turn", () => {
    const ball = card("Ultra Ball");
    const { s } = scenario({ p1: { active: card("Budew") }, p2: { active: dummy, hand: [ball, small, small] } });
    const st = attack(s, 0);
    expect(st.turn.active).toBe("p2");
    expect(legalActions(st, "p2").some((o) => o.type === "playTrainer")).toBe(false);
  });

  it("Raging Bolt ex's Bellowing Thunder: 70 damage for each Basic Energy discarded from your Pokémon", () => {
    const bolt = card("Raging Bolt ex");
    const light = E("Lightning");
    const fight = E("Fighting");
    const { s, p1, p2 } = scenario({
      p1: { active: { def: bolt, energy: [light, fight] }, bench: [{ def: small, energy: [fire] }] },
      p2: { active: dummy },
    });
    let st = attack(s, 1);
    const all = [...(st.pokemon[p1.active as string]?.energy ?? []), ...(st.pokemon[p1.bench[0] as string]?.energy ?? [])];
    st = answer(st, all);
    expect(st.pokemon[p2.active as string]?.damage).toBe(210);
  });

  it("Iron Leaves ex: played onto the Bench, it may switch with the Active Pokémon and take Energy", () => {
    const leaves = card("Iron Leaves ex");
    const { s, p1 } = scenario({ p1: { active: { def: dummy, energy: [grass, grass] }, hand: [leaves] }, p2: { active: dummy } });
    let st = play(s, "p1", { type: "playBasic", card: handOf(s, "p1", leaves)[0] as string });
    st = answer(st, [1]);
    const id = st.players.p1?.active as string;
    expect(id).not.toBe(p1.active);
    st = answer(st, st.pokemon[p1.active as string]?.energy ?? []);
    expect(st.pokemon[id]?.energy).toHaveLength(2);
  });

  it("Rare Candy: a Basic Pokémon evolves into its Stage 2, skipping the Stage 1", () => {
    const abra = card("Abra");
    const alakazam = card("Alakazam");
    const { s, p1 } = scenario({ p1: { active: abra, hand: [card("Rare Candy"), alakazam] }, p2: { active: dummy } });
    let st = play(s, "p1", { type: "playTrainer", card: handOf(s, "p1", card("Rare Candy"))[0] as string });
    st = suggested(st);
    expect(st.objects[st.pokemon[p1.active as string]?.cards.at(-1) as string]?.defId).toBe(alakazam.id);
  });

  it("Boomerang Energy discarded by its Pokémon's attack comes back after the attack", () => {
    const boomerang = card("Boomerang Energy");
    const swinger = pokemon({
      attacks: [{ cost: [], damage: 10, effects: [{ op: "mainDamage" }, { op: "discardEnergy", from: "self", n: "all" }] }],
    });
    const { s, p1 } = scenario({ p1: { active: { def: swinger, energy: [boomerang, fire] } }, p2: { active: dummy } });
    const st = attack(s, 0);
    const left = st.pokemon[p1.active as string]?.energy.map((c) => st.objects[c]?.defId);
    expect(left).toEqual([boomerang.id]);
  });

  it("Area Zero Underdepths: 8 Benched Pokémon with a Tera Pokémon in play", () => {
    const tera = card("Teal Mask Ogerpon ex");
    const { s } = scenario({
      p1: { active: tera, bench: [small, small, small, small, small], hand: [card("Area Zero Underdepths"), small] },
      p2: { active: dummy },
    });
    expect(legalActions(s, "p1").some((o) => o.type === "playBasic")).toBe(false);
    const st = play(s, "p1", { type: "playTrainer", card: handOf(s, "p1", card("Area Zero Underdepths"))[0] as string });
    expect(legalActions(st, "p1").some((o) => o.type === "playBasic")).toBe(true);
  });

  it("Risky Ruins: a Basic non-{D} Pokémon put onto the Bench gets 2 damage counters", () => {
    const { s } = scenario({ p1: { active: dummy, hand: [card("Risky Ruins"), small] }, p2: { active: dummy } });
    let st = play(s, "p1", { type: "playTrainer", card: handOf(s, "p1", card("Risky Ruins"))[0] as string });
    st = play(st, "p1", { type: "playBasic", card: handOf(st, "p1", small)[0] as string });
    const benched = st.players.p1?.bench[0] as string;
    expect(st.pokemon[benched]?.damage).toBe(20);
  });

  it("Telepathic Psychic Energy attached to a {P} Pokémon puts up to 2 Basic {P} Pokémon onto the Bench", () => {
    const tele = card("Telepathic Psychic Energy");
    const abra = card("Abra");
    const { s, p1 } = scenario({ p1: { active: abra, hand: [tele], deck: [abra, abra, dummy] }, p2: { active: dummy } });
    let st = play(s, "p1", { type: "attachEnergy", card: handOf(s, "p1", tele)[0] as string, target: p1.active as string });
    st = suggested(st);
    expect(st.players.p1?.bench).toHaveLength(2);
  });

  it("Briar: a Knock Out by a Tera Pokémon's attack takes 1 more Prize card", () => {
    const tera = card("Teal Mask Ogerpon ex");
    const { s } = scenario({
      p1: { active: { def: tera, energy: [grass, grass, grass] }, hand: [card("Briar")] },
      p2: { active: small, bench: [dummy], prizes: 2 },
    });
    const st = attack(play(s, "p1", { type: "playTrainer", card: handOf(s, "p1", card("Briar"))[0] as string }), 0);
    expect(st.players.p1?.prizes).toHaveLength(4);
  });
});
