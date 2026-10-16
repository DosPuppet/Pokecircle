/** AI agents of the fuzz by mode: `mixed` (random against medium), `levels` (the AI levels in turn). */
import { aiAgent } from "../packages/ai/src/levels";
import { randomAgent } from "../packages/ai/src/random";
import type { Agent } from "../packages/engine/src/host";

export function aiAgentFor(mode: string, seed: number, seat: number): Agent {
  if (mode === "mixed") return seat === 0 ? randomAgent(seed) : aiAgent("medium", { seed: seed + 7 });
  const levels = ["beginner", "medium", "expert"] as const;
  // Expert: few iterations (the fuzz checks legality, not strength).
  return aiAgent(levels[(seed + seat) % levels.length] as (typeof levels)[number], { seed: seed * 3 + seat, iterations: 8 });
}
