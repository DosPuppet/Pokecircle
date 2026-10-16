/**
 * Staged positions: a board built directly (no setup), with the active player's main phase pending. Used by the rules
 * tests (`engine/test/helpers.ts`) and the tutorial's lessons. Cards are given by definition id.
 */
import { blankState } from "./game";
import { createPokemon, newId } from "./state";
import { advance } from "./turn";
import type { CardDef, GameState, PlayerId, PokemonId } from "./types";

/** A Pokémon in play: its card, with what is attached and below it. */
export interface SlotSpec {
  def: string;
  energy?: string[];
  tools?: string[];
  /** Evolution stack below (Basic first). */
  below?: string[];
  damage?: number;
  cond?: GameState["pokemon"][string]["cond"];
  /** Turn it was put into play (default: before this turn). */
  entered?: number;
}

export interface SideSpec {
  active?: string | SlotSpec;
  bench?: (string | SlotSpec)[];
  hand?: string[];
  /** Default: 10 filler cards, so that the next turns can draw. */
  deck?: string[];
  discard?: string[];
  /** Prize cards left (default 6, filler cards). */
  prizes?: number;
}

export interface ScenarioSpec {
  p1?: SideSpec;
  p2?: SideSpec;
  /** Player names (default Alice and Bob). */
  names?: [string, string];
  turn?: number;
  active?: PlayerId;
  first?: PlayerId;
  seed?: number;
  /** Definition of the filler cards (default deck and Prize cards). */
  filler: string;
}

export interface BuiltScenario {
  s: GameState;
  /** Pokémon ids: `active` and `bench` of each player. */
  p1: { active: PokemonId | null; bench: PokemonId[] };
  p2: { active: PokemonId | null; bench: PokemonId[] };
}

const slotOf = (x: string | SlotSpec): SlotSpec => (typeof x === "string" ? { def: x } : x);

export function buildScenario(spec: ScenarioSpec, defs: Record<string, CardDef>): BuiltScenario {
  const [n1, n2] = spec.names ?? ["Alice", "Bob"];
  const s = blankState(spec.seed ?? 1, [
    { id: "p1", name: n1 },
    { id: "p2", name: n2 },
  ]);
  s.turn.number = spec.turn ?? 3;
  s.turn.active = spec.active ?? "p1";
  s.turn.first = spec.first ?? "p1";
  s.flow = "main";
  s.setup.step = "done";
  const out: BuiltScenario = { s, p1: { active: null, bench: [] }, p2: { active: null, bench: [] } };
  const card = (p: PlayerId, defId: string, zone: GameState["objects"][string]["zone"]) => {
    const def = defs[defId];
    if (!def) throw new Error(`scenario: unknown card ${defId}`);
    s.defs[defId] = def;
    const id = newId(s, "c");
    s.objects[id] = { id, defId, owner: p, zone };
    return id;
  };
  for (const p of ["p1", "p2"] as const) {
    const side = spec[p] ?? {};
    const ps = s.players[p];
    if (!ps) continue;
    const place = (x: string | SlotSpec): PokemonId => {
      const sl = slotOf(x);
      const stack = [...(sl.below ?? []), sl.def];
      const first = card(p, stack[0] as string, "hand");
      ps.hand.push(first);
      const id = createPokemon(s, first);
      const pk = s.pokemon[id];
      if (!pk) throw new Error("scenario: no Pokémon");
      const attach = (defId: string, as: "cards" | "energy" | "tools") => {
        const c = card(p, defId, "inPlay");
        (s.objects[c] as GameState["objects"][string]).host = id;
        pk[as].push(c);
      };
      for (const d of stack.slice(1)) attach(d, "cards");
      for (const d of sl.energy ?? []) attach(d, "energy");
      for (const d of sl.tools ?? []) attach(d, "tools");
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
    for (const d of side.deck ?? Array<string>(10).fill(spec.filler)) ps.deck.push(card(p, d, "deck"));
    for (const d of side.discard ?? []) ps.discard.push(card(p, d, "discard"));
    for (let i = 0; i < (side.prizes ?? 6); i++) ps.prizes.push(card(p, spec.filler, "prizes"));
  }
  advance(s);
  return out;
}
