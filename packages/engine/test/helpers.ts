/**
 * Test scenarios: synthetic card definitions and boards built directly (no setup), with the active player's main
 * phase pending.
 */
import {
  type BuiltScenario,
  buildScenario,
  type GameState,
  type ScenarioSpec,
  type SideSpec,
  type SlotSpec,
  submit,
} from "../src/index";
import type { AttackDef, CardDef, Decision, Effect, EType, PlayerId, TrainerKind } from "../src/types";

let n = 0;

export function pokemon(p: Partial<Omit<CardDef, "attacks">> & { name?: string; attacks?: Partial<AttackDef>[] } = {}): CardDef {
  const name = p.name ?? `Mon${++n}`;
  const { attacks, ...rest } = p;
  return {
    id: `${name.toLowerCase().replace(/\W+/g, "-")}-${++n}`,
    name,
    copyName: name,
    category: "pokemon",
    tags: [],
    text: { en: { name } },
    standard: true,
    implemented: true,
    print: "test",
    hp: 100,
    types: ["C"],
    stage: "basic",
    retreat: 1,
    ...rest,
    attacks: (attacks ?? []).map((a): AttackDef => ({ ...a, name: a.name ?? "Hit", cost: a.cost ?? [], damage: a.damage ?? 0 })),
  };
}

export function trainer(
  kind: TrainerKind,
  effects: Effect[] = [],
  extra: Partial<CardDef["trainer"]> = {},
  name?: string,
): CardDef {
  const nm = name ?? `Trainer${++n}`;
  return {
    id: `${nm.toLowerCase().replace(/\W+/g, "-")}-${++n}`,
    name: nm,
    copyName: nm,
    category: "trainer",
    tags: [],
    text: { en: { name: nm } },
    standard: true,
    implemented: true,
    print: "test",
    trainer: { kind, effects, ...extra },
  };
}

export function energy(type: EType = "C", provides?: string[][], extra: Partial<CardDef["energy"]> = {}): CardDef {
  const basic = !provides;
  const nm = basic ? `Basic ${type} Energy` : `Special Energy ${++n}`;
  return {
    id: basic ? `basic-${type}` : `special-${n}`,
    name: nm,
    copyName: nm,
    category: "energy",
    tags: [],
    text: { en: { name: nm } },
    standard: true,
    implemented: true,
    print: "test",
    energy: { basic, provides: provides ?? [[type]], ...extra },
  };
}

/** A Pokémon in a scenario: its card, with what is attached and below it. */
export interface Slot {
  def: CardDef;
  energy?: CardDef[];
  tools?: CardDef[];
  /** Evolution stack below (Basic first). */
  below?: CardDef[];
  damage?: number;
  cond?: GameState["pokemon"][string]["cond"];
  /** Turn it was put into play (default: before this turn). */
  entered?: number;
}

export interface SideSetup {
  active?: CardDef | Slot;
  bench?: (CardDef | Slot)[];
  hand?: CardDef[];
  deck?: CardDef[];
  discard?: CardDef[];
  /** Prize cards left (default 6, filled from a filler card). */
  prizes?: number;
}

const FILLER = energy("C", [["C"]]);

export type Scenario = BuiltScenario;

/** A staged position from card definitions (`buildScenario` with their ids). */
export function scenario(opts: {
  p1?: SideSetup;
  p2?: SideSetup;
  turn?: number;
  active?: PlayerId;
  first?: PlayerId;
  seed?: number;
}): Scenario {
  const defs: Record<string, CardDef> = { [FILLER.id]: FILLER };
  const id = (d: CardDef) => {
    defs[d.id] = d;
    return d.id;
  };
  const slot = (x: CardDef | Slot): SlotSpec => {
    if (!("def" in x)) return { def: id(x) };
    const out: SlotSpec = { def: id(x.def) };
    if (x.energy) out.energy = x.energy.map(id);
    if (x.tools) out.tools = x.tools.map(id);
    if (x.below) out.below = x.below.map(id);
    if (x.damage !== undefined) out.damage = x.damage;
    if (x.cond) out.cond = x.cond;
    if (x.entered !== undefined) out.entered = x.entered;
    return out;
  };
  const side = (x: SideSetup | undefined): SideSpec | undefined => {
    if (!x) return undefined;
    const out: SideSpec = {};
    if (x.active) out.active = slot(x.active);
    if (x.bench) out.bench = x.bench.map(slot);
    if (x.hand) out.hand = x.hand.map(id);
    if (x.deck) out.deck = x.deck.map(id);
    if (x.discard) out.discard = x.discard.map(id);
    if (x.prizes !== undefined) out.prizes = x.prizes;
    return out;
  };
  const spec: ScenarioSpec = { filler: FILLER.id };
  const p1 = side(opts.p1);
  const p2 = side(opts.p2);
  if (p1) spec.p1 = p1;
  if (p2) spec.p2 = p2;
  if (opts.turn !== undefined) spec.turn = opts.turn;
  if (opts.active) spec.active = opts.active;
  if (opts.first) spec.first = opts.first;
  if (opts.seed !== undefined) spec.seed = opts.seed;
  return buildScenario(spec, defs);
}

/** Submits a decision and returns the new state (throws on an illegal decision). */
export function play(s: GameState, p: PlayerId, d: Decision): GameState {
  return submit(s, p, d).state;
}

/** Cards in a player's hand with a definition. */
export function handOf(s: GameState, p: PlayerId, def: CardDef): string[] {
  return (s.players[p]?.hand ?? []).filter((c) => s.objects[c]?.defId === def.id);
}

/** Answers the pending question with given values. */
export function answer(s: GameState, values: (string | number)[]): GameState {
  const p = s.pending;
  if (p?.kind !== "choice") throw new Error(`no question pending (${p?.kind})`);
  return play(s, p.player, { type: "choose", values });
}

/** Answers every pending question with its suggested answer until the main phase (or the end). */
export function suggestAll(s: GameState, limit = 50): GameState {
  for (let i = 0; i < limit && s.pending?.kind === "choice"; i++) s = answer(s, s.pending.request.suggested);
  return s;
}
