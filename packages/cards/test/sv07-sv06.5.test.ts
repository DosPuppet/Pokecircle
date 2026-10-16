/**
 * sv07 and sv06.5 (Stellar Crown, Shrouded Fable; PLAN-B B13): the Standard cards finishing both sets, checked against
 * the printed text with the engine's scenario helpers.
 */
import { type CardDef, type GameState, legalActions } from "@pokecircle/engine";
import { describe, expect, it } from "vitest";
import { answer, handOf, play, pokemon, scenario, trainer } from "../../engine/test/helpers";
import { CARDS } from "../src/index";

const card = (name: string, part?: string): CardDef => {
  const d = Object.values(CARDS).find(
    (x) =>
      x.name === name &&
      x.standard &&
      x.implemented &&
      (!part || x.attacks?.some((a) => a.name === part) || x.abilities?.some((a) => a.name === part)),
  );
  if (!d) throw new Error(`no card ${name} ${part ?? ""}`);
  return d;
};
const E = (t: string) => card(`Basic ${t} Energy`);
const dummy = pokemon({ name: "Dummy", hp: 300 });
const options = (s: GameState, p: "p1" | "p2" = "p1") => legalActions(s, p);
const use = (s: GameState, name: string) => {
  const o = options(s).find((x) => x.type === "attack" && x.name === name);
  if (o?.type !== "attack") throw new Error(`${name} is not usable`);
  return play(s, "p1", { type: "attack", index: o.index, ...(o.source ? { source: o.source } : {}) });
};
const settle = (s: GameState) => {
  let st = s;
  for (let i = 0; i < 12 && st.pending?.kind === "choice"; i++) st = answer(st, st.pending.request.suggested);
  return st;
};
const defIds = (s: GameState, ids: string[]) => ids.map((c) => s.objects[c]?.defId);

