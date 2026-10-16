/**
 * Server AI worker: thinks about a decision of an AI seat off the main thread, so that the other rooms are not
 * blocked. Receives the game state without its card definitions (kept here per room).
 */
import { parentPort } from "node:worker_threads";
import { type AiLevel, aiAgent } from "@pokecircle/ai";
import type { CardDef, Decision, GameState } from "@pokecircle/engine";

export type ToAiWorker =
  | {
      type: "decide";
      id: number;
      room: string;
      seat: string;
      level: AiLevel;
      seed: number;
      state: Omit<GameState, "defs">;
      defs?: Record<string, CardDef>;
    }
  | { type: "forget"; room: string };

export type FromAiWorker = { id: number; decision: Decision } | { id: number; error: string };

const defsByRoom = new Map<string, Record<string, CardDef>>();
const MAX_ROOMS = 64;
/** Thinking time of the expert AI per decision (ms). */
const AI_BUDGET = 700;

parentPort?.on("message", (m: ToAiWorker) => {
  if (m.type === "forget") {
    defsByRoom.delete(m.room);
    return;
  }
  let defs = defsByRoom.get(m.room);
  if (!defs) {
    defs = {};
    defsByRoom.set(m.room, defs);
    if (defsByRoom.size > MAX_ROOMS) defsByRoom.delete(defsByRoom.keys().next().value as string);
  }
  if (m.defs) Object.assign(defs, m.defs);
  try {
    const state = { ...m.state, defs } as GameState;
    const decision = aiAgent(m.level, { seed: m.seed, budget: AI_BUDGET })(state, m.seat);
    parentPort?.postMessage({ id: m.id, decision } satisfies FromAiWorker);
  } catch (e) {
    parentPort?.postMessage({ id: m.id, error: e instanceof Error ? e.message : String(e) } satisfies FromAiWorker);
  }
});
