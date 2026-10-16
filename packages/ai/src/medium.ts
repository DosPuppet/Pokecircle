/**
 * The medium AI: one-step simulation. Each main-phase option is applied to a determinized copy (questions answered
 * with their suggestion), then the position is evaluated. Non-attacking actions are played while they improve the
 * position; then the best attack, or the end of the turn.
 */
import {
  type Agent,
  applyMutable,
  type ChoiceRequest,
  cloneState,
  type Decision,
  type GameState,
  type PlayerId,
  RulesError,
} from "@pocketmate/engine";
import { determinize } from "./determinize";
import { evaluate } from "./evaluate";
import { mainDecisions, randomAnswer } from "./options";
import { mulberry32, type Rng } from "./rng";

export interface MediumOptions {
  seed: number;
  /** Chance of a random option instead of the best one (beginner level). */
  noise?: number;
}

/** Answers the questions left with their suggestion, until a main phase, a setup or the end (bounded). */
export function settle(s: GameState, limit = 40): void {
  for (let i = 0; i < limit && s.pending?.kind === "choice" && !s.over; i++)
    applyMutable(s, s.pending.player, { type: "choose", values: s.pending.request.suggested });
}

/** Value of a decision for `p`, simulated on a copy (−∞ when refused). */
export function simulate(s: GameState, p: PlayerId, d: Decision): number {
  const c = cloneState(s);
  try {
    applyMutable(c, p, d);
    settle(c);
  } catch (e) {
    if (e instanceof RulesError) return Number.NEGATIVE_INFINITY;
    throw e;
  }
  return evaluate(c, p);
}

function setupDecision(s: GameState, p: PlayerId): Decision {
  const hand = s.players[p]?.hand ?? [];
  const basics = hand
    .filter((c) => {
      const d = s.defs[s.objects[c]?.defId ?? ""];
      return d?.category === "pokemon" && d.stage === "basic";
    })
    .sort((a, b) => (s.defs[s.objects[b]?.defId ?? ""]?.hp ?? 0) - (s.defs[s.objects[a]?.defId ?? ""]?.hp ?? 0));
  // The sturdiest Basic as Active, up to 4 others on the Bench.
  return { type: "setup", active: basics[0] as string, bench: basics.slice(1, 5) };
}

/** An answer to a question: simulated when there are few options, else the suggestion. */
function choiceAnswer(s: GameState, p: PlayerId, req: ChoiceRequest, rng: Rng): Decision {
  if (req.type === "pick" && req.min === 1 && req.max === 1 && req.options.length > 1 && req.options.length <= 8) {
    let best = req.suggested;
    let bestV = Number.NEGATIVE_INFINITY;
    const det = determinize(s, p, rng);
    for (const o of req.options) {
      const v = simulate(det, p, { type: "choose", values: [o] });
      if (v > bestV) {
        bestV = v;
        best = [o];
      }
    }
    return { type: "choose", values: best };
  }
  if (req.type === "yesNo") {
    const det = determinize(s, p, rng);
    const yes = simulate(det, p, { type: "choose", values: [1] });
    const no = simulate(det, p, { type: "choose", values: [0] });
    return { type: "choose", values: [yes >= no ? 1 : 0] };
  }
  return { type: "choose", values: req.suggested };
}

export function mediumAgent(o: MediumOptions): Agent {
  const rng = mulberry32(o.seed);
  return (s, p) => {
    const pending = s.pending;
    if (!pending) throw new Error("nothing to decide");
    if (pending.kind === "setup") return setupDecision(s, p);
    if (pending.kind === "choice") {
      if (o.noise && rng() < o.noise) return { type: "choose", values: randomAnswer(pending.request, rng) };
      return choiceAnswer(s, p, pending.request, rng);
    }
    const all = mainDecisions(s, p);
    const det = determinize(s, p, rng);
    const base = evaluate(det, p);
    let bestAction: Decision | null = null;
    let bestActionV = Number.NEGATIVE_INFINITY;
    let bestAttack: Decision | null = null;
    let bestAttackV = Number.NEGATIVE_INFINITY;
    for (const d of all) {
      if (d.type === "endTurn") continue;
      const v = simulate(det, p, d);
      if (d.type === "attack") {
        if (v > bestAttackV) {
          bestAttackV = v;
          bestAttack = d;
        }
      } else if (v > bestActionV) {
        bestActionV = v;
        bestAction = d;
      }
    }
    if (o.noise && rng() < o.noise) {
      const others = all.filter((d) => d.type !== "endTurn");
      if (others.length) return others[Math.floor(rng() * others.length)] as Decision;
    }
    if (bestAction && bestActionV > base + 0.5) return bestAction;
    if (bestAttack) return bestAttack;
    return { type: "endTurn" };
  };
}
