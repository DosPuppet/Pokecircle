/** A game in progress: local (Web Worker, against the AI) or remote (server, against a player). */
import type { ClientMessage, ServerMessage } from "@pocketmate/server/protocol";
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

/** Server address: same host as the page (/ws, proxied to the server by Vite in dev). */
export function serverUrl(): string {
  const proto = location.protocol === "https:" ? "wss" : "ws";
  return `${proto}://${location.host}/ws`;
}

/**
 * Online game: WebSocket to the server, which runs the engine and is authoritative. Decisions are sent as for a local
 * game; the room messages are passed up unchanged.
 */
export class RemoteSession implements Session {
  private readonly ws: WebSocket;
  private readonly outbox: string[] = [];
  private closing = false;

  constructor(
    onMessage: (m: ServerMessage) => void,
    /** Connection lost without asking for it (network, server stopped). */
    onLost: () => void,
  ) {
    this.ws = new WebSocket(serverUrl());
    this.ws.onopen = () => {
      for (const m of this.outbox.splice(0)) this.ws.send(m);
    };
    this.ws.onmessage = (e) => {
      try {
        onMessage(JSON.parse(String(e.data)) as ServerMessage);
      } catch {
        // unreadable message: ignored
      }
    };
    this.ws.onclose = () => {
      if (!this.closing) onLost();
    };
  }

  raw(m: ClientMessage): void {
    const data = JSON.stringify(m);
    if (this.ws.readyState === WebSocket.OPEN) this.ws.send(data);
    else if (this.ws.readyState === WebSocket.CONNECTING) this.outbox.push(data);
  }

  send(m: ToWorker): void {
    if (m.type === "decision") this.raw({ type: "decision", decision: m.decision });
    else if (m.type === "export") this.raw({ type: "export" });
  }

  close(): void {
    this.closing = true;
    this.ws.close();
  }
}
