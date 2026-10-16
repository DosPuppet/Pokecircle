/**
 * The chaos AI (fuzz): often submits malformed or illegal decisions, which the engine must refuse with a RulesError
 * (never another error), the state unchanged; otherwise it plays like the random AI.
 */
import type { Agent, Decision } from "@pokecircle/engine";
import { randomAgent } from "./random";
import { mulberry32, pickOne } from "./rng";

const JUNK: unknown[] = [
  { type: "attack", index: 99 },
  { type: "attachEnergy", card: "c99999", target: "k1" },
  { type: "evolve", card: "c1", target: "k99999" },
  { type: "playTrainer", card: "nope" },
  { type: "retreat", to: "k1", discard: ["c1", "c1"] },
  { type: "choose", values: ["x", "x"] },
  { type: "choose", values: [-1] },
  { type: "setup", active: "c1", bench: ["c1"] },
  { type: "useAbility", pokemon: "k1", ability: 7 },
  { type: "unknown" },
  { type: "attack", index: -1 },
  null,
  "endTurn",
];

/** Returns [decision to try first (may be junk), the agent to use after a refusal]. */
export function chaosAgent(seed: number): { junk: () => unknown; agent: Agent } {
  const rng = mulberry32(seed ^ 0x5bd1e995);
  const agent = randomAgent(seed);
  return {
    junk: () => (rng() < 0.3 ? pickOne(rng, JUNK) : null),
    agent: (s, p) => agent(s, p) as Decision,
  };
}
