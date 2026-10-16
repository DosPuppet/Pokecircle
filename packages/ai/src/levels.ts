/** AI levels: beginner (noisy medium), medium (one-step simulation), expert (ISMCTS, `ismcts.ts`). */
import type { Agent } from "@pokecircle/engine";
import { expertAgent } from "./ismcts";
import { mediumAgent } from "./medium";

export type AiLevel = "beginner" | "medium" | "expert";
export const AI_LEVELS: AiLevel[] = ["beginner", "medium", "expert"];

export interface AiOptions {
  seed: number;
  /** Thinking time budget per decision (ms), for the expert level (interface, server). */
  budget?: number;
  /** Fixed number of iterations per searched decision, for the expert level (tests, arena): reproducible. */
  iterations?: number;
}

/** Iterations of the expert level when neither a budget nor a number is given. */
export const EXPERT_ITERATIONS = 48;

export function aiAgent(level: AiLevel, o: AiOptions): Agent {
  if (level === "beginner") return mediumAgent({ seed: o.seed, noise: 0.35 });
  if (level === "expert")
    return expertAgent(
      o.budget !== undefined ? { seed: o.seed, ms: o.budget } : { seed: o.seed, iterations: o.iterations ?? EXPERT_ITERATIONS },
    );
  return mediumAgent({ seed: o.seed });
}
