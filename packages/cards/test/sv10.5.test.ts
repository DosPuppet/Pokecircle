/**
 * sv10.5b and sv10.5w (Black Bolt, White Flare; PLAN-B B9): the cards finishing both sets, checked against the printed
 * text with the engine's scenario helpers.
 */
import { type CardDef, chars, type GameState, legalActions } from "@pokecircle/engine";
import { describe, expect, it } from "vitest";
import { answer, play, pokemon, scenario } from "../../engine/test/helpers";
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

describe("PLAN-B B9: sv10.5b and sv10.5w", () => {
  it("Reuniclus Cellular Ascension: each Benched Pokémon evolves from the deck", () => {
    const base = pokemon({ name: "Seed", hp: 60 });
    const evo = pokemon({ name: "Sprout", hp: 90, stage: "stage1", evolvesFrom: "Seed" });
    const { s, p1 } = scenario({
      turn: 3,
      p1: {
        active: { def: card("Reuniclus", "Cellular Ascension"), energy: [E("Psychic")] },
        bench: [
          { def: base, entered: 1 },
          { def: base, entered: 1 },
        ],
        deck: [evo, evo, dummy],
      },
      p2: { active: dummy },
    });
    const st = settle(use(s, "Cellular Ascension"));
    expect(p1.bench.map((id) => chars(st, id).name)).toEqual(["Sprout", "Sprout"]);
  });

  it("Meloetta ex Debut Performance: going first, it can attack during the first turn", () => {
    const meloetta = card("Meloetta ex");
    const { s } = scenario({
      turn: 1,
      first: "p1",
      p1: { active: { def: meloetta, energy: [E("Psychic")] } },
      p2: { active: dummy },
    });
    expect(options(s).some((o) => o.type === "attack" && o.name === "Echoed Voice")).toBe(true);
  });

  it("Watchog Focus Energy: during the next turn, Hyper Fang's base damage is 240", () => {
    const watchog = card("Watchog", "Focus Energy");
    let found = false;
    for (let seed = 1; seed <= 12 && !found; seed++) {
      const { s, p2 } = scenario({
        seed,
        p1: { active: { def: watchog, energy: [E("Grass")] } },
        p2: { active: pokemon({ hp: 900 }) },
      });
      let st = use(s, "Focus Energy");
      st = settle(play(st, "p2", { type: "endTurn" }));
      st = use(st, "Hyper Fang");
      const dmg = st.pokemon[p2.active as string]?.damage ?? 0;
      if (dmg > 0) {
        expect(dmg).toBe(240);
        found = true;
      }
    }
    expect(found).toBe(true);
  });

  it("Victini V-Force does nothing with 4 or fewer Benched Pokémon", () => {
    const victini = card("Victini", "V-Force");
    const R = E("Fire");
    const four = scenario({
      p1: { active: { def: victini, energy: [R, R] }, bench: [dummy, dummy, dummy, dummy] },
      p2: { active: dummy },
    });
    expect(use(four.s, "V-Force").pokemon[four.p2.active as string]?.damage).toBe(0);
    const five = scenario({
      p1: { active: { def: victini, energy: [R, R] }, bench: [dummy, dummy, dummy, dummy, dummy] },
      p2: { active: dummy },
    });
    expect(use(five.s, "V-Force").pokemon[five.p2.active as string]?.damage).toBe(120);
  });

  it("Conkeldurr Craftsmanship: +40 HP for each {F} Energy attached to it", () => {
    const conk = card("Conkeldurr", "Craftsmanship");
    const F = E("Fighting");
    const { s, p1 } = scenario({ p1: { active: { def: conk, energy: [F, F] } }, p2: { active: dummy } });
    expect(chars(s, p1.active as string).hp).toBe((conk.hp ?? 0) + 80);
  });

  it("Mandibuzz Look for Prey: a Basic Pokémon with 70 HP or less from the opponent's hand onto their Bench", () => {
    const small = pokemon({ name: "Small", hp: 60 });
    const { s, p1 } = scenario({
      p1: { active: dummy, bench: [card("Mandibuzz", "Look for Prey")] },
      p2: { active: dummy, hand: [small, dummy] },
    });
    let st = play(s, "p1", { type: "useAbility", pokemon: p1.bench[0] as string, ability: 0 });
    const pick = (st.players.p2?.hand ?? []).find((c) => st.objects[c]?.defId === small.id) as string;
    st = answer(st, [pick]);
    expect(st.players.p2?.bench).toHaveLength(1);
    expect(st.players.p2?.hand).toHaveLength(1);
  });

  it("Hydreigon ex Greedy Eater: 1 more Prize card for a Basic Pokémon it Knocks Out", () => {
    const hydreigon = card("Hydreigon ex", "Greedy Eater");
    const D = E("Darkness");
    const { s } = scenario({
      p1: { active: { def: hydreigon, energy: [D, D, D, D, D] } },
      p2: { active: pokemon({ name: "Basic", hp: 100 }), bench: [dummy] },
    });
    expect(settle(use(s, "Dark Bite")).players.p1?.prizes).toHaveLength(4);
  });

  it("Samurott Torrential Whirlpool: switch your Active Pokémon, then the opponent switches theirs", () => {
    const samurott = card("Samurott", "Torrential Whirlpool");
    const { s, p1, p2 } = scenario({ p1: { active: dummy, bench: [samurott] }, p2: { active: dummy, bench: [dummy] } });
    const st = settle(play(s, "p1", { type: "useAbility", pokemon: p1.bench[0] as string, ability: 0 }));
    expect(st.players.p1?.active).toBe(p1.bench[0]);
    expect(st.players.p2?.active).toBe(p2.bench[0]);
  });
});
