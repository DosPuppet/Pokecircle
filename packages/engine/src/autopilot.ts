/**
 * Automation for human players: decisions taken for them when there is nothing to think about. The engine already
 * answers questions with a single possible answer; the autopilot handles the rest that a setting allows.
 */
import type { Decision, GameState, PlayerId } from "./types";

export interface AutopilotSettings {
  /** Draw every extra card offered for the opponent's mulligans. */
  mulliganDraws: boolean;
}

export const DEFAULT_AUTOPILOT: AutopilotSettings = { mulliganDraws: true };

export function autopilotDecision(s: GameState, p: PlayerId, settings: AutopilotSettings): Decision | null {
  const pending = s.pending;
  if (!pending || pending.player !== p || s.over) return null;
  if (pending.kind === "choice" && pending.purpose === "mulliganDraw" && settings.mulliganDraws)
    return { type: "choose", values: pending.request.suggested };
  return null;
}
