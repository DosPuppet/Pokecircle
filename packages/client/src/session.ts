/** A game in progress: local (Web Worker, against the AI); the online session comes with the server (PLAN-A P4). */
import type { FromWorker, ToWorker } from "./protocol";

export interface Session {
  send(m: ToWorker): void;
  close(): void;
}

export class LocalSession implements Session {
  private readonly worker: Worker;

  constructor(onMessage: (m: FromWorker) => void) {
    this.worker = new Worker(new URL("./worker/game.worker.ts", import.meta.url), { type: "module" });
    this.worker.onmessage = (e: MessageEvent<FromWorker>) => onMessage(e.data);
    this.worker.onerror = (e) => console.error("Game worker error:", e.message);
  }

  send(m: ToWorker): void {
    this.worker.postMessage(m);
  }

  close(): void {
    this.worker.terminate();
  }
}
