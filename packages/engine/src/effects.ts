/**
 * Effect interpreter. Effects are data (model/effects.ts); a resolution is a stack of frames (control ops push frames),
 * suspended on a question and resumed with the answer: the op that asked runs again, finds its answer in
 * `r.answers[key]` and only then acts (an op never acts before all its questions are answered).
 */
import { forcedAnswer } from "./choices";
import { countUnits } from "./energy";
import { matchCard, matchPokemon, scopePokemon, sidePlayers } from "./match";
import { opHandler } from "./opRegistry";
import { isActive, isFirstTurnOf, opponentOf, playerOf, pokemonOf } from "./state";
import { chars } from "./statics";
import type {
  Amount,
  AttackState,
  CardZone,
  ChoiceRequest,
  ChoiceValue,
  Condition,
  Effect,
  GameState,
  ObjectId,
  PlayerId,
  PokemonId,
  PokemonRef,
  Resolution,
  Side,
} from "./types";

/** What effects, amounts and conditions are evaluated against (a resolution, or a static rule's source). */
export interface Ctx {
  kind?: Resolution["kind"];
  player: PlayerId;
  source: PokemonId | null;
  card: ObjectId | null;
  vars: Record<string, ChoiceValue[]>;
  attack?: AttackState;
  event?: Record<string, string>;
}

export function staticCtx(player: PlayerId, source: PokemonId | null): Ctx {
  return { player, source, card: null, vars: {} };
}

export interface Ask {
  player: PlayerId;
  key: string;
  request: ChoiceRequest;
}

export type OpResult =
  | { done: true }
  | { ask: Ask }
  | { push: Effect[]; repeat?: number; each?: { key: string; as: string; items: string[] } };

export const DONE: OpResult = { done: true };

/**
 * The answer to a question of the current op: already given, forced (a single possible answer is not asked), or the
 * question to ask.
 */
export function answer(r: Resolution, key: string, player: PlayerId, request: ChoiceRequest): ChoiceValue[] | Ask {
  const given = r.answers[key];
  if (given) return given;
  const forced = forcedAnswer(request);
  if (forced) {
    r.answers[key] = forced;
    return forced;
  }
  return { player, key, request };
}

export const isAsk = (a: ChoiceValue[] | Ask): a is Ask => !Array.isArray(a);

// —— references ——

/** Players of a side relative to the context. */
export function playersOf(s: GameState, ctx: Ctx, who: "me" | "opp" | undefined): PlayerId {
  return who === "opp" ? opponentOf(s, ctx.player) : ctx.player;
}

/** The Pokémon a reference designates (only those still in play). */
export function resolveRef(s: GameState, ctx: Ctx, ref: PokemonRef): PokemonId[] {
  const alive = (ids: (string | null | undefined)[]) => ids.filter((x): x is string => !!x && !!s.pokemon[x]);
  if (ref === "self") return alive([ctx.source]);
  if (ref === "myActive") return alive([playerOf(s, ctx.player).active]);
  if (ref === "oppActive") return alive([playerOf(s, opponentOf(s, ctx.player)).active]);
  if (ref === "defending")
    return ctx.attack ? alive([ctx.attack.defending]) : alive([playerOf(s, opponentOf(s, ctx.player)).active]);
  if ("var" in ref) return alive((ctx.vars[ref.var] ?? []).map(String));
  if ("ev" in ref) return alive([ctx.event?.[ref.ev]]);
  return scopePokemon(s, ref.scope, ctx.player, ctx.source);
}

// —— amounts ——

function zoneCards(s: GameState, p: PlayerId, zone: CardZone): ObjectId[] {
  return playerOf(s, p)[zone];
}

export function sideCount(s: GameState, ctx: Ctx, side: Side, fn: (p: PlayerId) => number): number {
  return sidePlayers(s, side, ctx.player).reduce((n, p) => n + fn(p), 0);
}

