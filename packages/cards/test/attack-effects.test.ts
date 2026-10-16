/**
 * Attack effects of PLAN-B B2 (engine wave 1): coins, conditional and counted damage, damage counters, Bench damage,
 * healing and next-turn effects, checked on real cards against their printed text.
 */
import { type CardDef, type GameState, legalActions, submit } from "@pokecircle/engine";
import { describe, expect, it } from "vitest";
import { answer, handOf, play, pokemon, scenario } from "../../engine/test/helpers";
import { CARDS } from "../src/index";

const card = (name: string, print?: string): CardDef => {
  const list = Object.values(CARDS).filter((x) => x.name === name && x.standard && (!print || x.print === print));
  const d = list.find((x) => x.implemented) ?? list[0];
  if (!d) throw new Error(`no card ${name}`);
  return d;
};
/** The definition of a name that has this attack (several definitions may share a name). */
const withAttack = (name: string, attackName: string): { def: CardDef; i: number } => {
  const def = Object.values(CARDS).find((x) => x.name === name && x.standard && x.attacks?.some((a) => a.name === attackName));
  if (!def) throw new Error(`no ${name} with ${attackName}`);
  return { def, i: def.attacks?.findIndex((a) => a.name === attackName) ?? 0 };
};
const E = (t: string) => card(`Basic ${t} Energy`);
const big = pokemon({ name: "Big", hp: 500 });
const attack = (s: GameState, index = 0) => play(s, "p1", { type: "attack", index });
const settle = (s: GameState) => {
  for (let i = 0; i < 20 && s.pending?.kind === "choice"; i++) s = answer(s, s.pending.request.suggested);
  return s;
};

