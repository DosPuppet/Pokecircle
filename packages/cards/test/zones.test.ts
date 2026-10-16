/**
 * Cards and zones (PLAN-B B3): the opponent's hand, the top of the deck, discard costs, Bench-only protection, checked
 * against the printed text with the engine's scenario helpers.
 */
import { type CardDef, type GameState, legalActions, ref, scope } from "@pokecircle/engine";
import { describe, expect, it } from "vitest";
import { answer, handOf, play, pokemon, scenario } from "../../engine/test/helpers";
import { CARDS } from "../src/index";

/** The implemented Standard definition of a card that has this attack or Ability. */
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
const attack = (s: GameState, index = 0) => play(s, "p1", { type: "attack", index });
/** Uses the attack with this name. */
const use = (s: GameState, name: string) => {
  const o = legalActions(s, "p1").find((x) => x.type === "attack" && x.name === name);
  if (o?.type !== "attack") throw new Error(`${name} is not usable`);
  return play(s, "p1", { type: "attack", index: o.index });
};
const usable = (s: GameState, name: string) => legalActions(s, "p1").some((o) => o.type === "attack" && o.name === name);

describe("PLAN-B B3: cards and zones", () => {
  it("Mienfoo Knock Off: a random card of the opponent's hand is discarded, with no question", () => {
    const { s } = scenario({
      p1: { active: { def: card("Mienfoo", "Knock Off"), energy: [E("Fighting")] } },
      p2: { active: dummy, hand: [dummy, dummy, dummy] },
    });
    const st = use(s, "Knock Off");
    // 3 - 1 discarded + 1 drawn at the start of the opponent's turn.
    expect(st.players.p2?.hand).toHaveLength(3);
    expect(st.players.p2?.discard).toHaveLength(1);
  });

  it("Snorunt Astonish: the random card is shuffled into the opponent's deck", () => {
    const { s } = scenario({
      p1: { active: { def: card("Snorunt", "Astonish"), energy: [E("Water"), E("Water")] } },
      p2: { active: dummy, hand: [dummy, dummy], deck: [dummy] },
    });
    const st = use(s, "Astonish");
    // One card went to the deck, then the opponent drew 1 at the start of their turn.
    expect((st.players.p2?.hand.length ?? 0) + (st.players.p2?.deck.length ?? 0)).toBe(3);
    expect(st.players.p2?.discard).toHaveLength(0);
  });

  it("Krokorok Tighten Up: the opponent chooses the 2 cards they discard", () => {
    const { s } = scenario({
      p1: { active: { def: card("Krokorok", "Tighten Up"), energy: [E("Darkness"), E("Darkness")] } },
      p2: { active: dummy, hand: [dummy, dummy, dummy] },
    });
    let st = use(s, "Tighten Up");
    expect(st.pending?.kind === "choice" && st.pending.player).toBe("p2");
    const hand = st.players.p2?.hand ?? [];
    st = answer(st, [hand[0] as string, hand[1] as string]);
    expect(st.players.p2?.discard).toEqual([hand[0], hand[1]]);
  });

  it("Iris's Fighting Spirit: only with another card to discard; then draw until 6 cards in hand", () => {
    const iris = card("Iris's Fighting Spirit");
    const alone = scenario({ p1: { active: dummy, hand: [iris], deck: Array(10).fill(dummy) }, p2: { active: dummy } });
    expect(legalActions(alone.s, "p1").some((o) => o.type === "playTrainer")).toBe(false);
    const { s } = scenario({ p1: { active: dummy, hand: [iris, dummy], deck: Array(10).fill(dummy) }, p2: { active: dummy } });
    const st = play(s, "p1", { type: "playTrainer", card: handOf(s, "p1", iris)[0] as string });
    expect(st.players.p1?.hand).toHaveLength(6);
    expect(st.players.p1?.discard).toHaveLength(2);
  });

  it("Misty's Magikarp So Submerged: no damage while on the Bench, damage as usual in the Active Spot", () => {
    const magikarp = card("Misty's Magikarp");
    const sniper = pokemon({
      name: "Sniper",
      attacks: [{ cost: [], damage: 0, effects: [{ op: "damage", to: ref.all(scope.of("opp", "any")), amount: 20 }] }],
    });
    const { s, p2 } = scenario({ p1: { active: sniper }, p2: { active: magikarp, bench: [magikarp] } });
    const st = attack(s);
    expect(st.pokemon[p2.bench[0] as string]?.damage).toBe(0);
    expect(st.pokemon[p2.active as string]?.damage).toBe(20);
  });

  it("Pyroar Intimidating Fang: attacks of the opponent's Active Pokémon do 30 less damage", () => {
    const hitter = pokemon({ name: "Hitter", attacks: [{ cost: [], damage: 100 }] });
    const { s, p2 } = scenario({ p1: { active: hitter }, p2: { active: card("Pyroar", "Intimidating Fang") } });
    expect(attack(s).pokemon[p2.active as string]?.damage).toBe(70);
  });

  it("Rockruff Dig It Up: the top card of the deck may be discarded", () => {
    const { s } = scenario({
      p1: { active: { def: card("Rockruff", "Dig It Up"), energy: [E("Fighting")] }, deck: [dummy, dummy] },
      p2: { active: dummy },
    });
    let st = use(s, "Dig It Up");
    expect(st.pending?.kind).toBe("choice");
    const top = st.players.p1?.deck[0] as string;
    st = answer(st, [top]);
    expect(st.players.p1?.discard).toContain(top);
  });

  it("R-TEXT-3b: an attack whose effect has nothing to do can still be used (Eevee Call for Family, empty deck)", () => {
    const { s } = scenario({
      p1: { active: { def: card("Eevee", "Call for Family"), energy: [E("Grass")] }, deck: [] },
      p2: { active: dummy },
    });
    expect(s.players.p1?.deck).toHaveLength(0);
    expect(usable(s, "Call for Family")).toBe(true);
  });

  it("Call Bell: only for the player who goes second, during their first turn", () => {
    const bell = card("Call Bell");
    const second = scenario({ turn: 2, p1: { active: dummy, hand: [bell], deck: [dummy] }, p2: { active: dummy } });
    second.s.turn.first = "p2";
    expect(legalActions(second.s, "p1").some((o) => o.type === "playTrainer")).toBe(true);
    const first = scenario({ turn: 1, p1: { active: dummy, hand: [bell], deck: [dummy] }, p2: { active: dummy } });
    first.s.turn.first = "p1";
    expect(legalActions(first.s, "p1").some((o) => o.type === "playTrainer")).toBe(false);
  });
});
