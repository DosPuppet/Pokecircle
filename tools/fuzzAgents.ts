/** AI agents of the fuzz by mode (the AI levels arrive with packages/ai/src/levels.ts). */
import { randomAgent } from "../packages/ai/src/random";
import type { Agent } from "../packages/engine/src/host";

export function aiAgentFor(_mode: string, seed: number, seat: number): Agent {
  return randomAgent(seed * 2 + seat);
}