describe("PLAN-B B2: attack effects", () => {
  it("Scolipede Dastardly Jab: damage counters until the opponent's Active Pokémon has 10 HP left", () => {
    const { def: d, i } = withAttack("Scolipede", "Dastardly Jab");
    const target = pokemon({ name: "T", hp: 130 });
    const { s, p2 } = scenario({ p1: { active: { def: d, energy: [E("Darkness"), E("Darkness")] } }, p2: { active: target } });
    expect(attack(s, i).pokemon[p2.active as string]?.damage).toBe(120);
  });

  it("Vaporeon ex Severe Squall: 60 to each Pokémon ex, Weakness not applied (no main damage)", () => {
    const { def: d } = withAttack("Vaporeon ex", "Severe Squall");
    const weakEx = pokemon({ name: "Weak ex", hp: 300, tags: ["ex", "ruleBox"], weakness: { type: "W", mult: 2 } });
    const { s, p2 } = scenario({
      p1: { active: { def: d, energy: [E("Water"), E("Water")] } },
      p2: { active: weakEx, bench: [weakEx, big] },
    });
    const st = attack(s, 0);
    expect(st.pokemon[p2.active as string]?.damage).toBe(60);
    expect(st.pokemon[p2.bench[0] as string]?.damage).toBe(60);
    expect(st.pokemon[p2.bench[1] as string]?.damage).toBe(0);
  });

  it("Raging Bolt Thunderburst Storm: 30 damage to 1 Pokémon for each Energy attached", () => {
    const { def: d } = withAttack("Raging Bolt", "Thunderburst Storm");
    const { s, p2 } = scenario({
      p1: { active: { def: d, energy: [E("Lightning"), E("Fighting"), E("Fighting")] } },
      p2: { active: big, bench: [big] },
    });
    const i = d.attacks?.findIndex((a) => a.name === "Thunderburst Storm") ?? 0;
    let st = attack(s, i);
    st = answer(st, [p2.bench[0] as string]);
    expect(st.pokemon[p2.bench[0] as string]?.damage).toBe(90);
  });

  it("Klawf Snipping Pincers: one Energy discarded from the Defending Pokémon for each heads", () => {
    const { def: d } = withAttack("Klawf", "Snipping Pincers");
    const loaded = { def: big, energy: [E("Fire"), E("Fire"), E("Fire")] };
    let total = 0;
    for (let seed = 1; seed <= 6; seed++) {
      const { s, p2 } = scenario({
        seed,
        p1: { active: { def: d, energy: [E("Fighting"), E("Fighting")] } },
        p2: { active: loaded },
      });
      const st = settle(attack(s, 0));
      const heads = st.pokemon[p2.active as string]?.energy.length ?? 0;
      expect(heads).toBeLessThanOrEqual(3);
      total += 3 - heads;
    }
    // Over a few seeds both outcomes happen (2 coins each).
    expect(total).toBeGreaterThan(0);
  });

  it("Sandslash Sand Attack: the Defending Pokémon's attack doesn't happen on tails", () => {
    const { def: d, i } = withAttack("Sandslash", "Sand Attack");
    const hitter = pokemon({ name: "Hitter", hp: 200, attacks: [{ cost: [], damage: 30 }] });
    const results = new Set<number>();
    for (let seed = 1; seed <= 12; seed++) {
      const { s, p1 } = scenario({
        seed,
        p1: { active: { def: d, energy: [E("Fighting"), E("Fighting")] } },
        p2: { active: hitter },
      });
      let st = settle(attack(s, i));
      // The opponent's turn: they attack.
      st = settle(submit(st, "p2", { type: "attack", index: 0 }).state);
      results.add(st.pokemon[p1.active as string]?.damage ?? -1);
    }
    expect(results.has(0)).toBe(true);
    expect(results.has(30)).toBe(true);
  });

  it("Metapod Harden: damage of 60 or less is prevented during the opponent's next turn, more is not", () => {
    const { def: d } = withAttack("Metapod", "Harden");
    const weak = pokemon({ name: "Weak", attacks: [{ cost: [], damage: 60 }] });
    const strong = pokemon({ name: "Strong", attacks: [{ cost: [], damage: 70 }] });
    for (const [opp, dmg] of [
      [weak, 0],
      [strong, 70],
    ] as const) {
      const { s, p1 } = scenario({ p1: { active: { def: d, energy: [E("Grass")] } }, p2: { active: opp } });
      let st = settle(attack(s, 0));
      st = settle(submit(st, "p2", { type: "attack", index: 0 }).state);
      expect(st.pokemon[p1.active as string]?.damage).toBe(dmg);
    }
  });

  it("Maractus Lively Needles: 100 more damage if this Pokémon was healed during this turn", () => {
    const { def: d, i } = withAttack("Maractus", "Lively Needles");
    const potion = card("Potion");
    const { s, p2 } = scenario({
      p1: { active: { def: d, energy: [E("Grass")], damage: 30 }, hand: [potion] },
      p2: { active: big },
    });
    const plain = attack(s, i);
    expect(plain.pokemon[p2.active as string]?.damage).toBe(20);
    const healed = settle(play(s, "p1", { type: "playTrainer", card: handOf(s, "p1", potion)[0] as string }));
    expect(attack(healed, i).pokemon[p2.active as string]?.damage).toBe(120);
  });

  it("Delibird Quick Gift can be used during the first player's first turn; other attacks can't", () => {
    const { def: d } = withAttack("Delibird", "Quick Gift");
    const { s } = scenario({
      turn: 1,
      p1: { active: { def: d, energy: [E("Water"), E("Water"), E("Water")] } },
      p2: { active: big },
    });
    const names = legalActions(s, "p1").flatMap((o) => (o.type === "attack" ? [o.name] : []));
    expect(names).toEqual(["Quick Gift"]);
  });

  it("Misty's Vitality: every Basic {W} Energy found goes to the same Pokémon", () => {
    const vit = card("Misty's Vitality");
    const w = E("Water");
    const { s, p1 } = scenario({ p1: { active: big, bench: [big], hand: [vit], deck: [w, w, w, w, big] }, p2: { active: big } });
    let st = play(s, "p1", { type: "playTrainer", card: handOf(s, "p1", vit)[0] as string });
    // Search: all four.
    st = answer(
      st,
      st.pending?.kind === "choice" ? (st.pending.request.type === "pick" ? st.pending.request.options.slice(0, 4) : []) : [],
    );
    st = answer(st, [p1.bench[0] as string]);
    expect(st.pokemon[p1.bench[0] as string]?.energy).toHaveLength(4);
    expect(st.turn.active).toBe("p2");
  });
});
