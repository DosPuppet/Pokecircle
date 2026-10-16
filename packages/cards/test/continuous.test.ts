/**
 * Continuous effects (PLAN-B B4): the static grammar of Abilities, Tools, Stadiums and Special Energy, Fossils, first-turn
 * exceptions, checked against the printed text with the engine's scenario helpers.
 */
import { type CardDef, chars, type GameState, legalActions } from "@pokecircle/engine";
import { describe, expect, it } from "vitest";
import { answer, handOf, play, pokemon, scenario } from "../../engine/test/helpers";
import { CARDS } from "../src/index";

/** The implemented Standard definition of a card, optionally the one with this attack or Ability. */
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
const hitter = (damage: number, types: CardDef["types"] = ["C"]) =>
  pokemon({ name: "Hitter", hp: 300, types, attacks: [{ cost: [], damage }] });
const attack = (s: GameState) => play(s, "p1", { type: "attack", index: 0 });
const options = (s: GameState, p: "p1" | "p2" = "p1") => legalActions(s, p);

describe("PLAN-B B4: continuous effects", () => {
  it("Pikachu ex Resolute Heart: at full HP, a Knock Out by attack damage leaves it at 10 HP; damaged, it is Knocked Out", () => {
    const pika = card("Pikachu ex", "Resolute Heart");
    const full = scenario({ p1: { active: hitter(500) }, p2: { active: pika, bench: [dummy] } });
    const st = attack(full.s);
    expect(st.pokemon[full.p2.active as string]?.damage).toBe((chars(st, full.p2.active as string).hp ?? 0) - 10);
    const hurt = scenario({ p1: { active: hitter(500) }, p2: { active: { def: pika, damage: 10 }, bench: [dummy] } });
    expect(attack(hurt.s).pokemon[hurt.p2.active as string]).toBeUndefined();
  });

  it("Occa Berry: 60 less damage from an attack of a {R} Pokémon, then the Berry is discarded; nothing against {W}", () => {
    const berry = card("Occa Berry");
    const fire = scenario({ p1: { active: hitter(100, ["R"]) }, p2: { active: { def: dummy, tools: [berry] } } });
    const st = attack(fire.s);
    expect(st.pokemon[fire.p2.active as string]?.damage).toBe(40);
    expect(st.pokemon[fire.p2.active as string]?.tools).toHaveLength(0);
    expect(st.players.p2?.discard.some((c) => st.objects[c]?.defId === berry.id)).toBe(true);
    const water = scenario({ p1: { active: hitter(100, ["W"]) }, p2: { active: { def: dummy, tools: [berry] } } });
    const sw = attack(water.s);
    expect(sw.pokemon[water.p2.active as string]?.damage).toBe(100);
    expect(sw.pokemon[water.p2.active as string]?.tools).toHaveLength(1);
  });

  it("Ludicolo Vibrant Dance: +40 HP to all of your Pokémon, and the effect doesn't stack", () => {
    const ludicolo = card("Ludicolo", "Vibrant Dance");
    const plain = pokemon({ name: "Plain", hp: 100 });
    const { s, p1 } = scenario({ p1: { active: plain, bench: [ludicolo, ludicolo] }, p2: { active: dummy } });
    expect(chars(s, p1.active as string).hp).toBe(140);
  });

  it("Flutter Mane Midnight Fluttering: in the Active Spot, the opponent's Active Pokémon has no Abilities", () => {
    const mane = card("Flutter Mane", "Midnight Fluttering");
    const ludicolo = card("Ludicolo", "Vibrant Dance");
    const active = scenario({ p1: { active: mane }, p2: { active: ludicolo } });
    expect(chars(active.s, active.p2.active as string).abilities).toHaveLength(0);
    const benched = scenario({ p1: { active: dummy, bench: [mane] }, p2: { active: ludicolo } });
    expect(chars(benched.s, benched.p2.active as string).abilities).toHaveLength(1);
  });

  it("Magmortar Magma Surge: 3 more damage counters on the opponent's Burned Pokémon during Pokémon Checkup", () => {
    const { s, p2 } = scenario({
      p1: { active: card("Magmortar", "Magma Surge") },
      p2: { active: { def: dummy, cond: { burned: true } } },
    });
    const st = play(s, "p1", { type: "endTurn" });
    expect(st.pokemon[p2.active as string]?.damage).toBe(50);
  });

  it("Hoothoot Insomnia: it can't be Asleep, but can be Confused", () => {
    const owl = card("Hoothoot", "Insomnia");
    const sleeper = pokemon({
      name: "Sleeper",
      attacks: [
        { cost: [], damage: 0, effects: [{ op: "condition", target: "defending", cond: "asleep" }] },
        { cost: [], damage: 0, effects: [{ op: "condition", target: "defending", cond: "confused" }] },
      ],
    });
    const a = scenario({ p1: { active: sleeper }, p2: { active: owl } });
    expect(play(a.s, "p1", { type: "attack", index: 0 }).pokemon[a.p2.active as string]?.cond.rotating).toBeUndefined();
    const b = scenario({ p1: { active: sleeper }, p2: { active: owl } });
    expect(play(b.s, "p1", { type: "attack", index: 1 }).pokemon[b.p2.active as string]?.cond.rotating).toBe("confused");
  });

  it("Drednaw Impervious Shell: damage of 200 or more is prevented, less is not", () => {
    const drednaw = card("Drednaw", "Impervious Shell");
    const big = scenario({ p1: { active: hitter(200) }, p2: { active: drednaw } });
    expect(attack(big.s).pokemon[big.p2.active as string]?.damage).toBe(0);
    const small = scenario({ p1: { active: hitter(90) }, p2: { active: drednaw } });
    expect(attack(small.s).pokemon[small.p2.active as string]?.damage).toBe(90);
  });

  it("Prism Energy provides every type to a Basic Pokémon only (1 Energy)", () => {
    const prism = card("Prism Energy");
    const cost = { cost: ["P" as const], damage: 10 };
    const basic = pokemon({ name: "Base", attacks: [cost] });
    const evo = pokemon({ name: "Evo", stage: "stage1", attacks: [cost] });
    const a = scenario({ p1: { active: { def: basic, energy: [prism] } }, p2: { active: dummy } });
    expect(options(a.s).some((o) => o.type === "attack")).toBe(true);
    const b = scenario({ p1: { active: { def: evo, energy: [prism] } }, p2: { active: dummy } });
    expect(options(b.s).some((o) => o.type === "attack")).toBe(false);
  });

  it("Reversal Energy: every type, 3 Energy, on an Evolution Pokémon without a Rule Box only when behind on Prize cards", () => {
    const reversal = card("Reversal Energy");
    const evo = pokemon({ name: "Evo", stage: "stage1", attacks: [{ cost: ["F", "F", "F"], damage: 10 }] });
    const behind = scenario({ p1: { active: { def: evo, energy: [reversal] }, prizes: 6 }, p2: { active: dummy, prizes: 3 } });
    expect(options(behind.s).some((o) => o.type === "attack")).toBe(true);
    const ahead = scenario({ p1: { active: { def: evo, energy: [reversal] }, prizes: 3 }, p2: { active: dummy, prizes: 6 } });
    expect(options(ahead.s).some((o) => o.type === "attack")).toBe(false);
  });

  it("R-FOSSIL-1, R-FOSSIL-3: Antique Cover Fossil: played onto the Bench as a 60-HP Basic Pokémon (an Item), can't retreat, may be discarded from play", () => {
    const fossil = card("Antique Cover Fossil");
    const { s } = scenario({ p1: { active: dummy, hand: [fossil] }, p2: { active: dummy } });
    const c = handOf(s, "p1", fossil)[0] as string;
    expect(options(s).some((o) => o.type === "playBasic" && o.card === c)).toBe(true);
    expect(options(s).some((o) => o.type === "playTrainer" && o.card === c)).toBe(false);
    let st = play(s, "p1", { type: "playBasic", card: c });
    const id = st.players.p1?.bench[0] as string;
    expect(chars(st, id).hp).toBe(60);
    expect(st.turnLog.some((e) => e.kind === "itemPlayed" && e.defId === fossil.id)).toBe(true);
    expect(options(st).some((o) => o.type === "discardFromPlay" && o.pokemon === id)).toBe(true);
    st = play(st, "p1", { type: "discardFromPlay", pokemon: id });
    expect(st.players.p1?.bench).toHaveLength(0);
    expect(st.players.p1?.discard.some((x) => st.objects[x]?.defId === fossil.id)).toBe(true);
  });

  it("R-FOSSIL-1, R-FOSSIL-2: Antique Cover Fossil: an Item lock stops it; in the Active Spot it can't retreat; Tirtouga evolves from it", () => {
    const fossil = card("Antique Cover Fossil");
    const locked = scenario({ p1: { active: dummy, hand: [fossil] }, p2: { active: card("Tyranitar", "Daunting Gaze") } });
    expect(options(locked.s).some((o) => o.type === "playBasic")).toBe(false);
    const tirtouga = Object.values(CARDS).find((x) => x.name === "Tirtouga" && x.standard && x.implemented) as CardDef;
    const { s, p1 } = scenario({
      turn: 3,
      p1: { active: { def: fossil, entered: 1, energy: [E("Water")] }, bench: [dummy], hand: [tirtouga] },
      p2: { active: dummy },
    });
    expect(options(s).some((o) => o.type === "retreat")).toBe(false);
    expect(options(s).some((o) => o.type === "evolve" && o.targets.includes(p1.active as string))).toBe(true);
  });

  it("Carmine: the player who goes first may play it during their first turn", () => {
    const carmine = card("Carmine");
    const { s } = scenario({
      turn: 1,
      first: "p1",
      p1: { active: dummy, hand: [carmine], deck: [dummy] },
      p2: { active: dummy },
    });
    expect(options(s).some((o) => o.type === "playTrainer")).toBe(true);
  });

  it("Fossil Quarry: up to 2 Antique Item cards from the deck onto the Bench", () => {
    const quarry = card("Fossil Quarry");
    const fossil = card("Antique Cover Fossil");
    const { s } = scenario({ p1: { active: dummy, hand: [quarry], deck: [fossil, fossil, dummy] }, p2: { active: dummy } });
    let st = play(s, "p1", { type: "playTrainer", card: handOf(s, "p1", quarry)[0] as string });
    st = play(st, "p1", { type: "stadiumAction" });
    const fossils = (st.players.p1?.deck ?? []).filter((c) => st.objects[c]?.defId === fossil.id);
    st = answer(st, fossils);
    expect(st.players.p1?.bench).toHaveLength(2);
  });
});
