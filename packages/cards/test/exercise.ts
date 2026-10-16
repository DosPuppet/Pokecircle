/**
 * Exercising a card (PLAN-B B0): a generated position puts the card where it acts, each of its effects is used once
 * (each attack with its cost attached, each activated Ability, the Trainer card played on each kind of target, the
 * Special Energy attached), questions are answered with their suggestion, and the state is checked: no engine error,
 * the fuzz invariants (`checkInvariants`), a pure JSON state. It does not check that the effect is the printed one:
 * card-text tests and the program review do.
 */
import { checkInvariants } from "@pokecircle/ai";
import {
  type CardDef,
  type Decision,
  type EType,
  type GameState,
  legalActions,
  type PlayerId,
  RulesError,
  submit,
} from "@pokecircle/engine";
import { energy, pokemon, type SideSetup, type Slot, scenario, trainer } from "../../engine/test/helpers";
import { CARDS } from "../src/index";

const TYPES = ["G", "R", "W", "L", "P", "F", "D", "M"] as const;
const basicEnergy = (t: string): CardDef =>
  Object.values(CARDS).find((d) => d.energy?.basic && d.energy.provides[0]?.[0] === t) ?? energy(t as EType);

const filler = pokemon({ name: "Filler", hp: 120, types: ["C"], retreat: 1, attacks: [{ name: "Tap", cost: [], damage: 10 }] });
const fillerStage1 = pokemon({ name: "Filler Evolved", hp: 150, stage: "stage1", evolvesFrom: "Filler" });
const target = pokemon({ name: "Target", hp: 300, types: ["C"], retreat: 2 });
const item = trainer("item", [], {}, "Spare Item");
const tool = trainer("tool", [], {}, "Spare Tool");

/** Energy paying a cost (Colorless with the card's own type). */
function payFor(def: CardDef, cost: string[]): CardDef[] {
  const own = def.types?.find((t) => (TYPES as readonly string[]).includes(t)) ?? "P";
  return cost.map((c) => basicEnergy(c === "C" ? own : c));
}

/** The position: the player has varied cards everywhere (searches, discards and Bench effects find something). */
function position(me: SideSetup): GameState {
  const deck = [filler, filler, fillerStage1, item, tool, ...TYPES.map(basicEnergy), filler, item, basicEnergy("P"), filler];
  return scenario({
    p1: {
      bench: [
        { def: filler, damage: 30 },
        { def: filler, energy: [basicEnergy("P")] },
      ],
      hand: [filler, basicEnergy("R"), basicEnergy("W"), item, fillerStage1],
      deck,
      discard: [basicEnergy("G"), basicEnergy("L"), filler, item],
      ...me,
    },
    p2: {
      active: { def: target, energy: [basicEnergy("F"), basicEnergy("D")], tools: [tool], damage: 20 },
      bench: [{ def: filler, damage: 10 }, filler],
      hand: [filler, item, basicEnergy("M")],
      deck,
      discard: [basicEnergy("W"), filler],
    },
  }).s;
}

const settle = (s: GameState): GameState => {
  for (let i = 0; i < 60 && s.pending?.kind === "choice" && !s.over; i++)
    s = submit(s, s.pending.player, { type: "choose", values: s.pending.request.suggested }).state;
  return s;
};

const countCards = (s: GameState): Record<PlayerId, number> => {
  const out: Record<PlayerId, number> = {};
  for (const o of Object.values(s.objects)) out[o.owner] = (out[o.owner] ?? 0) + 1;
  return out;
};

export interface Exercise {
  /** What was tried ("attack 0", "Ability 1", "play", "attach"…). */
  tried: string[];
  errors: string[];
}

