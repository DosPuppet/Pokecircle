/**
 * Rooms with fake clients: a game between two players driven by the random AI's decisions, deck checks, hidden
 * information in what each player receives, best of three, resume after a restart, AI seat.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomAgent } from "@pocketmate/ai";
import { PRECONS } from "@pocketmate/cards/decks";
import { type GameView, plainText } from "@pocketmate/engine";
import { afterEach, describe, expect, it } from "vitest";
import { AiPool } from "../src/aiPool";
import type { ServerMessage } from "../src/protocol";
import { DEFAULT_CONFIG, type Peer, RoomManager } from "../src/rooms";

const deck = PRECONS[0]?.main ?? [];
const deck2 = PRECONS[1]?.main ?? [];

class FakeClient implements Peer {
  messages: ServerMessage[] = [];
  send(m: ServerMessage) {
    this.messages.push(m);
  }
  get view(): GameView | null {
    for (let i = this.messages.length - 1; i >= 0; i--) {
      const m = this.messages[i];
      if (m?.type === "update") return m.view;
    }
    return null;
  }
  get room() {
    for (let i = this.messages.length - 1; i >= 0; i--) {
      const m = this.messages[i];
      if (m?.type === "room") return m.room;
    }
    return null;
  }
  errors() {
    return this.messages.filter((m) => m.type === "error");
  }
}

const config = { ...DEFAULT_CONFIG, decisionMs: 60_000 };
const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

/** Plays the game for both clients (the test reads the room's state only to pick legal decisions). */
async function playOut(
  _mgr: RoomManager,
  a: ReturnType<RoomManager["create"]>,
  b: ReturnType<RoomManager["create"]>,
  limit = 3000,
) {
  const agents = { p1: randomAgent(1), p2: randomAgent(2) };
  for (let i = 0; i < limit; i++) {
    const s = (a.room as unknown as { host: { state: import("@pocketmate/engine").GameState } }).host.state;
    if (s.over || !s.pending) break;
    const p = s.pending.player as "p1" | "p2";
    await a.room.decide((p === a.seat.seat ? a : b).seat, agents[p](s, p));
  }
}

