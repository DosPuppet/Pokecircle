/** Attacks, damage, Knock Outs and winning (docs/rules.md R-ATTACK, R-KO, R-WIN, R-RULEBOX). */
import { describe, expect, it } from "vitest";
import { amt, fx, legalActions, ref, scope, submit } from "../src/index";
import { answer, energy, play, pokemon, scenario } from "./helpers";

const fire = energy("R");
const water = energy("W");
const attacker = pokemon({ name: "Flamer", types: ["R"], attacks: [{ name: "Burn", cost: ["R"], damage: 60 }] });
const grass = pokemon({ name: "Leafy", types: ["G"], hp: 200, weakness: { type: "R", mult: 2 } });
const tank = pokemon({ name: "Tank", types: ["W"], hp: 200, resistance: { type: "R", amount: 30 } });
const plain = pokemon({ name: "Plain", hp: 50 });

const attack = (s: Parameters<typeof legalActions>[0], index = 0) => play(s, "p1", { type: "attack", index });

describe("attack damage", () => {
  it("R-ATTACK-1: the Energy cost must be attached (Colorless by any type)", () => {
    const cc = pokemon({ attacks: [{ cost: ["R", "C"], damage: 10 }] });
    const no = scenario({ p1: { active: { def: cc, energy: [fire] } }, p2: { active: plain } });
    expect(legalActions(no.s, "p1").some((o) => o.type === "attack")).toBe(false);
    const yes = scenario({ p1: { active: { def: cc, energy: [fire, water] } }, p2: { active: plain } });
    expect(legalActions(yes.s, "p1").some((o) => o.type === "attack")).toBe(true);
    const wrong = scenario({ p1: { active: { def: cc, energy: [water, water] } }, p2: { active: plain } });
    expect(legalActions(wrong.s, "p1").some((o) => o.type === "attack")).toBe(false);
  });

  it("R-ATTACK-4: Weakness ×2 and Resistance −30 on the Defending Pokémon", () => {
    const w = scenario({ p1: { active: { def: attacker, energy: [fire] } }, p2: { active: grass } });
    expect(attack(w.s).pokemon[w.p2.active as string]?.damage).toBe(120);
    const r = scenario({ p1: { active: { def: attacker, energy: [fire] } }, p2: { active: tank } });
    expect(attack(r.s).pokemon[r.p2.active as string]?.damage).toBe(30);
  });

  it("R-ATTACK-4: bonus damage before Weakness; no damage when the base is 0", () => {
    const boosted = pokemon({
      types: ["R"],
      attacks: [{ cost: [], damage: 30, suffix: "+", effects: [fx.bonus(20), fx.main()] }],
    });
    const a = scenario({ p1: { active: boosted }, p2: { active: grass } });
    expect(attack(a.s).pokemon[a.p2.active as string]?.damage).toBe(100);
    const zero = pokemon({
      types: ["R"],
      attacks: [{ cost: [], damage: 10, suffix: "x", effects: [fx.setDamage(0), fx.main()] }],
    });
    const z = scenario({ p1: { active: zero }, p2: { active: grass } });
    expect(attack(z.s).pokemon[z.p2.active as string]?.damage).toBe(0);
  });

  it("R-ATTACK-5: no Weakness or Resistance on the Bench", () => {
    const sniper = pokemon({
      types: ["R"],
      attacks: [{ cost: [], damage: 0, effects: [fx.choosePokemon(scope.oppBench(), "t", "Choose"), fx.damage(ref.v("t"), 30)] }],
    });
    const { s, p2 } = scenario({ p1: { active: sniper }, p2: { active: plain, bench: [grass] } });
    expect(attack(s).pokemon[p2.bench[0] as string]?.damage).toBe(30);
  });

  it("R-RULEBOX-2: a Tera Pokémon on the Bench takes no damage from attacks, but damage counters stay possible", () => {
    const tera = pokemon({ name: "Tera", tags: ["ex", "ruleBox", "tera"], hp: 200 });
    const both = pokemon({
      attacks: [
        { cost: [], damage: 0, effects: [fx.damage(ref.all(scope.oppBench()), 30)] },
        { cost: [], damage: 0, effects: [fx.counters(ref.all(scope.oppBench()), 2)] },
      ],
    });
    const a = scenario({ p1: { active: both }, p2: { active: plain, bench: [tera] } });
    expect(attack(a.s, 0).pokemon[a.p2.bench[0] as string]?.damage).toBe(0);
    expect(attack(a.s, 1).pokemon[a.p2.bench[0] as string]?.damage).toBe(20);
  });

  it("R-ATTACK-6: damage counters ignore Weakness", () => {
    const placer = pokemon({ types: ["R"], attacks: [{ cost: [], damage: 0, effects: [fx.counters(ref.defending, 3)] }] });
    const { s, p2 } = scenario({ p1: { active: placer }, p2: { active: grass } });
    expect(attack(s).pokemon[p2.active as string]?.damage).toBe(30);
  });

  it("R-ATTACK-2: Confused: tails, 3 damage counters on itself and the attack does nothing", () => {
    for (let seed = 1; seed < 40; seed++) {
      const { s, p1, p2 } = scenario({
        seed,
        p1: { active: { def: attacker, energy: [fire], cond: { rotating: "confused" } } },
        p2: { active: grass },
      });
      const after = attack(s);
      const self = after.pokemon[p1.active as string]?.damage ?? 0;
      const opp = after.pokemon[p2.active as string]?.damage ?? 0;
      expect((self === 30 && opp === 0) || (self === 0 && opp === 120)).toBe(true);
      expect(after.turn.active).toBe("p2");
    }
  });

  it("a coin flip decides an effect, shown as an event", () => {
    const flipper = pokemon({
      attacks: [{ cost: [], damage: 10, effects: [fx.flip(), fx.if({ c: "heads" }, [fx.bonus(30)]), fx.main()] }],
    });
    const results = new Set<number>();
    for (let seed = 1; seed < 30; seed++) {
      const { s, p2 } = scenario({ seed, p1: { active: flipper }, p2: { active: grass } });
      results.add(attack(s).pokemon[p2.active as string]?.damage ?? -1);
    }
    expect([...results].sort()).toEqual([10, 40]);
  });

  it("the attack ends the turn", () => {
    const { s } = scenario({ p1: { active: { def: attacker, energy: [fire] } }, p2: { active: grass } });
    const after = attack(s);
    expect(after.turn.active).toBe("p2");
    expect(after.turn.number).toBe(4);
  });
});

