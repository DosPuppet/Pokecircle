/**
 * sv05, promos and 30th Celebration (PLAN-B B15): the last Standard cards, checked against the printed text with the
 * engine's scenario helpers.
 */
import { type CardDef, chars, type GameState, legalActions } from "@pokecircle/engine";
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
const attackNames = (s: GameState, p: "p1" | "p2" = "p1") => options(s, p).flatMap((o) => (o.type === "attack" ? [o.name] : []));
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
const endTurn = (s: GameState, p: "p1" | "p2") => settle(play(s, p, { type: "endTurn" }));

describe("PLAN-B B15: sv05, promos, 30th Celebration", () => {
  it("30th Celebration Evolution prints know what they evolve from (Espeon from Eevee)", () => {
    expect(card("Espeon", "Miraculous Shine").evolvesFrom).toBe("Eevee");
    expect(card("Solgaleo", "Sunsteel Strike").evolvesFrom).toBe("Cosmoem");
  });

  it("Relicanth Memory Dive: an evolved Pokémon uses the attacks of its previous Evolution", () => {
    const relicanth = card("Relicanth", "Memory Dive");
    const base = pokemon({ name: "Base", hp: 60, attacks: [{ name: "Old Move", cost: [], damage: 10 }] });
    const evo = pokemon({
      name: "Evo",
      hp: 120,
      stage: "stage1",
      evolvesFrom: "Base",
      attacks: [{ name: "New Move", cost: [], damage: 30 }],
    });
    const without = scenario({ p1: { active: { def: evo, below: [base] } }, p2: { active: dummy } });
    expect(attackNames(without.s)).not.toContain("Old Move");
    const { s } = scenario({ p1: { active: { def: evo, below: [base] }, bench: [relicanth] }, p2: { active: dummy } });
    expect(attackNames(s)).toEqual(expect.arrayContaining(["Old Move", "New Move"]));
  });

  it("Illumise Supereffective Pheromones: with Volbeat in play, Weakness is ×3 for both Active Pokémon", () => {
    const illumise = card("Illumise", "Supereffective Pheromones");
    const volbeat = pokemon({ name: "Volbeat", hp: 80 });
    const weak = pokemon({ name: "Weak", hp: 300, weakness: { type: "G", mult: 2 } });
    const { s, p2 } = scenario({ p1: { active: illumise, bench: [volbeat] }, p2: { active: weak } });
    expect(chars(s, p2.active as string).weakness?.mult).toBe(3);
    const alone = scenario({ p1: { active: illumise }, p2: { active: weak } });
    expect(chars(alone.s, alone.p2.active as string).weakness?.mult).toBe(2);
  });

  it("Yveltal Life-Locked: the opponent's Active Pokémon can't be healed", () => {
    const yveltal = card("Yveltal", "Life-Locked");
    const potion = trainer("item", [{ op: "heal", target: "myActive", amount: 30 }], {}, "Heal Item");
    const { s, p2 } = scenario({
      active: "p2",
      p1: { active: yveltal },
      p2: { active: { def: dummy, damage: 50 }, hand: [potion] },
    });
    const st = settle(play(s, "p2", { type: "playTrainer", card: handOf(s, "p2", potion)[0] as string }));
    expect(st.pokemon[p2.active as string]?.damage).toBe(50);
  });

  it("Seismitoad Quaking Fist: the opponent flips to use a Trainer card; tails, it is discarded", () => {
    const toad = card("Seismitoad", "Quaking Fist");
    const draw = trainer("item", [{ op: "draw", n: 2 }], {}, "Draw Item");
    const outcomes = new Set<string>();
    for (let seed = 1; seed <= 12; seed++) {
      const { s } = scenario({
        seed,
        p1: { active: { def: toad, energy: [E("Fighting")] }, deck: [dummy, dummy, dummy] },
        p2: { active: dummy, hand: [draw], deck: [dummy, dummy, dummy, dummy] },
      });
      let st = settle(use(s, "Quaking Fist"));
      const before = st.players.p2?.hand.length ?? 0;
      st = settle(play(st, "p2", { type: "playTrainer", card: handOf(st, "p2", draw)[0] as string }));
      const discarded = defIds(st, st.players.p2?.discard ?? []).includes(draw.id);
      outcomes.add(st.players.p2?.hand.length === before + 1 ? "used" : discarded ? "discarded" : "other");
    }
    expect([...outcomes].sort()).toEqual(["discarded", "used"]);
  });

  it("Gouging Fire ex Blaze Blitz: it can't be used again until the Pokémon leaves the Active Spot", () => {
    const fire = card("Gouging Fire ex");
    const R = E("Fire");
    const { s } = scenario({
      p1: { active: { def: fire, energy: [R, R, R] }, bench: [dummy] },
      p2: { active: dummy, bench: [dummy] },
    });
    let st = settle(use(s, "Blaze Blitz"));
    st = endTurn(st, "p2");
    expect(attackNames(st)).not.toContain("Blaze Blitz");
    expect(attackNames(st)).toContain("Heat Blast");
  });

  it("Snorlax Good Sleep: still Asleep after the Checkup, it heals all its damage", () => {
    const snorlax = card("Snorlax", "Good Sleep");
    const results = new Set<number>();
    for (let seed = 1; seed <= 10; seed++) {
      const { s, p1 } = scenario({
        seed,
        p1: { active: { def: snorlax, damage: 60, cond: { rotating: "asleep" } }, deck: [dummy, dummy] },
        p2: { active: dummy, deck: [dummy, dummy] },
      });
      const st = endTurn(s, "p1");
      const pk = st.pokemon[p1.active as string];
      results.add(pk?.cond.rotating === "asleep" ? (pk.damage === 0 ? 1 : -1) : pk?.damage === 60 ? 0 : -1);
    }
    expect(results.has(-1)).toBe(false);
    expect(results.has(1)).toBe(true);
  });

  it("Heavy Baton: an Active holder with a Retreat Cost of 4 Knocked Out moves up to 3 Basic Energy to the Bench", () => {
    const baton = card("Heavy Baton");
    const heavy = pokemon({ name: "Heavy", hp: 100, retreat: 4 });
    const attacker = pokemon({ name: "Attacker", hp: 300, attacks: [{ name: "Hit", cost: [], damage: 200 }] });
    const R = E("Fire");
    const { s, p1 } = scenario({
      active: "p2",
      p1: { active: { def: heavy, tools: [baton], energy: [R, R, R, R] }, bench: [dummy] },
      p2: { active: attacker },
    });
    const st = settle(play(s, "p2", { type: "attack", index: 0 }));
    expect(st.pokemon[p1.bench[0] as string]?.energy).toHaveLength(3);
  });

  it("Gholdengo Celebration: with exactly 30 cards in hand, take 2 Prize cards and shuffle the hand into the deck", () => {
    const gholdengo = card("Gholdengo", "Celebration");
    const hand = Array.from({ length: 30 }, () => dummy);
    const { s } = scenario({ p1: { active: { def: gholdengo, energy: [E("Metal")] }, hand }, p2: { active: dummy } });
    const st = settle(use(s, "Celebration"));
    expect(st.players.p1?.prizes).toHaveLength(4);
    expect(st.players.p1?.hand).toHaveLength(0);
  });

  it("Hand Trimmer: each player discards down to 5 cards, the opponent first", () => {
    const trimmer = card("Hand Trimmer");
    const seven = Array.from({ length: 7 }, () => dummy);
    const { s } = scenario({ p1: { active: dummy, hand: [trimmer, ...seven] }, p2: { active: dummy, hand: [...seven, dummy] } });
    const st = settle(play(s, "p1", { type: "playTrainer", card: handOf(s, "p1", trimmer)[0] as string }));
    expect(st.players.p1?.hand).toHaveLength(5);
    expect(st.players.p2?.hand).toHaveLength(5);
  });

  it("Shiftry Expelling Tornado: the opponent's Benched Pokémon not chosen go into their deck", () => {
    const shiftry = card("Shiftry", "Expelling Tornado");
    const { s } = scenario({
      p1: { active: { def: shiftry, energy: [E("Grass")] } },
      p2: { active: dummy, bench: [dummy, dummy, dummy, dummy, dummy] },
    });
    const cards = (st: GameState) => (st.players.p2?.deck.length ?? 0) + (st.players.p2?.hand.length ?? 0);
    const before = cards(s);
    const st = settle(use(s, "Expelling Tornado"));
    expect(st.players.p2?.bench).toHaveLength(3);
    expect(cards(st)).toBe(before + 2); // (the opponent drew for their turn)
  });

  it("Ditto Surprisingly Transform: heads, a Pokémon from the deck takes its place; Ditto goes into the deck", () => {
    const ditto = card("Ditto", "Surprisingly Transform");
    const big = pokemon({ name: "Big", hp: 200 });
    for (let seed = 1; seed <= 10; seed++) {
      const { s, p1 } = scenario({
        seed,
        p1: { active: { def: ditto, energy: [E("Water"), E("Water")] }, deck: [big] },
        p2: { active: dummy },
      });
      const st = settle(use(s, "Surprisingly Transform"));
      const top = defIds(st, st.pokemon[p1.active as string]?.cards ?? []).at(-1);
      if (top === big.id) {
        expect(defIds(st, st.players.p1?.deck ?? [])).toContain(ditto.id);
        return;
      }
    }
    throw new Error("no heads in 10 seeds");
  });
});
