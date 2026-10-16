/**
 * me04 and me03 (PLAN-B B6): the cards finishing both sets, checked against the printed text with the engine's scenario
 * helpers.
 */
import { type CardDef, chars, type GameState, legalActions } from "@pokecircle/engine";
import { describe, expect, it } from "vitest";
import { answer, handOf, play, pokemon, scenario } from "../../engine/test/helpers";
import { CARDS } from "../src/index";

const card = (name: string, print?: string): CardDef => {
  const d = Object.values(CARDS).find((x) => x.name === name && x.standard && x.implemented && (!print || x.print === print));
  if (!d) throw new Error(`no card ${name} ${print ?? ""}`);
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
  for (let i = 0; i < 10 && st.pending?.kind === "choice"; i++) st = answer(st, st.pending.request.suggested);
  return st;
};

describe("PLAN-B B6: me04 and me03", () => {
  it("Transformation Tome: only with 2 in hand; the Basic from the discard pile takes the place, damage stays", () => {
    const tome = card("Transformation Tome");
    const basic = pokemon({ name: "New Basic", hp: 200 });
    const alone = scenario({ p1: { active: { def: dummy, damage: 30 }, hand: [tome], discard: [basic] }, p2: { active: dummy } });
    expect(options(alone.s).some((o) => o.type === "playTrainer")).toBe(false);
    const { s, p1 } = scenario({
      p1: { active: { def: dummy, damage: 30 }, hand: [tome, tome], discard: [basic] },
      p2: { active: dummy },
    });
    const st = settle(play(s, "p1", { type: "playTrainer", card: handOf(s, "p1", tome)[0] as string }));
    expect(chars(st, p1.active as string).name).toBe("New Basic");
    expect(st.pokemon[p1.active as string]?.damage).toBe(30);
    expect(st.players.p1?.hand).toHaveLength(0);
    expect(st.players.p1?.discard.filter((c) => st.objects[c]?.defId === tome.id)).toHaveLength(2);
  });

  it("Nitro Fire Energy: discarded by its {R} Pokémon's own attack, it goes back to the hand", () => {
    const nitro = card("Nitro Fire Energy");
    const burner = pokemon({
      name: "Burner",
      types: ["R"],
      attacks: [
        { name: "Burn", cost: [], damage: 30, effects: [{ op: "mainDamage" }, { op: "discardEnergy", from: "self", n: 1 }] },
      ],
    });
    const { s } = scenario({ p1: { active: { def: burner, energy: [nitro] } }, p2: { active: dummy } });
    const st = settle(use(s, "Burn"));
    expect(st.players.p1?.hand.some((c) => st.objects[c]?.defId === nitro.id)).toBe(true);
  });

  it("Patrat Watchful Eye: damage counters can't be moved (Ninetales' Nine-Tailed Transfer does nothing)", () => {
    const ninetales = card("Ninetales", "me04-009");
    const { s, p1, p2 } = scenario({
      p1: { active: { def: ninetales, energy: [E("Fire")] }, bench: [{ def: dummy, damage: 50 }] },
      p2: { active: card("Patrat", "me04-070") },
    });
    const st = settle(use(s, "Nine-Tailed Transfer"));
    expect(st.pokemon[p1.bench[0] as string]?.damage).toBe(50);
    expect(st.pokemon[p2.active as string]?.damage).toBe(0);
  });

  it("Gengar Infinite Shadow: Knocked Out by an attack, it goes to the hand instead of the discard pile", () => {
    const gengar = card("Gengar", "me03-050");
    const hitter = pokemon({ name: "Hitter", hp: 300, attacks: [{ cost: [], damage: 400 }] });
    const { s } = scenario({ p1: { active: hitter }, p2: { active: gengar, bench: [dummy] } });
    const st = settle(play(s, "p1", { type: "attack", index: 0 }));
    expect(st.players.p2?.hand.some((c) => st.objects[c]?.defId === gengar.id)).toBe(true);
    expect(st.players.p2?.discard.some((c) => st.objects[c]?.defId === gengar.id)).toBe(false);
  });

  it("Core Memory: only Mega Zygarde ex can use Geobuster (350, discard all Energy)", () => {
    const memory = card("Core Memory");
    const zygarde = card("Mega Zygarde ex");
    const F = E("Fighting");
    const z = scenario({
      p1: { active: { def: zygarde, tools: [memory], energy: [F, F, F, F] } },
      p2: { active: pokemon({ hp: 400 }) },
    });
    const st = use(z.s, "Geobuster");
    expect(st.pokemon[z.p2.active as string]?.damage).toBe(350);
    expect(st.pokemon[z.p1.active as string]?.energy).toHaveLength(0);
    const other = scenario({ p1: { active: { def: dummy, tools: [memory], energy: [F, F, F, F] } }, p2: { active: dummy } });
    expect(options(other.s).some((o) => o.type === "attack" && o.name === "Geobuster")).toBe(false);
  });

  it("Trevenant Cursed Roots: during the opponent's next turn, no Energy from their hand to the Defending Pokémon", () => {
    const { s, p2 } = scenario({
      p1: { active: { def: card("Trevenant", "me04-039"), energy: [E("Psychic")] } },
      p2: { active: dummy, bench: [dummy], hand: [E("Grass")] },
    });
    const st = use(s, "Cursed Roots");
    const attach = options(st, "p2").find((o) => o.type === "attachEnergy");
    expect(attach?.type === "attachEnergy" && attach.targets.includes(p2.active as string)).toBe(false);
    expect(attach?.type === "attachEnergy" && attach.targets.includes(p2.bench[0] as string)).toBe(true);
  });

  it("Luxio Fighting Roar: against a Pokémon ex, it can evolve during the first turn", () => {
    const luxio = card("Luxio", "me03-027");
    const luxray = Object.values(CARDS).find((x) => x.name === "Luxray" && x.evolvesFrom === "Luxio" && x.implemented) as CardDef;
    const ex = pokemon({ name: "Some ex", hp: 200, tags: ["ex", "ruleBox"] });
    const vsEx = scenario({ turn: 1, first: "p1", p1: { active: luxio, hand: [luxray] }, p2: { active: ex } });
    expect(options(vsEx.s).some((o) => o.type === "evolve")).toBe(true);
    const vsPlain = scenario({ turn: 1, first: "p1", p1: { active: luxio, hand: [luxray] }, p2: { active: dummy } });
    expect(options(vsPlain.s).some((o) => o.type === "evolve")).toBe(false);
  });

  it("Delibird Pleasing Present: the opponent attaches first, choosing their own cards and Pokémon", () => {
    const { s } = scenario({
      p1: { active: { def: card("Delibird", "me04-018"), energy: [E("Water"), E("Water")] }, hand: [E("Water")] },
      p2: { active: dummy, hand: [E("Grass"), E("Grass")] },
    });
    const st = use(s, "Pleasing Present");
    expect(st.pending?.kind === "choice" && st.pending.player).toBe("p2");
  });

  it("Ange Floette: put into play only by discarding Prism Tower, even the turn Prism Tower was played", () => {
    const ange = card("Ange Floette");
    const tower = card("Prism Tower");
    const none = scenario({ p1: { active: dummy, hand: [ange] }, p2: { active: dummy } });
    expect(options(none.s).some((o) => o.type === "playTrainer")).toBe(false);
    const { s } = scenario({ p1: { active: dummy, hand: [tower, ange] }, p2: { active: dummy } });
    const st = play(s, "p1", { type: "playTrainer", card: handOf(s, "p1", tower)[0] as string });
    expect(options(st).some((o) => o.type === "playTrainer" && o.card === handOf(st, "p1", ange)[0])).toBe(true);
  });

  it("Cinccino ex Smooth Coat: damage from attacks is prevented on heads (a coin is flipped when damaged)", () => {
    const hitter = pokemon({ name: "Hitter", hp: 300, attacks: [{ cost: [], damage: 60 }] });
    const results = new Set<number>();
    for (let seed = 1; seed <= 12; seed++) {
      const { s, p2 } = scenario({ seed, p1: { active: hitter }, p2: { active: card("Cinccino ex") } });
      results.add(play(s, "p1", { type: "attack", index: 0 }).pokemon[p2.active as string]?.damage ?? -1);
    }
    expect([...results].sort()).toEqual([0, 60]);
  });
});
