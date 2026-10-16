/**
 * Continuous rules in force and computed characteristics (`chars`), cached by state and `version`.
 *
 * Sources: Abilities of Pokémon in play, Tools and Energy attached, the Stadium, timed effects. Ability locks
 * (`noAbilities`) are computed first from every source; the Abilities they lock then contribute nothing.
 */
import { evalAmount, evalCond, staticCtx } from "./effects";
import { inScope, matchCard, scopePokemon } from "./match";
import { allInPlay, defOf, obj, opponentOf, pokemonOf, topDef } from "./state";
import type {
  AbilityDef,
  AttackDef,
  CardDef,
  CardTag,
  EType,
  GameState,
  ObjectId,
  PlayerId,
  PokemonId,
  Stage,
  StaticRule,
} from "./types";

export interface ActiveStatic {
  rule: StaticRule;
  /** The player the rule's sides are relative to. */
  owner: PlayerId;
  /** The scope's "self": the Pokémon with the Ability, or holding the Tool or Energy. */
  source: PokemonId | null;
  defId: string;
  kind: "ability" | "tool" | "energy" | "stadium" | "timed" | "card";
  /** The Tool or Energy card giving the rule. */
  card?: ObjectId;
}

export interface AttackOption {
  index: number;
  def: AttackDef;
  /** The card giving the attack (a Tool). */
  source?: ObjectId;
  /** Cost after modifiers. */
  cost: EType[];
}

export interface Chars {
  name: string;
  hp: number;
  types: EType[];
  stage: Stage;
  tags: CardTag[];
  weakness?: { type: EType; mult: number };
  resistance?: { type: EType; amount: number };
  retreat: number;
  /** Abilities in force (indices into the definition's abilities). */
  abilities: number[];
  attacks: AttackOption[];
}

interface Cache {
  version: number;
  statics: ActiveStatic[];
  chars: Map<PokemonId, Chars>;
}

const caches = new WeakMap<GameState, Cache>();
let collecting = false;

function cacheOf(s: GameState): Cache {
  let c = caches.get(s);
  if (!c || c.version !== s.version) {
    c = { version: s.version, statics: [], chars: new Map() };
    caches.set(s, c);
    c.statics = collect(s);
  }
  return c;
}

const rawCaches = new WeakMap<GameState, { version: number; raw: ActiveStatic[] }>();

/** Every rule from every source, before locks and conditions (cached by state version). */
function rawStatics(s: GameState): ActiveStatic[] {
  const c = rawCaches.get(s);
  if (c && c.version === s.version) return c.raw;
  const raw = collectRaw(s);
  rawCaches.set(s, { version: s.version, raw });
  return raw;
}

/** Jamming Tower: "Pokémon Tools attached to each Pokémon (both yours and your opponent's) have no effect." */
export function toolsOff(s: GameState): boolean {
  return !!s.stadium && !!defOf(s, s.stadium).trainer?.statics?.some((r) => r.s === "noTools");
}

function collectRaw(s: GameState): ActiveStatic[] {
  const out: ActiveStatic[] = [];
  const noTools = toolsOff(s);
  for (const id of allInPlay(s)) {
    const pk = pokemonOf(s, id);
    const d = topDef(s, id);
    for (const a of d.abilities ?? [])
      for (const rule of a.statics ?? []) out.push({ rule, owner: pk.owner, source: id, defId: d.id, kind: "ability" });
    // A Trainer card in play as a Pokémon (Fossils): its own rules.
    if (d.trainer?.asPokemon)
      for (const rule of d.trainer.statics ?? []) out.push({ rule, owner: pk.owner, source: id, defId: d.id, kind: "card" });
    for (const t of noTools ? [] : pk.tools) {
      const td = defOf(s, t);
      for (const rule of td.trainer?.statics ?? [])
        out.push({ rule, owner: pk.owner, source: id, defId: td.id, kind: "tool", card: t });
    }
    for (const e of pk.energy) {
      const ed = defOf(s, e);
      for (const rule of ed.energy?.statics ?? [])
        out.push({ rule, owner: pk.owner, source: id, defId: ed.id, kind: "energy", card: e });
    }
  }
  if (s.stadium) {
    const sd = defOf(s, s.stadium);
    for (const rule of sd.trainer?.statics ?? [])
      out.push({ rule, owner: obj(s, s.stadium).owner, source: null, defId: sd.id, kind: "stadium" });
  }
  for (const e of s.effects)
    if (e.fromTurn <= s.turn.number && s.turn.number <= e.untilTurn)
      out.push({ rule: e.rule, owner: e.player, source: null, defId: e.defId, kind: "timed" });
  return out;
}