describe("Knock Outs and winning", () => {
  it("R-KO-1/2: a Knocked Out Pokémon goes to the discard pile; the opponent takes Prizes (2 for ex)", () => {
    const ex = pokemon({ name: "Big ex", tags: ["ex", "ruleBox"], hp: 60 });
    const { s, p2 } = scenario({
      p1: { active: { def: attacker, energy: [fire] } },
      p2: { active: { def: ex, energy: [water] }, bench: [plain] },
    });
    const after = attack(s);
    expect(after.pokemon[p2.active as string]).toBeUndefined();
    expect(after.players.p2?.discard).toHaveLength(2);
    expect(after.players.p1?.prizes).toHaveLength(4);
    expect(after.players.p2?.active).toBe(p2.bench[0]);
  });

  it("R-KO-2: 3 Prize cards for a Mega Evolution Pokémon ex", () => {
    const mega = pokemon({ name: "Mega Thing ex", tags: ["ex", "mega", "ruleBox"], hp: 60 });
    const { s } = scenario({ p1: { active: { def: attacker, energy: [fire] } }, p2: { active: mega, bench: [plain] } });
    expect(attack(s).players.p1?.prizes).toHaveLength(3);
  });

  it("R-KO-4: the owner chooses the new Active Pokémon", () => {
    const { s, p2 } = scenario({
      p1: { active: { def: attacker, energy: [fire] } },
      p2: { active: plain, bench: [grass, tank] },
    });
    const after = attack(s);
    expect(after.pending).toMatchObject({ kind: "choice", purpose: "promote", player: "p2" });
    const chosen = answer(after, [p2.bench[1] as string]);
    expect(chosen.players.p2?.active).toBe(p2.bench[1]);
    expect(chosen.pending).toMatchObject({ kind: "main", player: "p2" });
  });

  it("R-WIN-1: taking the last Prize card wins", () => {
    const { s } = scenario({
      p1: { active: { def: attacker, energy: [fire] }, prizes: 1 },
      p2: { active: plain, bench: [grass] },
    });
    const after = attack(s);
    expect(after.over).toBe(true);
    expect(after.winner).toBe("p1");
    expect(after.endReason).toBe("prizes");
  });

  it("R-WIN-2: the opponent without Pokémon in play loses", () => {
    const { s } = scenario({ p1: { active: { def: attacker, energy: [fire] } }, p2: { active: plain } });
    const after = attack(s);
    expect(after.winner).toBe("p1");
    expect(after.endReason).toBe("noPokemon");
  });

  it("R-WIN-3: a player who cannot draw at the start of their turn loses", () => {
    const { s } = scenario({ p1: { active: plain }, p2: { active: plain, deck: [] } });
    const after = play(s, "p1", { type: "endTurn" });
    expect(after.winner).toBe("p1");
    expect(after.endReason).toBe("deckOut");
  });

  it("R-WIN-4: both players winning at once with as many conditions: Sudden Death, a new game with 1 Prize each", () => {
    const recoil = pokemon({ hp: 30, attacks: [{ cost: [], damage: 60, effects: [fx.main(), fx.damage(ref.self, 30)] }] });
    const { s } = scenario({
      p1: { active: recoil, deck: Array(10).fill(plain) },
      p2: { active: plain, deck: Array(10).fill(plain) },
    });
    const { state: after, events } = submit(s, "p1", { type: "attack", index: 0 });
    expect(after.over).toBe(false);
    expect(events.some((e) => e.type === "suddenDeath" && e.round === 1)).toBe(true);
    expect(after.suddenDeath).toBe(1);
    expect(after.prizeCount).toBe(1);
    expect(after.flow).toBe("setup");
    expect(Object.keys(after.pokemon)).toHaveLength(0);
    // Every card is back in its owner's deck (17 each), with new ids; a coin flip decides who chooses to go first.
    for (const p of ["p1", "p2"] as const) {
      const ps = after.players[p];
      expect(ps?.deck).toHaveLength(17);
      expect(ps?.deck.some((id) => Object.keys(s.objects).includes(id))).toBe(false);
      expect(ps?.prizesTaken).toBe(0);
    }
    expect(after.pending?.kind === "choice" && after.pending.purpose).toBe("chooseFirst");
    // The new game is set up as usual, with 1 Prize card each.
    let g = after;
    for (let i = 0; i < 20 && g.flow === "setup"; i++) {
      const p = g.pending;
      if (!p) break;
      if (p.kind === "choice") g = answer(g, p.request.suggested);
      else if (p.kind === "setup") {
        const hand = g.players[p.player]?.hand ?? [];
        const basic = hand.find((c) => g.defs[g.objects[c]?.defId ?? ""]?.category === "pokemon") as string;
        g = play(g, p.player, { type: "setup", active: basic, bench: [] });
      }
    }
    expect(g.flow).not.toBe("setup");
    expect(g.players.p1?.prizes).toHaveLength(1);
    expect(g.players.p2?.prizes).toHaveLength(1);
  });

  it("R-KO-3: Pokémon Knocked Out at the same time: both players take Prizes", () => {
    const recoil = pokemon({ hp: 30, attacks: [{ cost: [], damage: 60, effects: [fx.main(), fx.damage(ref.self, 30)] }] });
    const { s } = scenario({ p1: { active: recoil, bench: [plain] }, p2: { active: plain, bench: [plain] } });
    const after = attack(s);
    expect(after.players.p1?.prizes).toHaveLength(5);
    expect(after.players.p2?.prizes).toHaveLength(5);
  });

  it("amounts: damage for each Energy attached", () => {
    const counter = pokemon({
      attacks: [{ cost: [], damage: 20, suffix: "x", effects: [fx.setDamage(amt.mul(20, amt.energy(ref.self))), fx.main()] }],
    });
    const { s, p2 } = scenario({ p1: { active: { def: counter, energy: [fire, fire, water] } }, p2: { active: grass } });
    expect(attack(s).pokemon[p2.active as string]?.damage).toBe(60);
  });
});
