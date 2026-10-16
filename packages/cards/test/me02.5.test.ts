/**
 * me02.5 (PLAN-B B7): the cards finishing the set (and the earlier cards it reprints), checked against the printed text
 * with the engine's scenario helpers.
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
  for (let i = 0; i < 10 && st.pending?.kind === "choice"; i++) st = answer(st, st.pending.request.suggested);
  return st;
};

describe("PLAN-B B7: me02.5", () => {
  it("Togedemaru ex Spiky Rolling: 80 more damage if it used Spiky Rolling during its owner's last turn", () => {
    const toge = card("Togedemaru ex");
    const M = E("Metal");
    const { s, p1, p2 } = scenario({
      p1: { active: { def: toge, energy: [M, M] } },
      p2: { active: pokemon({ name: "Wall", hp: 900 }) },
    });
    let st = use(s, "Spiky Rolling");
    expect(st.pokemon[p2.active as string]?.damage).toBe(80);
    st = play(st, "p2", { type: "endTurn" });
    st = use(settle(st), "Spiky Rolling");
    expect(st.pokemon[p2.active as string]?.damage).toBe(80 + 160);
    expect(st.pokemon[p1.active as string]).toBeDefined();
  });

  it("Pecharunt Mochi Rush: the next turn, only Mochi Rush does 50 more damage", () => {
    const { s, p2 } = scenario({
      p1: { active: { def: card("Pecharunt", "Mochi Rush"), energy: [E("Darkness")] } },
      p2: { active: pokemon({ hp: 900 }) },
    });
    let st = use(s, "Mochi Rush");
    st = settle(play(st, "p2", { type: "endTurn" }));
    st = use(st, "Mochi Rush");
    expect(st.pokemon[p2.active as string]?.damage).toBe(20 + 70);
  });

  it("Okidogi Settle the Score: 60 more damage for each Prize card the opponent took during their last turn", () => {
    const okidogi = card("Okidogi", "Settle the Score");
    const F = E("Fighting");
    const { s, p2 } = scenario({ p1: { active: { def: okidogi, energy: [F, F, F] } }, p2: { active: pokemon({ hp: 900 }) } });
    s.turnLog.push({ turn: s.turn.number - 1, player: "p2", kind: "prizesTaken", amount: 2 });
    expect(use(s, "Settle the Score").pokemon[p2.active as string]?.damage).toBe(80 + 120);
  });

  it("Team Rocket's Dugtrio Holes: 2 damage counters on the opponent's Active Pokémon that retreats during their turn", () => {
    const { s, p2 } = scenario({
      active: "p2",
      p1: { active: dummy, bench: [card("Team Rocket's Dugtrio", "Holes")] },
      p2: { active: { def: pokemon({ name: "Runner", hp: 100, retreat: 0 }) }, bench: [dummy] },
    });
    const runner = p2.active as string;
    const st = settle(play(s, "p2", { type: "retreat", to: p2.bench[0] as string, discard: [] }));
    expect(st.pokemon[runner]?.damage).toBe(20);
  });

  it("Jamming Tower: Pokémon Tools have no effect", () => {
    const tower = card("Jamming Tower");
    const belt = card("Light Ball");
    const ex = pokemon({ name: "Target ex", hp: 400, tags: ["ex", "ruleBox"] });
    const pika = card("Pikachu ex", "Resolute Heart");
    const { s } = scenario({
      p1: { active: { def: pika, tools: [belt], energy: [E("Grass"), E("Lightning"), E("Metal")] }, hand: [tower] },
      p2: { active: ex },
    });
    const before = options(s).find((o) => o.type === "attack");
    const st = play(s, "p1", { type: "playTrainer", card: handOf(s, "p1", tower)[0] as string });
    const after = options(st).find((o) => o.type === "attack");
    expect(
      before?.type === "attack" && after?.type === "attack" && (before.preview?.damage ?? 0) - (after.preview?.damage ?? 0),
    ).toBe(50);
  });

  it("Togekiss Wonder Kiss: on heads, 1 more Prize card when the opponent's Active Pokémon is Knocked Out", () => {
    const togekiss = card("Togekiss", "Wonder Kiss");
    const hitter = pokemon({ name: "Hitter", hp: 300, attacks: [{ cost: [], damage: 400 }] });
    const taken = new Set<number>();
    for (let seed = 1; seed <= 10; seed++) {
      const { s } = scenario({ seed, p1: { active: hitter, bench: [togekiss] }, p2: { active: dummy, bench: [dummy] } });
      const st = play(s, "p1", { type: "attack", index: 0 });
      taken.add(6 - (st.players.p1?.prizes.length ?? 0));
    }
    expect([...taken].sort()).toEqual([1, 2]);
  });

  it("Mega Gengar ex Shadowy Concealment: a {D} Pokémon Knocked Out by a Pokémon ex gives 1 fewer Prize card", () => {
    const gengar = card("Mega Gengar ex");
    const darkEx = pokemon({ name: "Dark ex", hp: 100, types: ["D"], tags: ["ex", "ruleBox"] });
    const exHitter = pokemon({ name: "Hitter ex", hp: 300, tags: ["ex", "ruleBox"], attacks: [{ cost: [], damage: 400 }] });
    const plainHitter = pokemon({ name: "Hitter", hp: 300, attacks: [{ cost: [], damage: 400 }] });
    const a = scenario({ p1: { active: exHitter }, p2: { active: darkEx, bench: [gengar] } });
    expect(settle(play(a.s, "p1", { type: "attack", index: 0 })).players.p1?.prizes).toHaveLength(5);
    const b = scenario({ p1: { active: plainHitter }, p2: { active: darkEx, bench: [gengar] } });
    expect(settle(play(b.s, "p1", { type: "attack", index: 0 })).players.p1?.prizes).toHaveLength(4);
  });

  it("Thick Scale: the {N} Pokémon takes 50 less damage from {G}, {R}, {W} or {L} Pokémon only", () => {
    const scale = card("Thick Scale");
    const dragon = pokemon({ name: "Dragon", hp: 300, types: ["N"] });
    const fire = scenario({
      p1: { active: pokemon({ hp: 300, types: ["R"], attacks: [{ cost: [], damage: 100 }] }) },
      p2: { active: { def: dragon, tools: [scale] } },
    });
    expect(play(fire.s, "p1", { type: "attack", index: 0 }).pokemon[fire.p2.active as string]?.damage).toBe(50);
    const psy = scenario({
      p1: { active: pokemon({ hp: 300, types: ["P"], attacks: [{ cost: [], damage: 100 }] }) },
      p2: { active: { def: dragon, tools: [scale] } },
    });
    expect(play(psy.s, "p1", { type: "attack", index: 0 }).pokemon[psy.p2.active as string]?.damage).toBe(100);
    expect(chars(psy.s, psy.p2.active as string).types).toEqual(["N"]);
  });
});
