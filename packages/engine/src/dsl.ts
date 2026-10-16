/**
 * Builders of the effect DSL, used by the card compiler (`@pocketmate/cards` templates) and hand scripts. They only
 * build data (model/effects.ts).
 */
import { msg } from "./text";
import type {
  Amount,
  CardDest,
  CardFilter,
  CardZone,
  Comparison,
  Condition,
  Duration,
  Effect,
  EType,
  PokemonFilter,
  PokemonRef,
  PokemonScope,
  Side,
  SpecialCondition,
  StaticRule,
  Where,
} from "./types";

export const scope = {
  of: (side: Side, where: Where = "any", filter?: PokemonFilter): PokemonScope =>
    filter ? { side, where, filter } : { side, where },
  self: (): PokemonScope => ({ side: "me", self: true }),
  myBench: (filter?: PokemonFilter) => scope.of("me", "bench", filter),
  oppBench: (filter?: PokemonFilter) => scope.of("opp", "bench", filter),
  mine: (filter?: PokemonFilter) => scope.of("me", "any", filter),
  theirs: (filter?: PokemonFilter) => scope.of("opp", "any", filter),
  myActive: (): PokemonScope => ({ side: "me", where: "active" }),
  oppActive: (): PokemonScope => ({ side: "opp", where: "active" }),
};

export const ref = {
  self: "self" as PokemonRef,
  defending: "defending" as PokemonRef,
  myActive: "myActive" as PokemonRef,
  oppActive: "oppActive" as PokemonRef,
  v: (key: string): PokemonRef => ({ var: key }),
  all: (s: PokemonScope): PokemonRef => ({ scope: s }),
};

export const amt = {
  v: (key: string): Amount => ({ k: "var", key }),
  count: (key: string): Amount => ({ k: "count", key }),
  heads: (key?: string): Amount => (key ? { k: "heads", key } : { k: "heads" }),
  mul: (...of: Amount[]): Amount => ({ k: "mul", of }),
  add: (...of: Amount[]): Amount => ({ k: "add", of }),
  sub: (a: Amount, b: Amount): Amount => ({ k: "sub", a, b }),
  min: (...of: Amount[]): Amount => ({ k: "min", of }),
  energy: (on: PokemonRef, opts: { type?: EType; units?: boolean; basic?: boolean; special?: boolean } = {}): Amount => ({
    k: "energy",
    on,
    ...opts,
  }),
  counters: (on: PokemonRef): Amount => ({ k: "counters", on }),
  pokemon: (s: PokemonScope): Amount => ({ k: "pokemon", scope: s }),
  cards: (zone: CardZone, side: Side, filter?: CardFilter): Amount =>
    filter ? { k: "cards", zone, side, filter } : { k: "cards", zone, side },
  prizesLeft: (side: Side): Amount => ({ k: "prizesLeft", side }),
  prizesTaken: (side: Side): Amount => ({ k: "prizesTaken", side }),
  benchSpace: (side: Side = "me"): Amount => ({ k: "benchSpace", side }),
};

export const cond = {
  heads: (key?: string): Condition => (key ? { c: "heads", key } : { c: "heads" }),
  tails: (key?: string): Condition => ({ c: "not", of: cond.heads(key) }),
  cmp: (a: Amount, op: Comparison, b: Amount): Condition => ({ c: "cmp", a, op, b }),
  and: (...of: Condition[]): Condition => ({ c: "and", of }),
  or: (...of: Condition[]): Condition => ({ c: "or", of }),
  not: (of: Condition): Condition => ({ c: "not", of }),
  exists: (s: PokemonScope): Condition => ({ c: "exists", scope: s }),
  matches: (r: PokemonRef, filter: PokemonFilter): Condition => ({ c: "matches", ref: r, filter }),
  hasCondition: (r: PokemonRef, c?: SpecialCondition): Condition =>
    c ? { c: "hasCondition", ref: r, cond: c } : { c: "hasCondition", ref: r },
  v: (key: string): Condition => ({ c: "var", key }),
  hasCards: (zone: CardZone, side: Side, filter?: CardFilter, atLeast?: number): Condition => ({
    c: "hasCards",
    zone,
    side,
    ...(filter ? { filter } : {}),
    ...(atLeast !== undefined ? { atLeast } : {}),
  }),
  /** The deck is not empty (a deck search can be done, R-TEXT-3). */
  deck: (): Condition => cond.hasCards("deck", "me"),
  bench: (side: Side = "me"): Condition => ({ c: "exists", scope: scope.of(side, "bench") }),
};