/** Uses every effect of a card once; returns what was tried and what went wrong. */
export function exercise(def: CardDef): Exercise {
  const out: Exercise = { tried: [], errors: [] };
  const run = (label: string, start: GameState, pick: (s: GameState) => Decision | null) => {
    let s = settle(start);
    const counts = countCards(s);
    const d = pick(s);
    if (!d) return;
    out.tried.push(label);
    try {
      s = settle(submit(s, "p1", d).state);
      const inv = checkInvariants(s, counts);
      if (inv.length) out.errors.push(`${label}: ${inv.join("; ")}`);
      if (JSON.stringify(JSON.parse(JSON.stringify(s.pokemon))) !== JSON.stringify(s.pokemon))
        out.errors.push(`${label}: state is not pure JSON`);
    } catch (e) {
      out.errors.push(`${label}: ${e instanceof RulesError ? "offered but refused" : "engine error"}: ${(e as Error).message}`);
    }
  };
  if (def.category === "pokemon") {
    const below: CardDef[] = def.stage === "basic" ? [] : def.stage === "stage1" ? [filler] : [filler, fillerStage1];
    for (const [i, a] of (def.attacks ?? []).entries()) {
      const slot: Slot = { def, below, energy: payFor(def, a.cost) };
      run(`attack ${i}`, position({ active: slot }), (s) =>
        legalActions(s, "p1").some((o) => o.type === "attack" && o.index === i && !o.source)
          ? { type: "attack", index: i }
          : null,
      );
    }
    for (const [i] of (def.abilities ?? []).entries()) {
      const energyAll = payFor(def, ["C", "C"]);
      for (const where of ["active", "bench"] as const) {
        const slot: Slot = { def, below, energy: energyAll };
        const me: SideSetup = where === "active" ? { active: slot } : { active: filler, bench: [slot, filler] };
        run(`Ability ${i} (${where})`, position(me), (s) => {
          const o = legalActions(s, "p1").find((x) => x.type === "useAbility" && x.ability === i);
          return o?.type === "useAbility" ? { type: "useAbility", pokemon: o.pokemon, ability: i } : null;
        });
      }
    }
    // Played from the hand: put onto the Bench (a Basic) or evolving (triggers "when you play this Pokémon").
    run("play", position({ active: { def: filler }, bench: [filler], hand: [def, ...below] }), (s) => {
      const card = (s.players.p1?.hand ?? []).find((c) => s.objects[c]?.defId === def.id);
      const o = legalActions(s, "p1").find((x) => "card" in x && x.card === card);
      if (o?.type === "playBasic") return { type: "playBasic", card: o.card };
      if (o?.type === "evolve" && o.targets[0]) return { type: "evolve", card: o.card, target: o.targets[0] };
      return null;
    });
  } else {
    // A Trainer card or a Special Energy, played on each kind of target it offers.
    const me: SideSetup = {
      active: { def: filler, energy: [basicEnergy("P"), basicEnergy("G")], damage: 40 },
      hand: [def, filler, item, basicEnergy("R")],
    };
    run("play", position(me), (s) => {
      const card = (s.players.p1?.hand ?? []).find((c) => s.objects[c]?.defId === def.id);
      const o = legalActions(s, "p1").find((x) => "card" in x && x.card === card);
      if (!o) return null;
      if (o.type === "playTrainer")
        return o.targets
          ? { type: "playTrainer", card: o.card, target: o.targets[0] as string }
          : { type: "playTrainer", card: o.card };
      if (o.type === "attachEnergy" && o.targets[0]) return { type: "attachEnergy", card: o.card, target: o.targets[0] };
      // A Trainer card played as a Pokémon (Fossils).
      if (o.type === "playBasic") return { type: "playBasic", card: o.card };
      return null;
    });
    if (def.trainer?.discardFromPlay)
      run("discard from play", position({ active: { def: filler }, bench: [{ def }] }), (s) => {
        const o = legalActions(s, "p1").find((x) => x.type === "discardFromPlay");
        return o?.type === "discardFromPlay" ? { type: "discardFromPlay", pokemon: o.pokemon } : null;
      });
    // A Stadium's action and a Tool's attacks once in play.
    if (def.trainer?.stadiumAction || def.trainer?.attacks?.length) out.tried.push("(in play: not exercised)");
  }
  return out;
}
