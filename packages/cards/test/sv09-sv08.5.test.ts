/**
 * sv09 and sv08.5 (Journey Together, Prismatic Evolutions; PLAN-B B11): the Standard cards finishing both sets, checked
 * against the printed text with the engine's scenario helpers.
 */
import { type CardDef, chars, type GameState, legalActions } from "@pokecircle/engine";
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

describe("PLAN-B B11: sv09 and sv08.5", () => {
  it("Eevee ex Rainbow DNA: it evolves into a Pokémon ex that evolves from Eevee", () => {
    const eevee = card("Eevee ex");
    const espeon = card("Espeon ex");
    const plain = pokemon({ name: "Not ex", hp: 100, stage: "stage1", evolvesFrom: "Eevee" });
    const { s, p1 } = scenario({
      turn: 3,
      p1: { active: { def: eevee, entered: 1 }, hand: [espeon, plain] },
      p2: { active: dummy },
    });
    const targets = options(s).flatMap((o) => (o.type === "evolve" ? [[s.objects[o.card]?.defId, o.targets]] : []));
    expect(targets).toEqual([[espeon.id, [p1.active]]]);
  });

  it("Walking Wake ex Azure Seas: its attacks are not affected by effects on the opponent's Active Pokémon", () => {
    const wake = card("Walking Wake ex");
    const W = E("Water");
    const shielded = pokemon({
      name: "Shielded",
      hp: 300,
      abilities: [{ name: "Wall", text: "…", statics: [{ s: "taken", scope: { side: "me", self: true }, add: -100 }] }],
    });
    const { s, p2 } = scenario({ p1: { active: { def: wake, energy: [W, W, W] } }, p2: { active: shielded } });
    expect(use(s, "Catharsis Roar").pokemon[p2.active as string]?.damage).toBe(120);
  });

  it("Bloodmoon Ursaluna ex Seasoned Skill: Blood Moon costs {C} less for each Prize card the opponent has taken", () => {
    const ursaluna = card("Bloodmoon Ursaluna ex");
    const C = E("Fighting");
    const { s } = scenario({ p1: { active: { def: ursaluna, energy: [C, C] } }, p2: { active: dummy, prizes: 3 } });
    expect(options(s).some((o) => o.type === "attack" && o.name === "Blood Moon")).toBe(false);
    (s.players.p2 as { prizesTaken: number }).prizesTaken = 3;
    s.version++;
    expect(options(s).some((o) => o.type === "attack" && o.name === "Blood Moon")).toBe(true);
  });

  it("Maractus Exploding Needles: Knocked Out in the Active Spot, 6 damage counters on the Attacking Pokémon", () => {
    const maractus = card("Maractus", "Exploding Needles");
    const { s, p1 } = scenario({
      p1: { active: pokemon({ name: "Hitter", hp: 300, attacks: [{ cost: [], damage: 300 }] }) },
      p2: { active: maractus, bench: [dummy] },
    });
    expect(settle(play(s, "p1", { type: "attack", index: 0 })).pokemon[p1.active as string]?.damage).toBe(60);
  });

  it("Magearna Auto Heal: in the Active Spot, attaching an Energy from the hand heals 90 damage from that Pokémon", () => {
    const { s, p1 } = scenario({
      p1: { active: card("Magearna", "Auto Heal"), bench: [{ def: dummy, damage: 100 }], hand: [E("Metal")] },
      p2: { active: dummy },
    });
    const st = play(s, "p1", {
      type: "attachEnergy",
      card: handOf(s, "p1", E("Metal"))[0] as string,
      target: p1.bench[0] as string,
    });
    expect(st.pokemon[p1.bench[0] as string]?.damage).toBe(10);
  });

  it("N's Sigilyph Victory Symbol: with exactly 1 Prize card left, the attacker wins", () => {
    const sig = card("N's Sigilyph", "Victory Symbol");
    const P = E("Psychic");
    const { s } = scenario({ p1: { active: { def: sig, energy: [P, P, P] }, prizes: 1 }, p2: { active: dummy } });
    const st = use(s, "Victory Symbol");
    expect(st.winner).toBe("p1");
    expect(st.endReason).toBe("effect");
  });

  it("Palafin ex Hero's Spirit: it can't be played from the hand", () => {
    const palafinEx = card("Palafin ex");
    const finizen = pokemon({ name: palafinEx.evolvesFrom ?? "Finizen", hp: 60 });
    const { s } = scenario({ turn: 3, p1: { active: { def: finizen, entered: 1 }, hand: [palafinEx] }, p2: { active: dummy } });
    expect(options(s).some((o) => o.type === "evolve")).toBe(false);
  });

  it("Rescue Board: {C} less Retreat Cost, and none with 30 HP or less remaining", () => {
    const board = card("Rescue Board");
    const heavy = pokemon({ name: "Heavy", hp: 100, retreat: 3 });
    const fresh = scenario({ p1: { active: { def: heavy, tools: [board] } }, p2: { active: dummy } });
    expect(chars(fresh.s, fresh.p1.active as string).retreat).toBe(2);
    const hurt = scenario({ p1: { active: { def: heavy, tools: [board], damage: 70 } }, p2: { active: dummy } });
    expect(chars(hurt.s, hurt.p1.active as string).retreat).toBe(0);
  });
});
