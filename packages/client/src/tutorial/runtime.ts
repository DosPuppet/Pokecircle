/**
 * Tutorial, pure part: lesson format, allowed decisions (strict guidance), end-of-step predicates and a solver (the
 * decision a step expects: tests and interface script). No dependency on the DOM or the store. Cards are named by
 * their English name. The scripted opponent is in `agent.ts` (the game worker imports it: no card database there).
 */
import type { CardDef, Decision, GameEvent, GameView, PokemonId, ScenarioSpec } from "@pocketmate/engine";
import { defOf } from "../cards";

/**
 * A decision allowed during a step, by card names (English). `target`: the Pokémon (by name) it goes on.
 * `attack`: the attack's index on the Active Pokémon.
 */
export type Allow =
  | { playBasic: string }
  | { evolve: string; target?: string }
  | { attach: string; target?: string }
  | { trainer: string; target?: string }
  | { retreat: string }
  | { ability: string }
  | { attack: number }
  | "endTurn";

export interface Ctx {
  view: GameView;
  /** Events of the last update. */
  events: GameEvent[];
}

export interface Step {
  /** A `msg` literal, translated on display. */
  text: string;
  /** Interface element to circle (CSS selector). */
  target?: string;
  /** Explanation: a "Next" button; nothing to play. */
  next?: true;
  /** End condition of the step (without `next`). */
  until?: (c: Ctx) => boolean;
  /** Decisions accepted during the step (questions of the engine are always accepted). */
  allow?: Allow[];
  /** Reminder shown when the player does something else (a `msg` literal). */
  hint?: string;
}

export interface Lesson {
  id: string;
  /** `msg` literals, translated on display. */
  title: string;
  summary: string;
  /** The staged position (definition ids; the players' names are given when the lesson starts). */
  scenario: Omit<ScenarioSpec, "names">;
  steps: Step[];
}

// —— reading the view ——

const nameOfDef = (defId: string | undefined) => defOf(defId)?.name;

/** English name of a card (by object id) in the view. */
export const cardName = (v: GameView, id: string): string | undefined => nameOfDef(v.faces[id]);

/** English name of a Pokémon in play (its top card). */
export const pokemonName = (v: GameView, id: PokemonId): string | undefined => {
  const cards = v.pokemon[id]?.cards ?? [];
  return cardName(v, cards[cards.length - 1] ?? "");
};

const opponentOf = (v: GameView) => v.order.find((p) => p !== v.me) as string;

/** My (or the opponent's) Pokémon in play with this name. */
const inPlay = (v: GameView, name: string, mine = true): PokemonId[] => {
  const ps = v.players[mine ? v.me : opponentOf(v)];
  return [ps?.active, ...(ps?.bench ?? [])].filter((id): id is string => !!id && pokemonName(v, id) === name);
};

// —— strict guidance ——

export function matches(allow: Allow, d: Decision, v: GameView): boolean {
  if (allow === "endTurn") return d.type === "endTurn";
  const target = (wanted: string | undefined, id: PokemonId | undefined) => !wanted || (!!id && pokemonName(v, id) === wanted);
  if ("playBasic" in allow) return d.type === "playBasic" && cardName(v, d.card) === allow.playBasic;
  if ("evolve" in allow) return d.type === "evolve" && cardName(v, d.card) === allow.evolve && target(allow.target, d.target);
  if ("attach" in allow)
    return d.type === "attachEnergy" && cardName(v, d.card) === allow.attach && target(allow.target, d.target);
  if ("trainer" in allow)
    return d.type === "playTrainer" && cardName(v, d.card) === allow.trainer && target(allow.target, d.target);
  if ("retreat" in allow) return d.type === "retreat" && pokemonName(v, d.to) === allow.retreat;
  if ("ability" in allow) return d.type === "useAbility" && pokemonName(v, d.pokemon) === allow.ability;
  return d.type === "attack" && d.index === allow.attack;
}

/** Decisions always accepted: answering a question of the engine, conceding. */
export const alwaysAllowed = (d: Decision) => d.type === "choose" || d.type === "concede";

