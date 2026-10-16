/**
 * The expert level: an ISMCTS (Information Set Monte Carlo Tree Search) at the root of each main-phase decision.
 *
 * The candidates are the medium level's best options (its own choice, the next best actions, the best attack and the
 * end of the turn). At each iteration a **determinization** is drawn (`determinize`: the opponent's hidden cards from
 * what was seen of them, the AI's own deck and Prizes shuffled together, the coin flips reseeded). A candidate is
 * picked by UCB1, with a bias toward the options the one-step evaluation prefers; it is played, then a fast
 * simulation (`playout`) goes on, for both players, until the start of the AI's next turn, so the opponent's answer
 * counts. The position reached is evaluated (or won / lost).
 *
 * The tree is limited to the root: with a few tens to a few hundred iterations, deeper nodes would be visited too
 * rarely to be reliable. Questions (`choice`) and the setup are left to the medium level.
 */
import { type Agent, applyMutable, type Decision, type GameState, type PlayerId, RulesError } from "@pocketmate/engine";
import { determinize } from "./determinize";
import { evaluate } from "./evaluate";
import { mediumAgent, type ScoredMain, scoreMain, settle } from "./medium";
import { mainDecisions } from "./options";
import { mulberry32, type Rng } from "./rng";

export interface IsmctsConfig {
  seed: number;
  /** Fixed number of iterations per searched decision (tests, arena: reproducible). */
  iterations?: number;
  /** Otherwise, a time budget per decision (interface, server), in milliseconds. */
  ms?: number;
  /** Below this number of iterations within the time budget (slow device), the medium decision is kept. */
  minIterations?: number;
  maxIterations?: number;
  /** Number of candidates examined at the root. */
  width?: number;
  /** Maximum number of decisions per simulation. */
  horizon?: number;
}

const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));
/** Evaluation units per step of the reward's sigmoid (a Prize is worth about 110). */
const SCALE = 60;
/** A candidate whose one-step value is this much below the best one is not examined. */
const PRUNE = 150;

const keyOf = (d: Decision) => JSON.stringify(d);

export interface Candidate {
  decision: Decision;
  /** One-step evaluation: the initial bias of the search. */
  prior: number;
}

/** The candidates of a main-phase decision, the medium choice first (empty when nothing is worth searching). */
export function candidates(scored: ScoredMain, width: number): Candidate[] {
  const out: Candidate[] = [];
  const seen = new Set<string>();
  const add = (decision: Decision, prior: number) => {
    const k = keyOf(decision);
    if (seen.has(k) || out.length >= width) return;
    seen.add(k);
    out.push({ decision, prior });
  };
  const priorOf = (d: Decision) =>
    d.type === "endTurn" ? scored.base : (scored.options.find((o) => keyOf(o.decision) === keyOf(d))?.value ?? scored.base);
  add(scored.choice, priorOf(scored.choice));
  const sorted = [...scored.options].sort((a, b) => b.value - a.value);
  const best = Math.max(scored.base, sorted[0]?.value ?? scored.base);
  const attack = sorted.find((o) => o.decision.type === "attack");
  if (attack && attack.value >= best - PRUNE) add(attack.decision, attack.value);
  if (scored.base >= best - PRUNE) add({ type: "endTurn" }, scored.base);
  for (const o of sorted) if (o.value >= best - PRUNE) add(o.decision, o.value);
  return out;
}

/** The fast policy of the simulations, for both players: the medium level's one-step choice, questions suggested. */
function policyStep(d: GameState): boolean {
  const p = d.pending;
  if (!p || d.over) return false;
  if (p.kind === "choice") {
    applyMutable(d, p.player, { type: "choose", values: p.request.suggested });
    return true;
  }
  if (p.kind !== "main") return false;
  applyMutable(d, p.player, scoreMain(d, p.player).choice);
  return true;
}

/** Simulation until the start of `me`'s next turn, the end of the game or `horizon` decisions. */
export function playout(d: GameState, me: PlayerId, horizon: number): GameState {
  const start = d.turn.number;
  for (let i = 0; i < horizon; i++) {
    if (d.turn.number > start && d.turn.active === me && d.pending?.kind === "main") break;
    try {
      if (!policyStep(d)) break;
    } catch (e) {
      if (!(e instanceof RulesError)) throw e;
      // The policy's decision was refused (a rare effect of the determinization): end the turn instead, or stop.
      const p = d.pending;
      if (p?.kind !== "main") break;
      try {
        applyMutable(d, p.player, { type: "endTurn" });
      } catch (e2) {
        if (!(e2 instanceof RulesError)) throw e2;
        break;
      }
    }
  }
  return d;
}