export function evalAmount(s: GameState, ctx: Ctx, a: Amount): number {
  if (typeof a === "number") return a;
  switch (a.k) {
    case "var":
      return Number(ctx.vars[a.key]?.[0] ?? 0);
    case "count":
      return ctx.vars[a.key]?.length ?? 0;
    case "heads":
      return Number(ctx.vars[a.key ?? "heads"]?.[0] ?? 0);
    case "tails":
      return Number(ctx.vars[a.key ? `${a.key}:tails` : "tails"]?.[0] ?? 0);
    case "add":
      return a.of.reduce<number>((n, x) => n + evalAmount(s, ctx, x), 0);
    case "sub":
      return evalAmount(s, ctx, a.a) - evalAmount(s, ctx, a.b);
    case "mul":
      return a.of.reduce<number>((n, x) => n * evalAmount(s, ctx, x), 1);
    case "min":
      return Math.min(...a.of.map((x) => evalAmount(s, ctx, x)));
    case "max":
      return Math.max(...a.of.map((x) => evalAmount(s, ctx, x)));
    case "energy":
      return resolveRef(s, ctx, a.on).reduce((n, id) => {
        const pk = pokemonOf(s, id);
        if (a.units) return n + countUnits(s, id, a.type);
        return (
          n +
          pk.energy.filter((e) => {
            const d = s.defs[s.objects[e]?.defId ?? ""];
            if (!d?.energy) return false;
            if (a.basic && !d.energy.basic) return false;
            if (a.special && d.energy.basic) return false;
            if (a.names && !a.names.includes(d.name)) return false;
            return !a.type || d.energy.provides.some((u) => u.includes(a.type as string) || u.includes("*"));
          }).length
        );
      }, 0);
    case "counters":
      return resolveRef(s, ctx, a.on).reduce((n, id) => n + pokemonOf(s, id).damage / 10, 0);
    case "hp":
      return resolveRef(s, ctx, a.on).reduce((n, id) => n + chars(s, id).hp, 0);
    case "remainingHp":
      return resolveRef(s, ctx, a.on).reduce((n, id) => n + Math.max(0, chars(s, id).hp - pokemonOf(s, id).damage), 0);
    case "pokemon":
      return scopePokemon(s, a.scope, ctx.player, ctx.source).length;
    case "cards":
      return sideCount(
        s,
        ctx,
        a.side,
        (p) =>
          zoneCards(s, p, a.zone).filter((id) => matchCard(s, s.defs[s.objects[id]?.defId ?? ""]!, a.filter, ctx.player)).length,
      );
    case "prizesLeft":
      return sideCount(s, ctx, a.side, (p) => playerOf(s, p).prizes.length);
    case "prizesTaken":
      return sideCount(s, ctx, a.side, (p) => playerOf(s, p).prizesTaken);
    case "benchSpace":
      return sideCount(s, ctx, a.side, (p) => Math.max(0, benchSizeOf(s, p) - playerOf(s, p).bench.length));
    case "turnLog": {
      const turn = a.previous ? s.turn.number - 1 : s.turn.number;
      const players = sidePlayers(s, a.side ?? "me", ctx.player);
      return s.turnLog.filter((e) => {
        if (e.turn !== turn || e.kind !== a.event || !players.includes(e.player)) return false;
        if (!a.filter) return true;
        const d = e.defId ? s.defs[e.defId] : undefined;
        return !!d && matchCard(s, d, a.filter, ctx.player);
      }).length;
    }
  }
}

// Bench size lives in statics.ts, which imports this module: a late-bound reference avoids an import-time cycle.
let benchSizeOf: (s: GameState, p: PlayerId) => number = () => 5;
export function setBenchSize(fn: (s: GameState, p: PlayerId) => number): void {
  benchSizeOf = fn;
}

// —— conditions ——

