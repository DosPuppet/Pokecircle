/**
 * sv10 (Destined Rivals; PLAN-B B10): the cards finishing the set, checked against the printed text with the engine's
 * scenario helpers.
 */
import { type CardDef, type GameState, legalActions } from "@pokecircle/engine";
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
const settle = (s: GameState) => {
  let st = s;
  for (let i = 0; i < 12 && st.pending?.kind === "choice"; i++) st = answer(st, st.pending.request.suggested);
  return st;
};

describe("PLAN-B B10: sv10", () => {
  it("Huntail Diver's Catch: a {W} Pokémon Knocked Out by an attack, its Basic {W} Energy go to the hand", () => {
    const W = E("Water");
    const water = pokemon({ name: "Water Mon", hp: 60, types: ["W"] });
    const hitter = pokemon({ name: "Hitter", hp: 300, attacks: [{ cost: [], damage: 100 }] });
    const { s } = scenario({
      p1: { active: hitter },
      p2: { active: { def: water, energy: [W, W] }, bench: [card("Huntail", "Diver's Catch")] },
    });
    let st = play(s, "p1", { type: "attack", index: 0 });
    for (let i = 0; i < 6 && st.pending?.kind === "choice"; i++)
      st = answer(st, st.pending.request.type === "yesNo" ? [1] : st.pending.request.suggested);
    expect(st.players.p2?.hand.filter((c) => st.objects[c]?.defId === W.id)).toHaveLength(2);
  });

  it("Team Rocket's Arbok Potent Glare: no Pokémon with an Ability from the hand, except Team Rocket's Pokémon", () => {
    const withAbility = pokemon({ name: "Able", hp: 60, abilities: [{ name: "Something", text: "…", statics: [] }] });
    const plain = pokemon({ name: "Plain", hp: 60 });
    const { s } = scenario({
      p1: { active: card("Team Rocket's Arbok", "Potent Glare") },
      p2: { active: dummy, hand: [withAbility, plain] },
    });
    const st = settle(play(s, "p1", { type: "endTurn" }));
    const basics = options(st, "p2").flatMap((o) => (o.type === "playBasic" ? [st.objects[o.card]?.defId] : []));
    expect(basics).toEqual([plain.id]);
  });

  it("Team Rocket's Ampharos Darkest Impulse: 4 damage counters on a Pokémon the opponent evolves, not stacking", () => {
    const amph = card("Team Rocket's Ampharos", "Darkest Impulse");
    const base = pokemon({ name: "Base", hp: 60 });
    const evo = pokemon({ name: "Evo", hp: 200, stage: "stage1", evolvesFrom: "Base" });
    const { s, p2 } = scenario({
      turn: 3,
      active: "p2",
      p1: { active: amph, bench: [amph] },
      p2: { active: { def: base, entered: 1 }, hand: [evo] },
    });
    const st = settle(play(s, "p2", { type: "evolve", card: handOf(s, "p2", evo)[0] as string, target: p2.active as string }));
    expect(st.pokemon[p2.active as string]?.damage).toBe(40);
  });

  it("Zamazenta Strong Bash: during the next turn, damage counters on the attacker equal to the damage done", () => {
    const zam = card("Zamazenta", "Strong Bash");
    const M = E("Metal");
    const { s, p1, p2 } = scenario({
      p1: { active: { def: zam, energy: [M, M, M] } },
      p2: { active: pokemon({ name: "Hitter", hp: 300, attacks: [{ cost: [], damage: 60 }] }) },
    });
    let st = use(s, "Strong Bash");
    st = play(st, "p2", { type: "attack", index: 0 });
    expect(st.pokemon[p1.active as string]?.damage).toBe(60);
    expect(st.pokemon[p2.active as string]?.damage).toBe(70 + 60);
  });

  it("Misty's Psyduck Flustered Leap: the bottom card is discarded, then Psyduck goes on top of the deck", () => {
    const psyduck = card("Misty's Psyduck", "Flustered Leap");
    const { s, p1 } = scenario({
      p1: { active: dummy, bench: [{ def: psyduck, energy: [E("Water")] }], deck: [dummy, dummy] },
      p2: { active: dummy },
    });
    const st = settle(play(s, "p1", { type: "useAbility", pokemon: p1.bench[0] as string, ability: 0 }));
    expect(st.players.p1?.bench).toHaveLength(0);
    expect(st.objects[st.players.p1?.deck[0] as string]?.defId).toBe(psyduck.id);
    expect(st.players.p1?.discard).toHaveLength(2);
  });

  it("Team Rocket's Moltres ex Evil Incineration: with a Team Rocket's Energy, the opponent's Active Pokémon is discarded", () => {
    const moltres = card("Team Rocket's Moltres ex");
    const trEnergy = card("Team Rocket's Energy");
    const R = E("Fire");
    const { s, p2 } = scenario({
      p1: { active: { def: moltres, energy: [trEnergy, R, R, R] } },
      p2: { active: dummy, bench: [dummy] },
    });
    const st = settle(use(s, "Evil Incineration"));
    expect(st.pokemon[p2.active as string]).toBeUndefined();
    expect(st.players.p1?.prizes).toHaveLength(6);
  });

  it("Team Rocket's Bother-Bot: a Prize card and a random hand card are revealed and may be switched", () => {
    const bot = card("Team Rocket's Bother-Bot");
    const { s } = scenario({ p1: { active: dummy, hand: [bot] }, p2: { active: dummy, hand: [dummy] } });
    const handBefore = s.players.p2?.hand[0];
    let st = play(s, "p1", { type: "playTrainer", card: handOf(s, "p1", bot)[0] as string });
    st = answer(st, [1]);
    expect(st.players.p2?.hand).toHaveLength(1);
    expect(st.players.p2?.hand[0]).not.toBe(handBefore);
    expect(st.players.p2?.prizes).toHaveLength(6);
  });
});