export interface SearchResult {
  decision: Decision;
  iterations: number;
  visits: number[];
  means: number[];
}

/**
 * Chooses among `cands` by ISMCTS, or `null` when too few iterations fit in the time budget (the medium decision is
 * then better than a sloppy search).
 */
export function ismctsChoose(s: GameState, me: PlayerId, cands: Candidate[], cfg: IsmctsConfig, rng: Rng): SearchResult | null {
  const first = cands[0];
  if (!first) return null;
  if (cands.length < 2) return { decision: first.decision, iterations: 0, visits: [0], means: [0] };
  const root = evaluate(s, me);
  const bestPrior = Math.max(...cands.map((c) => c.prior));
  // Initial bias: the options the one-step evaluation prefers are explored first and break the ties; the medium
  // choice (first) a little more.
  const bias = cands.map((c, k) => 0.3 * sigmoid((c.prior - bestPrior) / 40) + (k === 0 ? 0.05 : 0));
  const n = cands.map(() => 0);
  const w = cands.map(() => 0);
  const horizon = cfg.horizon ?? 120;
  const t0 = Date.now();
  const maxIt = cfg.iterations ?? cfg.maxIterations ?? 400;
  let total = 0;
  while (total < maxIt) {
    if (cfg.iterations === undefined && Date.now() - t0 > (cfg.ms ?? 800)) break;
    // UCB1: each option once first (medium choice first), then a trade-off between the best averages and the least
    // explored options.
    let i = n.indexOf(0);
    if (i < 0) {
      let best = Number.NEGATIVE_INFINITY;
      for (let k = 0; k < cands.length; k++) {
        const nk = n[k] as number;
        const ucb = (w[k] as number) / nk + 0.5 * Math.sqrt(Math.log(total) / nk) + (bias[k] as number) / (nk + 1);
        if (ucb > best) {
          best = ucb;
          i = k;
        }
      }
    }
    const d = determinize(s, me, rng);
    let reward = 0;
    try {
      applyMutable(d, me, (cands[i] as Candidate).decision);
      settle(d);
      playout(d, me, horizon);
      reward = d.over ? (d.winner === me ? 1 : d.winner ? 0 : 0.5) : sigmoid((evaluate(d, me) - root) / SCALE);
    } catch (e) {
      // Impossible in this determinization: the visit counts, without reward.
      if (!(e instanceof RulesError)) throw e;
    }
    n[i] = (n[i] as number) + 1;
    w[i] = (w[i] as number) + reward;
    total++;
  }
  if (cfg.iterations === undefined && total < (cfg.minIterations ?? 2 * cands.length)) return null;
  // The most visited option (the safest); on a tie, the best average.
  let pick = 0;
  for (let k = 1; k < cands.length; k++) {
    const better =
      (n[k] as number) > (n[pick] as number) ||
      ((n[k] as number) === (n[pick] as number) && (w[k] as number) > (w[pick] as number));
    if (better) pick = k;
  }
  return {
    decision: (cands[pick] as Candidate).decision,
    iterations: total,
    visits: n,
    means: n.map((nk, k) => (nk ? (w[k] as number) / nk : 0)),
  };
}

/** The expert agent: ISMCTS for main-phase decisions with a real alternative, the medium level otherwise. */
export function expertAgent(cfg: IsmctsConfig): Agent {
  const rng = mulberry32(cfg.seed);
  const medium = mediumAgent({ seed: cfg.seed ^ 0x5bd1e995 });
  return (s, p) => {
    if (s.pending?.kind !== "main") return medium(s, p);
    const t0 = Date.now();
    const scored = scoreMain(determinize(s, p, rng), p, mainDecisions(s, p));
    const cands = candidates(scored, cfg.width ?? 5);
    if (cands.length < 2) return scored.choice;
    // The time budget includes the scoring of the candidates.
    const ms = cfg.ms === undefined ? undefined : Math.max(0, cfg.ms - (Date.now() - t0));
    return ismctsChoose(s, p, cands, { ...cfg, ms }, rng)?.decision ?? scored.choice;
  };
}