describe("rooms", () => {
  it("plays a whole game between two clients", async () => {
    const mgr = new RoomManager(config);
    const c1 = new FakeClient();
    const c2 = new FakeClient();
    const a = mgr.create("Alice", deck, c1);
    const b = mgr.join(a.room.code, "Bob", deck2, c2);
    await a.room.enqueue(async () => {});
    expect(c1.room?.status).toBe("playing");
    await playOut(mgr, a, b);
    expect(c1.view?.over).toBe(true);
    expect(c2.view?.over).toBe(true);
    expect(c1.room?.status).toBe("over");
    mgr.closeAll();
  });

  it("refuses an invalid deck or nickname", () => {
    const mgr = new RoomManager(config);
    expect(() => mgr.create("Alice", [[60, deck[0]?.[1]]], new FakeClient())).toThrow();
    expect(() => mgr.create("  ", deck, new FakeClient())).toThrow();
    try {
      mgr.create("Alice", deck.slice(1), new FakeClient());
    } catch (e) {
      expect(plainText((e as Error).message)).toMatch(/^Deck refused: A deck has exactly 60 cards/);
    }
    mgr.closeAll();
  });

  it("never sends a player the opponent's hand, a deck or a Prize card", async () => {
    const mgr = new RoomManager(config);
    const c1 = new FakeClient();
    const c2 = new FakeClient();
    const a = mgr.create("Alice", deck, c1);
    const b = mgr.join(a.room.code, "Bob", deck2, c2);
    await a.room.enqueue(async () => {});
    await playOut(mgr, a, b, 120);
    const state = (a.room as unknown as { host: { state: import("@pocketmate/engine").GameState } }).host.state;
    for (const [client, me] of [
      [c1, "p1"],
      [c2, "p2"],
    ] as const) {
      const other = me === "p1" ? "p2" : "p1";
      const hidden = new Set([
        ...(state.players[other]?.hand ?? []),
        ...(state.players[me]?.deck ?? []),
        ...(state.players[other]?.deck ?? []),
        ...(state.players[me]?.prizes ?? []),
        ...(state.players[other]?.prizes ?? []),
      ]);
      const last = client.view;
      for (const id of Object.keys(last?.faces ?? {})) expect(hidden.has(id), `${me} sees ${id}`).toBe(false);
      expect(last?.players[other]?.hand).toBeNull();
    }
    mgr.closeAll();
  });

  it("refuses a decision of the wrong player with a rules error", async () => {
    const mgr = new RoomManager(config);
    const c1 = new FakeClient();
    const c2 = new FakeClient();
    const a = mgr.create("Alice", deck, c1);
    const b = mgr.join(a.room.code, "Bob", deck2, c2);
    await a.room.enqueue(async () => {});
    const s = (a.room as unknown as { host: { state: import("@pocketmate/engine").GameState } }).host.state;
    const wrong = s.pending?.player === "p1" ? b.seat : a.seat;
    await a.room.decide(wrong, { type: "endTurn" });
    const client = wrong === a.seat ? c1 : c2;
    expect(client.errors().some((e) => e.type === "error" && e.code === "rules")).toBe(true);
    mgr.closeAll();
  });

  it("resumes a saved game after a restart, and the player comes back with their token", async () => {
    const dir = mkdtempSync(join(tmpdir(), "pm-rooms-"));
    dirs.push(dir);
    const mgr = new RoomManager({ ...config, dataDir: dir });
    const c1 = new FakeClient();
    const c2 = new FakeClient();
    const a = mgr.create("Alice", deck, c1);
    const b = mgr.join(a.room.code, "Bob", deck2, c2);
    await a.room.enqueue(async () => {});
    await playOut(mgr, a, b, 40);
    const before = (a.room as unknown as { host: { state: import("@pocketmate/engine").GameState } }).host.state;
    const token = c1.room?.token as string;
    mgr.closeAll();
    const again = new RoomManager({ ...config, dataDir: dir });
    expect(again.size).toBe(1);
    const found = again.byToken(token);
    expect(found).not.toBeNull();
    const c1b = new FakeClient();
    found?.room.reconnect(found.seat, c1b);
    expect(c1b.view?.turn.number).toBe(before.turn.number);
    expect(c1b.view?.players.p1?.hand?.length).toBe(before.players.p1?.hand.length);
    again.closeAll();
  });

  it("best of three: the match continues until a player wins two games", async () => {
    const mgr = new RoomManager(config);
    const c1 = new FakeClient();
    const c2 = new FakeClient();
    const a = mgr.create("Alice", deck, c1, { bestOf: 3 });
    const b = mgr.join(a.room.code, "Bob", deck2, c2);
    await a.room.enqueue(async () => {});
    for (let g = 0; g < 3 && a.room.status !== "over"; g++) {
      await playOut(mgr, a, b);
      if (a.room.status === "between") {
        await a.room.next(a.seat);
        await a.room.next(b.seat);
      }
    }
    const m = c1.room?.match;
    expect(m?.bestOf).toBe(3);
    expect(Math.max(m?.wins.p1 ?? 0, m?.wins.p2 ?? 0)).toBeGreaterThanOrEqual(m?.winner ? 2 : 0);
    mgr.closeAll();
  });

  it("an AI seat plays its turns in a worker", async () => {
    const pool = new AiPool(1, 20_000);
    const mgr = new RoomManager({ ...config, aiPool: pool });
    const c1 = new FakeClient();
    const a = mgr.create("Alice", deck, c1, { ai: { level: "beginner" } });
    await a.room.enqueue(async () => {});
    expect(c1.room?.players.some((p) => p.ai === "beginner")).toBe(true);
    const agent = randomAgent(5);
    for (let i = 0; i < 400; i++) {
      const s = (a.room as unknown as { host: { state: import("@pocketmate/engine").GameState } }).host.state;
      if (s.over) break;
      if (s.pending?.player === "p1") await a.room.decide(a.seat, agent(s, "p1"));
      else await new Promise((r) => setTimeout(r, 20));
    }
    const s = (a.room as unknown as { host: { state: import("@pocketmate/engine").GameState } }).host.state;
    expect(s.turn.number).toBeGreaterThan(2);
    mgr.closeAll();
    await pool.close();
  }, 60_000);
});