function holds(s: GameState, st: ActiveStatic): boolean {
  return !st.rule.cond || evalCond(s, staticCtx(st.owner, st.source), st.rule.cond);
}

function collect(s: GameState): ActiveStatic[] {
  if (collecting) return [];
  collecting = true;
  try {
    const raw = rawStatics(s).filter((st) => holds(s, st));
    const locks = raw.filter((st) => st.rule.s === "noAbilities");
    const locked = (id: PokemonId) =>
      locks.some((l) => l.rule.s === "noAbilities" && inScope(s, l.rule.scope, l.owner, l.source, id));
    const seen = new Set<string>();
    return raw.filter((st) => {
      if (st.kind === "ability" && st.source && locked(st.source)) return false;
      if (!st.rule.noStack) return true;
      const key = `${st.owner}:${st.rule.noStack}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  } finally {
    collecting = false;
  }
}

/** The rules in force. */
export function statics(s: GameState): ActiveStatic[] {
  return cacheOf(s).statics;
}

/** The rules of a kind in force. */
export function rulesOf<K extends StaticRule["s"]>(
  s: GameState,
  k: K,
): (ActiveStatic & { rule: Extract<StaticRule, { s: K }> })[] {
  return statics(s).filter((st) => st.rule.s === k) as (ActiveStatic & { rule: Extract<StaticRule, { s: K }> })[];
}

/** Rules of a kind whose scope contains a Pokémon. */
export function rulesOn<K extends Exclude<StaticRule["s"], "cantPlay">>(
  s: GameState,
  k: K,
  id: PokemonId,
): (ActiveStatic & { rule: Extract<StaticRule, { s: K }> })[] {
  return rulesOf(s, k).filter((st) => {
    const scope = "scope" in st.rule ? st.rule.scope : undefined;
    return !!scope && inScope(s, scope, st.owner, st.source, id);
  });
}

/** Are the Abilities of a Pokémon locked? */
export function abilitiesLocked(s: GameState, id: PokemonId): boolean {
  return rawStatics(s).some(
    (st) => st.rule.s === "noAbilities" && holds(s, st) && inScope(s, st.rule.scope, st.owner, st.source, id),
  );
}

function compute(s: GameState, id: PokemonId): Chars {
  const pk = pokemonOf(s, id);
  const d = topDef(s, id);
  const c: Chars = {
    name: d.name,
    hp: d.hp ?? 0,
    types: [...(d.types ?? [])],
    stage: d.stage ?? "basic",
    tags: d.tags,
    retreat: d.retreat ?? 0,
    abilities: [],
    attacks: (d.attacks ?? []).map((def, index) => ({ index, def, cost: [...def.cost] })),
  };
  if (d.weakness) c.weakness = d.weakness;
  if (d.resistance) c.resistance = d.resistance;
  // Attacks given by Tools.
  for (const t of toolsOff(s) ? [] : pk.tools) {
    const td = defOf(s, t);
    (td.trainer?.attacks ?? []).forEach((def, index) => {
      c.attacks.push({ index, def, source: t, cost: [...def.cost] });
    });
  }
  if (collecting) return c;
  const locked = abilitiesLocked(s, id);
  c.abilities = locked ? [] : (d.abilities ?? []).map((_: AbilityDef, i: number) => i);
  for (const st of rulesOn(s, "hp", id)) c.hp += amountOfStatic(s, st, st.rule.add);
  for (const st of rulesOn(s, "addType", id)) if (!c.types.includes(st.rule.type)) c.types.push(st.rule.type);
  if (rulesOn(s, "noWeakness", id).length) delete c.weakness;
  const weak = rulesOn(s, "weakness", id);
  if (weak.length) c.weakness = { type: (weak[weak.length - 1] as (typeof weak)[number]).rule.type, mult: 2 };
  // Attacks of other Pokémon it can use (Mew ex's Memory Helix): their cards give them.
  for (const st of rulesOn(s, "borrowAttacks", id))
    for (const other of scopePokemon(s, st.rule.from, st.owner, st.source)) {
      if (other === id) continue;
      const top = pokemonOf(s, other).cards.at(-1) as ObjectId;
      (defOf(s, top).attacks ?? []).forEach((def, index) => {
        if (!c.attacks.some((a) => a.source === top && a.index === index))
          c.attacks.push({ index, def, source: top, cost: [...def.cost] });
      });
    }
  // "If this Pokémon has any damage counters on it, this attack can be used for {D}."
  for (const a of c.attacks)
    if (a.def.altCost && evalCond(s, staticCtx(pk.owner, id), a.def.altCost.cond)) a.cost = [...a.def.altCost.cost];
  for (const st of rulesOn(s, "attackCostIs", id))
    for (const a of c.attacks) if (a.def.name === st.rule.attack) a.cost = [...st.rule.cost];
  let retreat = c.retreat;
  const sets = rulesOn(s, "retreat", id).filter((st) => st.rule.set !== undefined);
  for (const st of rulesOn(s, "retreat", id)) if (st.rule.delta) retreat += st.rule.delta;
  if (sets.length) retreat = Math.min(...sets.map((st) => st.rule.set as number));
  c.retreat = Math.max(0, retreat);
  const less = rulesOn(s, "attackCost", id);
  if (less.length)
    for (const a of c.attacks) {
      let n = 0;
      for (const st of less) n += amountOfStatic(s, st, st.rule.less);
      for (; n > 0; n--) {
        const i = a.cost.lastIndexOf("C");
        if (i < 0) break;
        a.cost.splice(i, 1);
      }
      for (; n < 0; n++) a.cost.push("C");
    }
  return c;
}

/** Computed characteristics of a Pokémon in play. */
export function chars(s: GameState, id: PokemonId): Chars {
  if (collecting) return compute(s, id);
  const cache = cacheOf(s);
  let c = cache.chars.get(id);
  if (!c) {
    c = compute(s, id);
    cache.chars.set(id, c);
  }
  return c;
}

function amountOfStatic(s: GameState, st: ActiveStatic, a: Parameters<typeof evalAmount>[2]): number {
  return evalAmount(s, staticCtx(st.owner, st.source), a);
}

/** Bench size of a player (R-BENCH-1). */
export function benchSize(s: GameState, p: PlayerId): number {
  let size = 5;
  for (const st of rulesOf(s, "benchSize")) {
    const sides =
      st.rule.side === "both"
        ? [st.owner, opponentOf(s, st.owner)]
        : st.rule.side === "me"
          ? [st.owner]
          : [opponentOf(s, st.owner)];
    // "Players with a Tera Pokémon in play…": the rule's scope, read for each player.
    if (st.rule.scope && !scopePokemon(s, { ...st.rule.scope, side: "me" }, p, null).length) continue;
    if (sides.includes(p)) size = Math.max(size, st.rule.size);
  }
  return size;
}

/** Can a player play a Trainer card of this kind (item locks; ACE SPEC locks with `tags`)? */
export function canPlayKind(
  s: GameState,
  p: PlayerId,
  kind: "item" | "supporter" | "stadium" | "tool",
  tags: readonly string[] = [],
): boolean {
  return !rulesOf(s, "cantPlay").some((st) => {
    const r = st.rule;
    const sides =
      r.side === "both" ? [st.owner, opponentOf(s, st.owner)] : r.side === "me" ? [st.owner] : [opponentOf(s, st.owner)];
    return sides.includes(p) && r.kinds.includes(kind) && (!r.tags || r.tags.some((t) => tags.includes(t)));
  });
}

/** Can a player play this Pokémon card from their hand (Team Rocket's Arbok's Potent Glare)? */
export function canPlayPokemonCard(s: GameState, p: PlayerId, d: CardDef): boolean {
  return !rulesOf(s, "cantPlayPokemon").some((st) => {
    const r = st.rule;
    const sides =
      r.side === "both" ? [st.owner, opponentOf(s, st.owner)] : r.side === "me" ? [st.owner] : [opponentOf(s, st.owner)];
    return sides.includes(p) && matchCard(s, d, r.filter, p) && !(r.except && matchCard(s, d, r.except, p));
  });
}

/** How many Tools a Pokémon can have (R-TOOL-1). */
export function toolSlots(s: GameState, id: PokemonId): number {
  let n = 1;
  for (const st of rulesOn(s, "toolSlots", id)) n = Math.max(n, st.rule.n);
  return n;
}
