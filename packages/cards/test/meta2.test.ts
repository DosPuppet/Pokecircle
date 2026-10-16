/**
 * Card text of the second wave of meta decks (PLAN-B B1): new templates, scripts and engine mechanics, checked against
 * the printed text with the engine's scenario helpers.
 */
import { type CardDef, chars, type GameState, legalActions } from "@pokecircle/engine";
import { describe, expect, it } from "vitest";
import { answer, handOf, play, pokemon, scenario } from "../../engine/test/helpers";
import { CARDS } from "../src/index";

const card = (name: string, print?: string): CardDef => {
  const list = Object.values(CARDS).filter((x) => x.name === name && x.standard && (!print || x.print === print));
  const d = list.find((x) => x.implemented) ?? list[0];
  if (!d) throw new Error(`no card ${name}`);
  return d;
};
const E = (t: string) => card(`Basic ${t} Energy`);
const metal = E("Metal");
const fighting = E("Fighting");
const dark = E("Darkness");
const dummy = pokemon({ name: "Dummy", hp: 300 });
const big = pokemon({ name: "Big", hp: 500 });
const shuppet = () => card("Shuppet", "me05-033");
const attack = (s: GameState, index = 0) => play(s, "p1", { type: "attack", index });
const suggested = (s: GameState) => (s.pending?.kind === "choice" ? answer(s, s.pending.request.suggested) : s);

