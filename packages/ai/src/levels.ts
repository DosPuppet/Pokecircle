/** AI levels: beginner (noisy medium), medium, expert (ISMCTS, PLAN-A P7; medium until then). */
import type { Agent } from "@pocketmate/engine";
import { mediumAgent } from "./medium";

export type AiLevel = "beginner" | "medium" | "expert";
export const AI_LEVELS: AiLevel[] = ["beginner", "medium", "expert"];

export interface AiOptions {
  seed: number;
  /** Thinking time budget (ms), for the expert level. */
  budget?: number;
}

export function aiAgent(level: AiLevel, o: AiOptions): Agent {
  if (level === "beginner") return mediumAgent({ seed: o.seed, noise: 0.35 });
  return mediumAgent({ seed: o.seed });
}