describe("PLAN-B B13: sv07 + sv06.5", () => {
  it("Klinklang Emergency Rotation: onto the Bench from the hand only while the opponent has a Stage 2 Pokémon", () => {
    const klink = card("Klinklang", "Emergency Rotation");
    const stage2 = pokemon({ name: "Big Evo", hp: 200, stage: "stage2", evolvesFrom: "Mid" });
    const benchable = (s: GameState) => options(s).some((o) => o.type === "playBasic" && s.objects[o.card]?.defId === klink.id);
    expect(benchable(scenario({ p1: { active: dummy, hand: [klink] }, p2: { active: dummy } }).s)).toBe(false);
    const { s } = scenario({ p1: { active: dummy, hand: [klink] }, p2: { active: stage2 } });
    expect(benchable(s)).toBe(true);
    const st = play(s, "p1", { type: "playBasic", card: handOf(s, "p1", klink)[0] as string });
    expect(st.players.p1?.bench).toHaveLength(1);
  });

  it("Rhyperior Wide Wall: while it is Active, the opponent's Supporters do nothing to its side's Pokémon", () => {
    const rhyperior = card("Rhyperior", "Wide Wall");
    const hit = trainer("supporter", [{ op: "counters", to: "oppActive", n: 3 }], {}, "Counter Supporter");
    const active = scenario({ active: "p2", p1: { active: rhyperior }, p2: { active: dummy, hand: [hit] } });
    let st = settle(play(active.s, "p2", { type: "playTrainer", card: handOf(active.s, "p2", hit)[0] as string }));
    expect(st.pokemon[active.p1.active as string]?.damage).toBe(0);
    const benched = scenario({ active: "p2", p1: { active: dummy, bench: [rhyperior] }, p2: { active: dummy, hand: [hit] } });
    st = settle(play(benched.s, "p2", { type: "playTrainer", card: handOf(benched.s, "p2", hit)[0] as string }));
    expect(st.pokemon[benched.p1.active as string]?.damage).toBe(30);
  });

  it("Lanturn Disorienting Flash: Confused with 8 damage counters instead of 3", () => {
    const lanturn = card("Lanturn", "Disorienting Flash");
    const L = E("Lightning");
    const { s, p2 } = scenario({ p1: { active: { def: lanturn, energy: [L, L] } }, p2: { active: dummy } });
    const st = settle(use(s, "Disorienting Flash"));
    const target = st.pokemon[p2.active as string];
    expect(target?.cond.rotating).toBe("confused");
    expect(target?.cond.confusion).toBe(8);
  });

  it("Grand Tree: a Stage 1 from the deck onto a Basic Pokémon, then a Stage 2 onto it", () => {
    const tree = card("Grand Tree");
    const basic = pokemon({ name: "Seedling", hp: 60 });
    const mid = pokemon({ name: "Sprout", hp: 90, stage: "stage1", evolvesFrom: "Seedling" });
    const top = pokemon({ name: "Bloom", hp: 160, stage: "stage2", evolvesFrom: "Sprout" });
    const { s, p1 } = scenario({ turn: 3, p1: { active: basic, hand: [tree], deck: [mid, top, dummy] }, p2: { active: dummy } });
    let st = play(s, "p1", { type: "playTrainer", card: handOf(s, "p1", tree)[0] as string });
    st = settle(play(st, "p1", { type: "stadiumAction" }));
    const stack = st.pokemon[p1.active as string]?.cards ?? [];
    expect(defIds(st, stack)).toContain(top.id);
    expect(defIds(st, stack)).toContain(mid.id);
  });

  it("Kofu: 2 cards from the hand to the bottom of the deck, then draw 4", () => {
    const kofu = card("Kofu");
    const { s } = scenario({
      p1: { active: dummy, hand: [kofu, dummy, dummy], deck: [dummy, dummy, dummy, dummy, dummy] },
      p2: { active: dummy },
    });
    const st = settle(play(s, "p1", { type: "playTrainer", card: handOf(s, "p1", kofu)[0] as string }));
    expect(st.players.p1?.hand).toHaveLength(4);
    expect(st.players.p1?.deck).toHaveLength(3);
    const alone = scenario({ p1: { active: dummy, hand: [kofu, dummy] }, p2: { active: dummy } });
    expect(options(alone.s).some((o) => o.type === "playTrainer")).toBe(false);
  });

  it("Deluxe Bomb: the Active holder damaged by an attack puts 12 damage counters on the attacker, then is discarded", () => {
    const bomb = card("Deluxe Bomb");
    const attacker = pokemon({ name: "Attacker", hp: 300, attacks: [{ name: "Hit", cost: [], damage: 10 }] });
    const { s, p1 } = scenario({ active: "p2", p1: { active: { def: dummy, tools: [bomb] } }, p2: { active: attacker } });
    const st = settle(play(s, "p2", { type: "attack", index: 0 }));
    expect(st.pokemon[st.players.p2?.active as string]?.damage).toBe(120);
    expect(st.pokemon[p1.active as string]?.tools ?? []).toHaveLength(0);
    expect(defIds(st, st.players.p1?.discard ?? [])).toContain(bomb.id);
  });

  it("Hypno Daydream: attaching an Energy from the hand to the Defending Pokémon ends the opponent's turn", () => {
    const hypno = card("Hypno", "Daydream");
    const P = E("Psychic");
    const { s } = scenario({
      p1: { active: { def: hypno, energy: [P, P] } },
      p2: { active: dummy, hand: [P], deck: [dummy, dummy] },
    });
    let st = settle(use(s, "Daydream"));
    st = settle(st);
    expect(st.turn.active).toBe("p2");
    const energyCard = handOf(st, "p2", P)[0] as string;
    st = settle(play(st, "p2", { type: "attachEnergy", card: energyCard, target: st.players.p2?.active as string }));
    expect(st.turn.active).toBe("p1");
  });

  it("Alcremie Colorful Confection: Pokémon of the types of its Basic Energy", () => {
    const alcremie = card("Alcremie", "Colorful Confection");
    const fire = pokemon({ name: "Fire Mon", types: ["R"] });
    const water = pokemon({ name: "Water Mon", types: ["W"] });
    const grass = pokemon({ name: "Grass Mon", types: ["G"] });
    const { s } = scenario({
      p1: { active: { def: alcremie, energy: [E("Fire"), E("Water")] }, deck: [fire, water, grass] },
      p2: { active: dummy },
    });
    const st = settle(use(s, "Colorful Confection"));
    const hand = defIds(st, st.players.p1?.hand ?? []);
    expect(hand).toContain(fire.id);
    expect(hand).toContain(water.id);
    expect(hand).not.toContain(grass.id);
  });
});
