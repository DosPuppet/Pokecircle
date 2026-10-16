/**
 * sv08 (Surging Sparks; PLAN-B B12): the Standard cards finishing the set, checked against the printed text with the
 * engine's scenario helpers.
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
  return play(s, "p1", { type: "attack", index: o.index, ...(o.source ? { source: o.source } : {}) });
};
const settle = (s: GameState) => {
  let st = s;
  for (let i = 0; i < 12 && st.pending?.kind === "choice"; i++) st = answer(st, st.pending.request.suggested);
  return st;
};

describe("PLAN-B B12: sv08", () => {
  it("Palossand ex Barite Jail: each opponent's Benched Pokémon is left with 100 HP", () => {
    const sand = card("Palossand ex");
    const { s, p2 } = scenario({
      p1: { active: { def: sand, energy: [E("Water"), E("Psychic"), E("Fighting")] } },
      p2: { active: dummy, bench: [pokemon({ name: "Big", hp: 250 }), pokemon({ name: "Small", hp: 90 })] },
    });
    const st = settle(use(s, "Barite Jail"));
    expect(st.pokemon[p2.bench[0] as string]?.damage).toBe(150);
    expect(st.pokemon[p2.bench[1] as string]?.damage).toBe(0);
  });

  it("Oranguru: the Defending Pokémon's Weakness is {C} until the end of the attacker's next turn", () => {
    const oran = card("Oranguru", "Now You're in My Power");
    const { s, p2 } = scenario({
      p1: { active: { def: oran, energy: [E("Grass"), E("Grass")] } },
      p2: { active: pokemon({ name: "Target", hp: 300, weakness: { type: "R", mult: 2 } }) },
    });
    let st = use(s, "Now You're in My Power");
    expect(chars(st, p2.active as string).weakness?.type).toBe("C");
    st = settle(play(st, "p2", { type: "endTurn" }));
    expect(chars(st, p2.active as string).weakness?.type).toBe("C");
    st = settle(play(st, "p1", { type: "endTurn" }));
    expect(chars(st, p2.active as string).weakness?.type).toBe("R");
  });

  it("Technical Machine: Fluorite: Fluorite heals the Tera Pokémon; the Tool is discarded at the end of the turn", () => {
    const tm = card("Technical Machine: Fluorite");
    const tera = pokemon({ name: "Tera Mon ex", hp: 200, tags: ["tera", "ex", "ruleBox"] });
    const { s, p1 } = scenario({
      p1: {
        active: { def: dummy, tools: [tm], energy: [E("Grass"), E("Water"), E("Psychic")] },
        bench: [{ def: tera, damage: 120 }],
      },
      p2: { active: dummy },
    });
    const st = settle(use(s, "Fluorite"));
    expect(st.pokemon[p1.bench[0] as string]?.damage).toBe(0);
    expect(st.pokemon[p1.active as string]?.energy).toHaveLength(0);
    expect(st.players.p1?.discard.some((c) => st.objects[c]?.defId === tm.id)).toBe(true);
  });

  it("Annihilape Destined Fight: both Active Pokémon are Knocked Out", () => {
    const ape = card("Annihilape", "Destined Fight");
    const F = E("Fighting");
    const { s, p1, p2 } = scenario({
      p1: { active: { def: ape, energy: [F, F, F] }, bench: [dummy] },
      p2: { active: dummy, bench: [dummy] },
    });
    const st = settle(use(s, "Destined Fight"));
    expect(st.pokemon[p1.active as string]).toBeUndefined();
    expect(st.pokemon[p2.active as string]).toBeUndefined();
  });

  it("Walrein Frigid Fangs: during the opponent's next turn, their Pokémon with 2 or less Energy can't attack", () => {
    const walrein = card("Walrein", "Frigid Fangs");
    const W = E("Water");
    const attacker = pokemon({ name: "Attacker", hp: 300, attacks: [{ name: "Hit", cost: [], damage: 10 }] });
    const { s } = scenario({ p1: { active: { def: walrein, energy: [W, W] } }, p2: { active: { def: attacker, energy: [W] } } });
    const st = settle(use(s, "Frigid Fangs"));
    expect(options(st, "p2").some((o) => o.type === "attack")).toBe(false);
  });

  it("Meddling Memo: the opponent's hand goes to the bottom of their deck, then they draw as many", () => {
    const memo = card("Meddling Memo");
    const { s } = scenario({
      p1: { active: dummy, hand: [memo] },
      p2: { active: dummy, hand: [dummy, dummy, dummy], deck: [dummy, dummy, dummy, dummy] },
    });
    const before = [...(s.players.p2?.hand ?? [])];
    const st = settle(play(s, "p1", { type: "playTrainer", card: handOf(s, "p1", memo)[0] as string }));
    expect(st.players.p2?.hand).toHaveLength(3);
    expect(st.players.p2?.hand.some((c) => before.includes(c))).toBe(false);
  });

  it("Slaking ex Born to Slack: it can't attack while the opponent has no Pokémon ex", () => {
    const slaking = card("Slaking ex");
    const C = E("Grass");
    const none = scenario({ p1: { active: { def: slaking, energy: [C, C] } }, p2: { active: dummy } });
    expect(options(none.s).some((o) => o.type === "attack")).toBe(false);
    const withEx = scenario({
      p1: { active: { def: slaking, energy: [C, C] } },
      p2: { active: pokemon({ name: "Foe ex", hp: 200, tags: ["ex", "ruleBox"] }) },
    });
    expect(options(withEx.s).some((o) => o.type === "attack")).toBe(true);
  });
});
