/**
 * sv06 (Twilight Masquerade; PLAN-B B14): the Standard cards finishing the set, checked against the printed text with the
 * engine's scenario helpers.
 */
import { type CardDef, type GameState, legalActions } from "@pokecircle/engine";
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
const playCard = (s: GameState, def: CardDef, p: "p1" | "p2" = "p1") =>
  play(s, p, { type: "playTrainer", card: handOf(s, p, def)[0] as string });

describe("PLAN-B B14: sv06", () => {
  it("Milotic Mentally Calm: the opponent's Pokémon and attached cards can't be put into their hand", () => {
    const milotic = card("Milotic", "Mentally Calm");
    const scoop = trainer("item", [{ op: "pokemonTo", target: "myActive", to: "hand" }], {}, "Scoop");
    const { s, p2 } = scenario({ active: "p2", p1: { active: milotic }, p2: { active: dummy, bench: [dummy], hand: [scoop] } });
    const st = settle(playCard(s, scoop, "p2"));
    expect(st.players.p2?.active).toBe(p2.active);
    const free = scenario({ active: "p2", p1: { active: dummy }, p2: { active: dummy, bench: [dummy], hand: [scoop] } });
    expect(settle(playCard(free.s, scoop, "p2")).players.p2?.active).not.toBe(free.p2.active);
  });

  it("Palafin Zero to Hero: moved to the Bench, it becomes Palafin ex from the deck, damage and Energy kept", () => {
    const palafin = card("Palafin", "Zero to Hero");
    const ex = card("Palafin ex");
    const W = E("Water");
    const { s, p1 } = scenario({
      p1: { active: { def: palafin, energy: [W, W], damage: 30 }, bench: [dummy], deck: [ex, dummy] },
      p2: { active: dummy },
    });
    const id = p1.active as string;
    const paid = (s.pokemon[id]?.energy ?? []).slice(0, palafin.retreat ?? 0);
    let st = play(s, "p1", { type: "retreat", to: p1.bench[0] as string, discard: paid });
    st = settle(st);
    const pk = st.pokemon[id];
    expect(defIds(st, pk?.cards ?? []).at(-1)).toBe(ex.id);
    expect(pk?.damage).toBe(30);
    expect(pk?.energy).toHaveLength(2 - paid.length);
    expect(defIds(st, st.players.p1?.deck ?? [])).toContain(palafin.id);
  });

  it("Jynx Inviting Kiss: an Energy moves to the Basic Pokémon put onto the Bench", () => {
    const jynx = card("Jynx", "Inviting Kiss");
    const buddy = pokemon({ name: "Buddy", hp: 70 });
    const W = E("Water");
    const { s } = scenario({ p1: { active: { def: jynx, energy: [W] }, deck: [buddy] }, p2: { active: dummy } });
    const st = settle(use(s, "Inviting Kiss"));
    const benched = st.players.p1?.bench[0] as string;
    expect(st.pokemon[benched]?.energy).toHaveLength(1);
  });

  it("Love Ball: a Pokémon with the same name as one of the opponent's", () => {
    const ball = card("Love Ball");
    const twin = pokemon({ name: "Twin", hp: 70 });
    const other = pokemon({ name: "Other", hp: 70 });
    const { s } = scenario({ p1: { active: dummy, hand: [ball], deck: [other, twin] }, p2: { active: twin } });
    const st = settle(playCard(s, ball));
    expect(defIds(st, st.players.p1?.hand ?? [])).toEqual([twin.id]);
  });

  it("Caretaker: with Community Center in play it is shuffled into the deck instead of discarded", () => {
    const caretaker = card("Caretaker");
    const center = card("Community Center");
    const { s } = scenario({
      p1: { active: dummy, hand: [center, caretaker], deck: [dummy, dummy, dummy] },
      p2: { active: dummy },
    });
    let st = playCard(s, center);
    st = settle(playCard(st, caretaker));
    expect(defIds(st, st.players.p1?.discard ?? [])).not.toContain(caretaker.id);
    expect(defIds(st, st.players.p1?.deck ?? [])).toContain(caretaker.id);
    // Community Center: a Supporter was played this turn, so each Pokémon may heal 10.
    expect(options(st).some((o) => o.type === "stadiumAction")).toBe(false); // nothing damaged
  });

  it("Survival Brace: a full-HP holder survives with 10 HP, then the Tool is discarded", () => {
    const brace = card("Survival Brace");
    const attacker = pokemon({ name: "Attacker", hp: 300, attacks: [{ name: "Hit", cost: [], damage: 200 }] });
    const { s, p1 } = scenario({
      active: "p2",
      p1: { active: { def: pokemon({ name: "Small", hp: 100 }), tools: [brace] } },
      p2: { active: attacker },
    });
    const st = settle(play(s, "p2", { type: "attack", index: 0 }));
    expect(st.pokemon[p1.active as string]?.damage).toBe(90);
    expect(defIds(st, st.players.p1?.discard ?? [])).toContain(brace.id);
  });

  it("Enhanced Hammer: discards a Special Energy from one of the opponent's Pokémon", () => {
    const hammer = card("Enhanced Hammer");
    const special = Object.values(CARDS).find((d) => d.standard && d.implemented && d.energy && !d.energy.basic) as CardDef;
    const { s, p2 } = scenario({ p1: { active: dummy, hand: [hammer] }, p2: { active: { def: dummy, energy: [special] } } });
    const st = settle(playCard(s, hammer));
    expect(st.pokemon[p2.active as string]?.energy).toHaveLength(0);
  });

  it("Lucian: both hands go to the bottom of the decks, then each player draws 6 or 3", () => {
    const lucian = card("Lucian");
    const deck = Array.from({ length: 10 }, () => dummy);
    const { s } = scenario({
      p1: { active: dummy, hand: [lucian, dummy], deck },
      p2: { active: dummy, hand: [dummy, dummy], deck },
    });
    const st = settle(playCard(s, lucian));
    expect([3, 6]).toContain(st.players.p1?.hand.length);
    expect([3, 6]).toContain(st.players.p2?.hand.length);
  });

  it("Accompanying Flute: Basic Pokémon from the top 5 of the opponent's deck onto their Bench", () => {
    const flute = card("Accompanying Flute");
    const basic = pokemon({ name: "Foe Basic", hp: 60 });
    const evo = pokemon({ name: "Foe Evo", hp: 90, stage: "stage1", evolvesFrom: "Foe Basic" });
    const { s } = scenario({
      p1: { active: dummy, hand: [flute] },
      p2: { active: dummy, deck: [basic, evo, basic, evo, evo, basic] },
    });
    const st = settle(playCard(s, flute));
    expect(st.players.p2?.bench).toHaveLength(2);
  });

  it("Sinistcha ex Re-Brew: 2 damage counters per Basic {G} Energy in the discard pile, then they go into the deck", () => {
    const sin = card("Sinistcha ex");
    const G = E("Grass");
    const { s, p2 } = scenario({ p1: { active: { def: sin, energy: [G] }, discard: [G, G, G] }, p2: { active: dummy } });
    const st = settle(use(s, "Re-Brew"));
    expect(st.pokemon[p2.active as string]?.damage).toBe(60);
    expect(st.players.p1?.discard).toHaveLength(0);
  });
});