describe("PLAN-B B1: meta cards", () => {
  it("Mega Excadrill ex Maximum Drilling: 130 more damage with at least 2 extra Energy beyond its cost", () => {
    const ex = card("Mega Excadrill ex");
    const three = scenario({ p1: { active: { def: ex, energy: [metal, metal, metal] } }, p2: { active: big } });
    expect(attack(three.s, 1).pokemon[three.p2.active as string]?.damage).toBe(200);
    const five = scenario({ p1: { active: { def: ex, energy: [metal, metal, metal, metal, metal] } }, p2: { active: big } });
    expect(attack(five.s, 1).pokemon[five.p2.active as string]?.damage).toBe(330);
  });

  it("Cynthia's Gible Rock Hurl: Resistance is not applied, Weakness still is", () => {
    const gible = card("Cynthia's Gible");
    const resists = pokemon({ name: "Resists", hp: 200, resistance: { type: "F", amount: 30 } });
    const weak = pokemon({ name: "Weak", hp: 200, weakness: { type: "F", mult: 2 } });
    const r = scenario({ p1: { active: { def: gible, energy: [fighting] } }, p2: { active: resists } });
    expect(attack(r.s).pokemon[r.p2.active as string]?.damage).toBe(20);
    const w = scenario({ p1: { active: { def: gible, energy: [fighting] } }, p2: { active: weak } });
    expect(attack(w.s).pokemon[w.p2.active as string]?.damage).toBe(40);
  });

  it("Dwebble Ascension: a card that evolves from it is put onto it from the deck", () => {
    const dwebble = card("Dwebble");
    const crustle = card("Crustle");
    const { s, p1 } = scenario({
      p1: { active: { def: dwebble, energy: [metal] }, deck: [crustle, dummy] },
      p2: { active: dummy },
    });
    const st = suggested(attack(s));
    expect(chars(st, p1.active as string).name).toBe("Crustle");
  });

  it("Crustle Mysterious Rock Inn: no damage from attacks of the opponent's Pokémon ex", () => {
    const ex = pokemon({ name: "Some ex", hp: 250, tags: ["ex", "ruleBox"], attacks: [{ cost: [], damage: 100 }] });
    const plain = pokemon({ name: "Plain", hp: 100, attacks: [{ cost: [], damage: 100 }] });
    const a = scenario({ p1: { active: ex }, p2: { active: card("Crustle") } });
    expect(attack(a.s).pokemon[a.p2.active as string]?.damage).toBe(0);
    const b = scenario({ p1: { active: plain }, p2: { active: card("Crustle") } });
    expect(attack(b.s).pokemon[b.p2.active as string]?.damage).toBe(100);
  });

  it("Hide 'n' Sneak: the effects of the opponent's attacks are prevented, not their damage", () => {
    const sleeper = pokemon({
      name: "Sleeper",
      attacks: [
        { cost: [], damage: 10, effects: [{ op: "mainDamage" }, { op: "condition", target: "defending", cond: "asleep" }] },
      ],
    });
    const { s, p2 } = scenario({ p1: { active: sleeper }, p2: { active: shuppet() } });
    const st = attack(s);
    expect(st.pokemon[p2.active as string]?.damage).toBe(10);
    expect(st.pokemon[p2.active as string]?.cond.rotating).toBeUndefined();
  });

  it("Dhelmise Vengeful Anchor: 140 more damage with 4 Hide 'n' Sneak Pokémon in the discard pile", () => {
    const dhelmise = card("Dhelmise", "me05-039");
    const psy = E("Psychic");
    const three = scenario({
      p1: { active: { def: dhelmise, energy: [psy] }, discard: [shuppet(), shuppet(), shuppet()] },
      p2: { active: dummy },
    });
    expect(attack(three.s).pokemon[three.p2.active as string]?.damage).toBe(30);
    const four = scenario({
      p1: { active: { def: dhelmise, energy: [psy] }, discard: [shuppet(), shuppet(), shuppet(), shuppet()] },
      p2: { active: dummy },
    });
    expect(attack(four.s).pokemon[four.p2.active as string]?.damage).toBe(170);
  });

  it("Team Rocket's Murkrow Torment: the chosen attack can't be used during the opponent's next turn", () => {
    const two = pokemon({
      name: "Two Attacks",
      hp: 200,
      attacks: [
        { name: "One", cost: [], damage: 10 },
        { name: "Two", cost: [], damage: 20 },
      ],
    });
    const { s } = scenario({ p1: { active: { def: card("Team Rocket's Murkrow"), energy: [dark, dark] } }, p2: { active: two } });
    let st = attack(s, 1);
    expect(st.pending?.kind === "choice" && st.pending.request.attacks).toBeTruthy();
    st = answer(st, ["1"]);
    // The opponent's turn: only "One" is offered.
    const names = legalActions(st, "p2").flatMap((o) => (o.type === "attack" ? [o.name] : []));
    expect(names).toEqual(["One"]);
  });

  it("Team Rocket's Proton can be played during the first player's first turn; other Supporters can't", () => {
    const proton = card("Team Rocket's Proton");
    const other = card("Team Rocket's Ariana");
    const { s } = scenario({
      turn: 1,
      p1: { active: dummy, hand: [proton, other], deck: [card("Team Rocket's Murkrow")] },
      p2: { active: dummy },
    });
    const playable = legalActions(s, "p1").flatMap((o) => (o.type === "playTrainer" ? [s.objects[o.card]?.defId] : []));
    expect(playable).toContain(proton.id);
    expect(playable).not.toContain(other.id);
  });

  it("Bianca's Devotion heals only a Pokémon with 30 HP or less remaining", () => {
    const bianca = card("Bianca's Devotion");
    const hurt = pokemon({ name: "Hurt", hp: 100 });
    const { s, p1 } = scenario({
      p1: { active: { def: hurt, damage: 80 }, bench: [{ def: hurt, damage: 50 }], hand: [bianca] },
      p2: { active: dummy },
    });
    const st = suggested(play(s, "p1", { type: "playTrainer", card: handOf(s, "p1", bianca)[0] as string }));
    expect(st.pokemon[p1.active as string]?.damage).toBe(0);
    expect(st.pokemon[p1.bench[0] as string]?.damage).toBe(50);
  });

  it("Gravity Mountain: each Stage 2 Pokémon in play gets -30 HP", () => {
    const stage2 = pokemon({ name: "Big", hp: 160, stage: "stage2" });
    const { s, p1 } = scenario({ p1: { active: stage2, hand: [card("Gravity Mountain")] }, p2: { active: dummy } });
    const st = play(s, "p1", { type: "playTrainer", card: handOf(s, "p1", card("Gravity Mountain"))[0] as string });
    expect(chars(st, p1.active as string).hp).toBe(130);
  });

  it("Ignition Energy provides {C}{C}{C} to an Evolution Pokémon and is discarded at the end of the turn", () => {
    const ignition = card("Ignition Energy");
    const evo = pokemon({ name: "Evo", hp: 120, stage: "stage1", attacks: [{ cost: ["C", "C", "C"], damage: 50 }] });
    const basic = pokemon({ name: "Base", hp: 120, attacks: [{ cost: ["C", "C", "C"], damage: 50 }] });
    const e = scenario({ p1: { active: { def: evo, energy: [ignition] } }, p2: { active: dummy } });
    expect(legalActions(e.s, "p1").some((o) => o.type === "attack")).toBe(true);
    const b = scenario({ p1: { active: { def: basic, energy: [ignition] } }, p2: { active: dummy } });
    expect(legalActions(b.s, "p1").some((o) => o.type === "attack")).toBe(false);
    const ended = suggested(play(e.s, "p1", { type: "endTurn" }));
    expect(ended.pokemon[e.p1.active as string]?.energy).toHaveLength(0);
    expect(ended.players.p1?.discard.some((c) => ended.objects[c]?.defId === ignition.id)).toBe(true);
  });

  it("Legacy Energy: a Knock Out by an attack gives 1 fewer Prize card, once per game", () => {
    const legacy = card("Legacy Energy");
    const ex = pokemon({ name: "Fragile ex", hp: 50, tags: ["ex", "ruleBox"] });
    const hitter = pokemon({ name: "Hitter", attacks: [{ cost: [], damage: 100 }] });
    const { s } = scenario({
      p1: { active: hitter },
      p2: { active: { def: ex, energy: [legacy] }, bench: [{ def: ex, energy: [legacy] }, dummy] },
    });
    const first = suggested(attack(s));
    expect(first.players.p1?.prizes).toHaveLength(5);
    // Already applied once this game: the next Knock Out gives both Prize cards.
    const again = scenario({ p1: { active: hitter }, p2: { active: { def: ex, energy: [legacy] }, bench: [dummy] } });
    again.s.usedOnce.push(...first.usedOnce);
    expect(suggested(attack(again.s)).players.p1?.prizes).toHaveLength(4);
  });

  it("Team Rocket's Factory: draw 2 cards only after playing a Team Rocket's Supporter this turn", () => {
    const factory = card("Team Rocket's Factory");
    const ariana = card("Team Rocket's Ariana");
    const { s } = scenario({ p1: { active: dummy, hand: [factory, ariana] }, p2: { active: dummy } });
    let st = play(s, "p1", { type: "playTrainer", card: handOf(s, "p1", factory)[0] as string });
    expect(legalActions(st, "p1").some((o) => o.type === "stadiumAction")).toBe(false);
    st = suggested(play(st, "p1", { type: "playTrainer", card: handOf(st, "p1", ariana)[0] as string }));
    expect(legalActions(st, "p1").some((o) => o.type === "stadiumAction")).toBe(true);
  });

  it("Lumiose City: a Basic Pokémon from the deck onto the Bench, then the turn ends", () => {
    const city = card("Lumiose City");
    const { s } = scenario({ p1: { active: dummy, hand: [city], deck: [dummy, dummy] }, p2: { active: dummy } });
    let st = play(s, "p1", { type: "playTrainer", card: handOf(s, "p1", city)[0] as string });
    st = suggested(play(st, "p1", { type: "stadiumAction" }));
    expect(st.players.p1?.bench).toHaveLength(1);
    expect(st.turn.active).toBe("p2");
  });
});
