/**
 * The `op → handler` table of the effect interpreter (`runResolution`, effects.ts). The `ops/*.ts` modules export their
 * `HANDLERS`, registered by `ops/index.ts`, which `game.ts` imports: effects.ts does not import the handlers.
 */
import type { OpResult } from "./effects";
import type { Effect, GameState, Resolution } from "./types";

/** Handling of an effect `op`: state, resolution, effect (typed by its `op`), key of its questions. */
export type Handler<E extends Effect> = (s: GameState, r: Resolution, e: E, key: (suffix: string) => string) => OpResult;
export type AnyHandler = Handler<never>;
export type OpHandlers = { [K in Effect["op"]]?: Handler<Extract<Effect, { op: K }>> };

const registry: Record<string, AnyHandler> = {};

export function registerOps(handlers: OpHandlers): void {
  for (const [op, handler] of Object.entries(handlers as Record<string, AnyHandler>)) {
    if (registry[op] && registry[op] !== handler) throw new Error(`effect op "${op}" registered twice`);
    registry[op] = handler;
  }
}

export function opHandler(op: string): AnyHandler | undefined {
  return registry[op];
}

export function registeredOps(): string[] {
  return Object.keys(registry);
}