export function evalCond(s: GameState, ctx: Ctx, c: Condition): boolean {
  switch (c.c) {
    case "true":
      return true;
    case "heads":
      return Number(ctx.vars[c.key ?? "heads"]?.[0] ?? 0) > 0;
    case "cmp": {
      const a = evalAmount(s, ctx, c.a);
      const b = evalAmount(s, ctx, c.b);
      switch (c.op) {
        case ">=":
          return a >= b;
        case ">":
          return a > b;
        case "<=":
          return a <= b;
        case "<":
          return a < b;
        case "==":
          return a === b;
        case "!=":
          return a !== b;
      }
      return false;
    }
    case "and":
      return c.of.every((x) => evalCond(s, ctx, x));
    case "or":
      return c.of.some((x) => evalCond(s, ctx, x));
    case "not":
      return !evalCond(s, ctx, c.of);
    case "exists":
      return scopePokemon(s, c.scope, ctx.player, ctx.source).length > 0;
    case "matches": {
      const ids = resolveRef(s, ctx, c.ref);
      return ids.length > 0 && ids.every((id) => matchPokemon(s, id, c.filter));
    }
    case "hasCondition":
      return resolveRef(s, ctx, c.ref).some((id) => {
        const k = pokemonOf(s, id).cond;
        if (!c.cond) return !!(k.rotating || k.poisoned || k.burned);
        if (c.cond === "poisoned") return !!k.poisoned;
        if (c.cond === "burned") return !!k.burned;
        return k.rotating === c.cond;
      });
    case "isActive":
      return resolveRef(s, ctx, c.ref).some((id) => isActive(s, id));
    case "var":
      return Number(ctx.vars[c.key]?.[0] ?? 0) > 0 || (typeof ctx.vars[c.key]?.[0] === "string" && !!ctx.vars[c.key]?.[0]);
    case "firstTurn":
      return isFirstTurnOf(s, ctx.player);
    case "wentFirst":
      return s.turn.first === ctx.player;
    case "stadium": {
      if (!s.stadium) return false;
      const d = s.defs[s.objects[s.stadium]?.defId ?? ""];
      return !c.names || (!!d && c.names.includes(d.name));
    }
    case "didThisTurn": {
      const ids = resolveRef(s, ctx, c.ref);
      return s.turnLog.some((e) => e.turn === s.turn.number && e.kind === c.kind && !!e.pokemon && ids.includes(e.pokemon));
    }
    case "hasCards": {
      const players = sidePlayers(s, c.side, ctx.player);
      const n = players.reduce(
        (k, p) =>
          k +
          zoneCards(s, p, c.zone).filter((id) => matchCard(s, s.defs[s.objects[id]?.defId ?? ""]!, c.filter, ctx.player)).length,
        0,
      );
      return n >= (c.atLeast ?? 1);
    }
  }
}

// —— the interpreter ——

/** Starts a resolution (the caller has checked that nothing else resolves). */
export function startResolution(
  s: GameState,
  init: Omit<Resolution, "frames" | "vars" | "answers" | "seq" | "awaiting"> & { effects: Effect[]; vars?: Resolution["vars"] },
): void {
  const { effects, vars, ...rest } = init;
  s.resolving = { ...rest, frames: [{ effects, pc: 0 }], vars: vars ?? {}, answers: {}, seq: 0, awaiting: null };
}

/**
 * Runs the current resolution until it asks a question (`s.pending` set) or ends (returns true: the caller finishes
 * it).
 */
export function runResolution(s: GameState, maxSteps = 100_000): boolean {
  const r = s.resolving;
  if (!r) return true;
  for (let i = 0; i < maxSteps; i++) {
    if (r.kind === "attack" && r.attack?.fails) return true;
    const f = r.frames[r.frames.length - 1];
    if (!f) return true;
    if (f.pc >= f.effects.length) {
      if (f.repeat && f.repeat > 0) {
        f.repeat--;
        f.pc = 0;
        continue;
      }
      if (f.each && f.each.i + 1 < f.each.items.length) {
        f.each.i++;
        r.vars[f.each.as] = [f.each.items[f.each.i] as string];
        f.pc = 0;
        continue;
      }
      r.frames.pop();
      continue;
    }
    const e = f.effects[f.pc] as Effect;
    const handler = opHandler(e.op);
    if (!handler) throw new Error(`no handler for effect op "${e.op}"`);
    const seq = r.seq;
    const out = handler(s, r, e as never, (suffix: string) => `${seq}:${suffix}`);
    if ("ask" in out) {
      r.awaiting = out.ask.key;
      s.pending = { kind: "choice", player: out.ask.player, request: out.ask.request, purpose: "effect" };
      return false;
    }
    f.pc++;
    r.seq++;
    r.answers = {};
    if ("push" in out && out.push.length) {
      const frame: Resolution["frames"][number] = { effects: out.push, pc: 0 };
      if (out.repeat !== undefined) frame.repeat = out.repeat;
      if (out.each) {
        if (!out.each.items.length) continue;
        frame.each = { ...out.each, i: 0 };
        r.vars[out.each.as] = [out.each.items[0] as string];
      }
      r.frames.push(frame);
    }
    if (s.over) return true;
  }
  throw new Error("resolution did not end");
}