/** The decision that completes an allowed action, from the view's options (`null`: not possible now). */
export function solve(allow: Allow, v: GameView): Decision | null {
  const p = v.pending;
  if (!p || p.player !== v.me || p.kind !== "main") return null;
  for (const o of v.legal) {
    const candidates: Decision[] =
      o.type === "playBasic"
        ? [{ type: "playBasic", card: o.card }]
        : o.type === "evolve"
          ? o.targets.map((target) => ({ type: "evolve", card: o.card, target }))
          : o.type === "attachEnergy"
            ? o.targets.map((target) => ({ type: "attachEnergy", card: o.card, target }))
            : o.type === "playTrainer"
              ? o.targets
                ? o.targets.map((target) => ({ type: "playTrainer", card: o.card, target }))
                : [{ type: "playTrainer", card: o.card }]
              : o.type === "retreat"
                ? o.to.map((to) => ({ type: "retreat", to, discard: o.suggested }))
                : o.type === "useAbility"
                  ? [{ type: "useAbility", pokemon: o.pokemon, ability: o.ability }]
                  : o.type === "attack"
                    ? [o.source ? { type: "attack", index: o.index, source: o.source } : { type: "attack", index: o.index }]
                    : o.type === "endTurn"
                      ? [{ type: "endTurn" }]
                      : [];
    const d = candidates.find((c) => matches(allow, c, v));
    if (d) return d;
  }
  return null;
}

// —— step predicates ——

/** My Pokémon with this name has at least `n` Energy attached. */
export const energyOn =
  (name: string, n: number) =>
  (c: Ctx): boolean =>
    inPlay(c.view, name).some((id) => (c.view.pokemon[id]?.energy.length ?? 0) >= n);

/** My (or the opponent's) Pokémon with this name is in play. */
export const inPlayNamed =
  (name: string, mine = true) =>
  (c: Ctx): boolean =>
    inPlay(c.view, name, mine).length > 0;

/** My Active Pokémon has this name. */
export const activeIs =
  (name: string) =>
  (c: Ctx): boolean => {
    const id = c.view.players[c.view.me]?.active;
    return !!id && pokemonName(c.view, id) === name;
  };

/** My Pokémon with this name has at most `n` damage. */
export const damageAtMost =
  (name: string, n: number) =>
  (c: Ctx): boolean =>
    inPlay(c.view, name).some((id) => (c.view.pokemon[id]?.damage ?? 0) <= n);

/** I have at most `n` Prize cards left. */
export const prizesLeft =
  (n: number) =>
  (c: Ctx): boolean =>
    (c.view.players[c.view.me]?.prizes ?? 6) <= n;

/** A card with this name is in my discard pile. */
export const discarded =
  (name: string) =>
  (c: Ctx): boolean =>
    (c.view.players[c.view.me]?.discard ?? []).some((id) => cardName(c.view, id) === name);

/**
 * My turn ended: it is no longer my turn, or the update holds the end of my turn (an update may already show my next
 * turn when the opponent played without a pause).
 */
export const turnEnded = (c: Ctx): boolean =>
  c.view.over || c.view.turn.active !== c.view.me || c.events.some((e) => e.type === "endTurn" && e.player === c.view.me);

/** My main phase is back (my next turn). */
export const myMain = (c: Ctx): boolean => c.view.pending?.kind === "main" && c.view.pending.player === c.view.me;

export const all =
  (...preds: ((c: Ctx) => boolean)[]) =>
  (c: Ctx) =>
    preds.every((p) => p(c));

/** The definitions a lesson's position uses (sent to the game worker). */
export function lessonDefs(spec: Lesson["scenario"]): Record<string, CardDef> {
  const out: Record<string, CardDef> = {};
  const walk = (x: unknown): void => {
    const d = typeof x === "string" ? defOf(x) : undefined;
    if (d) out[d.id] = d;
    else if (Array.isArray(x)) for (const y of x) walk(y);
    else if (x && typeof x === "object") for (const y of Object.values(x)) walk(y);
  };
  walk(spec);
  return out;
}
