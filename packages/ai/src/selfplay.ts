/** Games between agents (fuzz, tournaments, tests), with invariants checked at every decision. */
import { type Agent, type CardDef, createGame, type Decision, type GameState, RulesError, submit } from "@pokecircle/engine";
import { checkInvariants } from "./invariants";
import { mainDecisions } from "./options";

export interface PlayOptions {
  seed: number;
  decks: [CardDef[], CardDef[]];
  agents: [Agent, Agent];
  /** Junk decisions tried before each decision (chaos): must be refused with a RulesError. */
  junk?: [(() => unknown) | null, (() => unknown) | null];
  /** Every N main phases, every option must be accepted by the engine (`checkOffers`). */
  offers?: number;
  maxDecisions?: number;
  invariants?: boolean;
}

export interface PlayResult {
  state: GameState;
  decisions: number;
  errors: string[];
  /** Junk decisions refused. */
  refused: number;
  decided: [string, Decision][];
}

/** Every option offered must be accepted (a refusal is a disagreement between legal.ts and actions.ts). */
export function checkOffers(s: GameState): string[] {
  const p = s.pending;
  if (p?.kind !== "main") return [];
  const errors: string[] = [];
  for (const d of mainDecisions(s, p.player)) {
    try {
      submit(s, p.player, d);
    } catch (e) {
      errors.push(`offered but refused: ${JSON.stringify(d)}: ${(e as Error).message}`);
    }
  }
  return errors;
}

export function playGame(o: PlayOptions): PlayResult {
  const players: [string, string] = ["p1", "p2"];
  let state = createGame({
    seed: o.seed,
    players: [
      { id: players[0], name: "P1", deck: o.decks[0] },
      { id: players[1], name: "P2", deck: o.decks[1] },
    ],
  }).state;
  const counts = { p1: o.decks[0].length, p2: o.decks[1].length };
  const errors: string[] = [];
  const decided: [string, Decision][] = [];
  let refused = 0;
  let mains = 0;
  const max = o.maxDecisions ?? 5000;
  let n = 0;
  for (; n < max && !state.over && errors.length === 0; n++) {
    const pending = state.pending;
    if (!pending) {
      errors.push("no decision pending");
      break;
    }
    const i = players.indexOf(pending.player);
    const junk = o.junk?.[i]?.();
    if (junk !== null && junk !== undefined) {
      try {
        submit(state, pending.player, junk as Decision);
      } catch (e) {
        if (e instanceof RulesError) refused++;
        else errors.push(`junk ${JSON.stringify(junk)} threw a non-rules error: ${(e as Error).stack}`);
      }
    }
    if (pending.kind === "main" && o.offers && ++mains % o.offers === 0) errors.push(...checkOffers(state));
    const agent = o.agents[i] as Agent;
    let d: Decision;
    try {
      d = agent(state, pending.player);
      state = submit(state, pending.player, d).state;
    } catch (e) {
      errors.push(`decision of ${pending.player} failed: ${(e as Error).stack}`);
      break;
    }
    decided.push([pending.player, d]);
    if (o.invariants !== false) {
      const inv = checkInvariants(state, counts);
      if (inv.length) errors.push(...inv.map((x) => `after decision ${n + 1} (${JSON.stringify(d)}): ${x}`));
    }
  }
  if (!state.over && !errors.length) errors.push(`game not over after ${max} decisions`);
  return { state, decisions: n, errors, refused, decided };
}