export const fx = {
  main: (opts: { noWR?: boolean; ignoreEffects?: boolean; to?: PokemonRef } = {}): Effect => ({ op: "mainDamage", ...opts }),
  mill: (side: "me" | "opp", n: Amount, to?: CardDest): Effect => (to ? { op: "mill", side, n, to } : { op: "mill", side, n }),
  bonus: (amount: Amount): Effect => ({ op: "bonusDamage", amount }),
  less: (amount: Amount): Effect => ({ op: "lessDamage", amount }),
  setDamage: (amount: Amount): Effect => ({ op: "setDamage", amount }),
  fails: (): Effect => ({ op: "attackFails" }),
  damage: (to: PokemonRef, amount: Amount, opts: { noWR?: boolean } = {}): Effect => ({ op: "damage", to, amount, ...opts }),
  counters: (to: PokemonRef, n: Amount): Effect => ({ op: "counters", to, n }),
  spread: (s: PokemonScope, n: Amount, prompt = msg("Put the damage counters on your opponent's Pokémon")): Effect => ({
    op: "spreadCounters",
    scope: s,
    n,
    prompt,
  }),
  heal: (target: PokemonRef, amount: Amount | "all"): Effect => ({ op: "heal", target, amount }),
  condition: (target: PokemonRef, c: SpecialCondition, poison?: number): Effect =>
    poison ? { op: "condition", target, cond: c, poison } : { op: "condition", target, cond: c },
  cure: (target: PokemonRef, conds?: SpecialCondition[]): Effect =>
    conds ? { op: "cure", target, conds } : { op: "cure", target },
  choosePokemon: (
    s: PokemonScope,
    store: string,
    prompt: string,
    opts: { min?: Amount; max?: Amount; chooser?: "me" | "opp" } = {},
  ): Effect => ({ op: "choosePokemon", scope: s, store, prompt, ...opts }),
  draw: (n: Amount, who?: "me" | "opp"): Effect => (who ? { op: "draw", n, who } : { op: "draw", n }),
  drawUntil: (n: Amount, who?: "me" | "opp"): Effect => (who ? { op: "drawUntil", n, who } : { op: "drawUntil", n }),
  chooseCards: (
    zone: CardZone,
    store: string,
    prompt: string,
    opts: Omit<Extract<Effect, { op: "chooseCards" }>, "op" | "zone" | "store" | "prompt" | "max"> & { max?: Amount } = {},
  ): Effect => ({ op: "chooseCards", zone, store, prompt, max: 1, ...opts }),
  move: (cards: string, to: CardDest): Effect => ({ op: "move", cards, to }),
  moveAll: (zone: CardZone, side: "me" | "opp", to: CardDest, filter?: CardFilter): Effect =>
    filter ? { op: "moveAll", zone, side, to, filter } : { op: "moveAll", zone, side, to },
  shuffle: (who?: "me" | "opp"): Effect => (who ? { op: "shuffleDeck", who } : { op: "shuffleDeck" }),
  attach: (cards: string, to: PokemonScope, prompt = msg("Choose the Pokémon to attach the card to")): Effect => ({
    op: "attach",
    cards,
    to,
    prompt,
  }),
  evolveWith: (card: string, target: PokemonRef, skipStage1?: boolean): Effect =>
    skipStage1 ? { op: "evolveWith", card, target, skipStage1 } : { op: "evolveWith", card, target },
  discardEnergy: (
    from: PokemonRef,
    n: Amount | "all",
    opts: Omit<Extract<Effect, { op: "discardEnergy" }>, "op" | "from" | "n"> = {},
  ): Effect => ({ op: "discardEnergy", from, n, ...opts }),
  moveEnergy: (from: PokemonRef, to: PokemonScope, n: Amount, types?: EType[]): Effect =>
    types ? { op: "moveEnergy", from, to, n, types } : { op: "moveEnergy", from, to, n },
  discardTools: (from: PokemonRef): Effect => ({ op: "discardTools", from }),
  discardStadium: (): Effect => ({ op: "discardStadium" }),
  switch: (side: "me" | "opp", chooser?: "me" | "opp"): Effect =>
    chooser ? { op: "switch", side, chooser } : { op: "switch", side },
  pokemonTo: (target: PokemonRef, to: "hand" | "deck" | "discard" | "lostZone"): Effect => ({ op: "pokemonTo", target, to }),
  devolve: (target: PokemonRef): Effect => ({ op: "devolve", target }),
  takePrizes: (n: Amount): Effect => ({ op: "takePrizes", n }),
  flip: (n?: Amount, store?: string): Effect => ({ op: "flip", ...(n !== undefined ? { n } : {}), ...(store ? { store } : {}) }),
  flipUntilTails: (store?: string): Effect => ({ op: "flip", untilTails: true, ...(store ? { store } : {}) }),
  if: (c: Condition, then: Effect[], otherwise?: Effect[]): Effect =>
    otherwise ? { op: "if", cond: c, then, else: otherwise } : { op: "if", cond: c, then },
  may: (prompt: string, then: Effect[], otherwise?: Effect[]): Effect =>
    otherwise ? { op: "may", prompt, then, else: otherwise } : { op: "may", prompt, then },
  chooseOne: (prompt: string, options: { label: string; effects: Effect[]; cond?: Condition }[]): Effect => ({
    op: "chooseOne",
    prompt,
    options,
  }),
  repeat: (n: Amount, effects: Effect[]): Effect => ({ op: "repeat", n, effects }),
  forEach: (key: string, as: string, effects: Effect[]): Effect => ({ op: "forEach", key, as, effects }),
  timed: (duration: Duration, rule: StaticRule, target?: PokemonRef): Effect =>
    target ? { op: "timed", duration, rule, target } : { op: "timed", duration, rule },
  endTurn: (): Effect => ({ op: "endTurn" }),
  look: (zone: CardZone, side: "me" | "opp", top?: Amount): Effect =>
    top !== undefined ? { op: "look", zone, side, top } : { op: "look", zone, side },
  set: (key: string, amount: Amount): Effect => ({ op: "set", key, amount }),
};

/** "Search your deck for … and put it into your hand. Then, shuffle your deck." */
export function searchToHand(
  filter: CardFilter | undefined,
  max: Amount,
  prompt: string,
  opts: { min?: Amount; reveal?: boolean } = {},
): Effect[] {
  return [
    fx.chooseCards("deck", "found", prompt, {
      ...(filter ? { filter } : {}),
      max,
      reveal: opts.reveal ?? true,
      ...(opts.min !== undefined ? { min: opts.min } : {}),
    }),
    fx.move("found", "hand"),
    fx.shuffle(),
  ];
}

/** "Search your deck for up to N Basic Pokémon and put them onto your Bench. Then, shuffle your deck." */
export function searchToBench(filter: CardFilter, max: Amount, prompt: string): Effect[] {
  return [
    fx.chooseCards("deck", "found", prompt, {
      filter: { ...filter, stage: ["basic"], category: ["pokemon"] },
      max: amt.min(max, amt.benchSpace()),
    }),
    fx.move("found", "bench"),
    fx.shuffle(),
  ];
}
