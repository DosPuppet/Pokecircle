/**
 * me02 and me01 (PLAN-B B8): the cards finishing both sets, checked against the printed text with the engine's scenario
 * helpers.
 */
import { type CardDef, chars, type GameState, legalActions, placeSetup } from "@pokecircle/engine";
import { describe, expect, it } from "vitest";
import { answer, handOf, play, pokemon, scenario } from "../../engine/test/helpers";
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
  return play(s, "p1", { type: "attack", index: o.index });
};
const usable = (s: GameState, name: string) => options(s).some((o) => o.type === "attack" && o.name === name);

describe("PLAN-B B8: me02 and me01", () => {
  it("Crawdaunt Cutting Riposte: can be used for {D} once it has damage counters on it", () => {
    const crawdaunt = card("Crawdaunt", "Cutting Riposte");
    const fresh = scenario({ p1: { active: { def: crawdaunt, energy: [E("Darkness")] } }, p2: { active: dummy } });
    expect(usable(fresh.s, "Cutting Riposte")).toBe(false);
    const hurt = scenario({ p1: { active: { def: crawdaunt, energy: [E("Darkness")], damage: 10 } }, p2: { active: dummy } });
    expect(usable(hurt.s, "Cutting Riposte")).toBe(true);
  });

  it("Inteleon Bring Down: the Pokémon with the least HP remaining (not itself) is Knocked Out", () => {
    const inteleon = card("Inteleon", "Bring Down");
    const { s, p1, p2 } = scenario({
      p1: { active: { def: inteleon, energy: [E("Water")] }, bench: [{ def: dummy, damage: 200 }] },
      p2: { active: { def: dummy, damage: 250 }, bench: [dummy] },
    });
    const st = use(s, "Bring Down");
    expect(st.pokemon[p2.active as string]).toBeUndefined();
    expect(st.pokemon[p1.bench[0] as string]).toBeDefined();
  });

  it("Pachirisu Electrified Incisors: 8 damage counters on the Defending Pokémon when Energy is attached to it", () => {
    const { s, p2 } = scenario({
      p1: { active: { def: card("Pachirisu", "Electrified Incisors"), energy: [E("Lightning")] } },
      p2: { active: dummy, hand: [E("Grass")] },
    });
    let st = use(s, "Electrified Incisors");
    const before = st.pokemon[p2.active as string]?.damage ?? 0;
    st = play(st, "p2", { type: "attachEnergy", card: handOf(st, "p2", E("Grass"))[0] as string, target: p2.active as string });
    expect(st.pokemon[p2.active as string]?.damage).toBe(before + 80);
  });

  it("Shedinja Fragile Husk: Knocked Out by a Pokémon ex, no Prize card is taken", () => {
    const shedinja = card("Shedinja", "Fragile Husk");
    const ex = pokemon({ name: "Hitter ex", hp: 300, tags: ["ex", "ruleBox"], attacks: [{ cost: [], damage: 300 }] });
    const { s } = scenario({ p1: { active: ex }, p2: { active: shedinja, bench: [dummy] } });
    expect(play(s, "p1", { type: "attack", index: 0 }).players.p1?.prizes).toHaveLength(6);
  });

  it("Cinderace Explosiveness: it may be put in the Active Spot during setup (not on the Bench)", () => {
    const cinderace = card("Cinderace", "Explosiveness");
    const basic = pokemon({ name: "Basic", hp: 60 });
    const { s } = scenario({ p1: { active: dummy, hand: [cinderace, basic] }, p2: { active: dummy } });
    const c = handOf(s, "p1", cinderace)[0] as string;
    const b = handOf(s, "p1", basic)[0] as string;
    expect(placeSetup(structuredClone(s), "p1", b, [c])).not.toBeNull();
    expect(placeSetup(structuredClone(s), "p1", c, [b])).toBeNull();
  });

  it("Lt. Surge's Bargain: the opponent answers; yes, each player takes a Prize card; no, you draw 4 cards", () => {
    const bargain = card("Lt. Surge's Bargain");
    const { s } = scenario({ p1: { active: dummy, hand: [bargain], deck: Array(6).fill(dummy) }, p2: { active: dummy } });
    const st = play(s, "p1", { type: "playTrainer", card: handOf(s, "p1", bargain)[0] as string });
    expect(st.pending?.kind === "choice" && st.pending.player).toBe("p2");
    const yes = answer(st, [1]);
    expect(yes.players.p1?.prizes).toHaveLength(5);
    expect(yes.players.p2?.prizes).toHaveLength(5);
    const no = answer(st, [0]);
    expect(no.players.p1?.hand).toHaveLength(4);
  });

  it("Dizzying Valley: a Confused Pokémon stays Confused when it evolves", () => {
    const valley = card("Dizzying Valley");
    const base = pokemon({ name: "Base", hp: 60 });
    const evo = pokemon({ name: "Evo", hp: 120, stage: "stage1", evolvesFrom: "Base" });
    const { s, p1 } = scenario({
      turn: 3,
      p1: { active: { def: base, entered: 1, cond: { rotating: "confused" } }, hand: [valley, evo] },
      p2: { active: dummy },
    });
    let st = play(s, "p1", { type: "playTrainer", card: handOf(s, "p1", valley)[0] as string });
    st = play(st, "p1", { type: "evolve", card: handOf(st, "p1", evo)[0] as string, target: p1.active as string });
    expect(st.pokemon[p1.active as string]?.cond.rotating).toBe("confused");
    expect(chars(st, p1.active as string).name).toBe("Evo");
  });

  it("Linoone Excited Dash: this Benched Pokémon becomes the Active Pokémon", () => {
    const linoone = card("Linoone", "Excited Dash");
    const mega = pokemon({ name: "Mega Something ex", hp: 300, tags: ["mega", "ex", "ruleBox"] });
    const { s, p1 } = scenario({ p1: { active: mega, bench: [dummy, linoone] }, p2: { active: dummy } });
    const lin = p1.bench[1] as string;
    const o = options(s).find((x) => x.type === "useAbility" && x.pokemon === lin);
    expect(o).toBeDefined();
    let st = play(s, "p1", { type: "useAbility", pokemon: lin, ability: 0 });
    if (st.pending?.kind === "choice") st = answer(st, st.pending.request.suggested);
    expect(st.players.p1?.active).toBe(lin);
  });
});
