/**
 * Test scenarios: synthetic card definitions and boards built directly (no setup), with the active player's main
 * phase pending.
 */
import { advance, blankState, createPokemon, type GameState, newId, submit } from "../src/index";
import type { AttackDef, CardDef, Decision, Effect, EType, PlayerId, PokemonId, TrainerKind } from "../src/types";

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

const slotOf = (x: CardDef | Slot): Slot => ("def" in x ? x : { def: x });

export interface Scenario {
  s: GameState;
  /** Pokémon ids: `active` and `bench` of each player. */
  p1: { active: PokemonId | null; bench: PokemonId[] };
  p2: { active: PokemonId | null; bench: PokemonId[] };
}

export function scenario(opts: {
  p1?: SideSetup;
  p2?: SideSetup;
  turn?: number;
  active?: PlayerId;
  first?: PlayerId;
  seed?: number;
}): Scenario {
  const s = blankState(opts.seed ?? 1, [
    { id: "p1", name: "Alice" },
    { id: "p2", name: "Bob" },
  ]);
  s.turn.number = opts.turn ?? 3;
  s.turn.active = opts.active ?? "p1";
  s.turn.first = opts.first ?? "p1";
  s.flow = "main";
  s.setup.step = "done";
  const out: Scenario = { s, p1: { active: null, bench: [] }, p2: { active: null, bench: [] } };
  const card = (p: PlayerId, def: CardDef, zone: GameState["objects"][string]["zone"]) => {
    s.defs[def.id] = def;
    const id = newId(s, "c");
    s.objects[id] = { id, defId: def.id, owner: p, zone };
    return id;
  };
  for (const p of ["p1", "p2"] as const) {
    const side = opts[p] ?? {};
    const ps = s.players[p];
    if (!ps) continue;
    const place = (x: CardDef | Slot): PokemonId => {
      const sl = slotOf(x);
      const stack = [...(sl.below ?? []), sl.def];
      const first = card(p, stack[0] as CardDef, "hand");
      ps.hand.push(first);
      const id = createPokemon(s, first);
      const pk = s.pokemon[id];
      if (!pk) throw new Error("no Pokémon");
      for (const d of stack.slice(1)) {
        const c = card(p, d, "inPlay");
        s.objects[c] = { ...(s.objects[c] as GameState["objects"][string]), host: id };
        pk.cards.push(c);
      }
      for (const d of sl.energy ?? []) {
        const c = card(p, d, "inPlay");
        (s.objects[c] as GameState["objects"][string]).host = id;
        pk.energy.push(c);
      }
      for (const d of sl.tools ?? []) {
        const c = card(p, d, "inPlay");
        (s.objects[c] as GameState["objects"][string]).host = id;
        pk.tools.push(c);
      }
      pk.damage = sl.damage ?? 0;
      pk.cond = sl.cond ?? {};
      pk.enteredTurn = sl.entered ?? 0;
      return id;
    };
    if (side.active) {
      ps.active = place(side.active);
      out[p].active = ps.active;
    }
    for (const b of side.bench ?? []) {
      const id = place(b);
      ps.bench.push(id);
      out[p].bench.push(id);
    }
    for (const d of side.hand ?? []) ps.hand.push(card(p, d, "hand"));
    // Default: a few filler cards, so that the next turns can draw.
    for (const d of side.deck ?? Array<CardDef>(10).fill(FILLER)) ps.deck.push(card(p, d, "deck"));
    for (const d of side.discard ?? []) ps.discard.push(card(p, d, "discard"));
    for (let i = 0; i < (side.prizes ?? 6); i++) ps.prizes.push(card(p, FILLER, "prizes"));
  }
  advance(s);
  return out;
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
