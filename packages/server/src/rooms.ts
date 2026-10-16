/**
 * Rooms of two players: one game (GameHost), a timer per decision with a rope, disconnections with a return delay (a
 * player who does not come back concedes), rematch, best of three, an optional AI seat. The server is authoritative on
 * everything. Games are saved (one file per room: header, then one decision per line) and resumed after a restart by
 * replaying their decisions.
 */
import { createHash, randomBytes, randomInt, randomUUID } from "node:crypto";
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { AI_LEVELS, type AiLevel } from "@pocketmate/ai";
import { CARDS, type DeckEntries, type DeckList, type Format, PRINTS } from "@pocketmate/cards";
import { validateDeck } from "@pocketmate/cards/decklist";
import { PRECONS } from "@pocketmate/cards/decks";
import {
  type AsyncAgent,
  type CardDef,
  createGame,
  type Decision,
  fallbackDecision,
  type GameEvent,
  GameHost,
  type GameOptions,
  type GameRecord,
  type GameState,
  type GameView,
  msg,
  newRecord,
  outcomeHash,
  type PlayerId,
  RULES_VERSION,
  replayChecked,
} from "@pocketmate/engine";
import type { AiPool } from "./aiPool";
import type { Clock, ErrorCode, MatchInfo, RoomInfo, Seat, ServerMessage } from "./protocol";

/** Connection of a player (WebSocket in production, fake client in the tests). */
export interface Peer {
  send(msg: ServerMessage): void;
}

export interface RoomConfig {
  decisionMs: number;
  ropeMs: number;
  maxTimeouts: number;
  graceMs: number;
  cleanupMs: number;
  waitingMs: number;
  maxRooms: number;
  maxRoomsPerIp: number;
  /** Save directory of the games (absent: games in memory only). */
  dataDir?: string;
  /** JavaScript heap (MB) beyond which no room is created. */
  maxHeapMb?: number;
  aiPool?: AiPool;
  maxAiRooms?: number;
  maxRssMb?: number;
}

export const DEFAULT_CONFIG: RoomConfig = {
  decisionMs: 90_000,
  ropeMs: 20_000,
  maxTimeouts: 3,
  graceMs: 60_000,
  cleanupMs: 5 * 60_000,
  waitingMs: 30 * 60_000,
  maxRooms: 200,
  maxRoomsPerIp: 4,
  maxHeapMb: 384,
  maxAiRooms: 12,
  maxRssMb: 640,
};

/** Digest of a secret (reconnection token, address): only the digest is written to disk. */
export const digest = (x: string): string => createHash("sha256").update(x).digest("hex");

/** Key of an address for the caps: the IPv4 address, or the /64 prefix of an IPv6 address. */
export function ipKey(ip: string): string {
  const v4 = /^(?:::ffff:)?(\d+\.\d+\.\d+\.\d+)$/i.exec(ip);
  if (v4) return v4[1] as string;
  if (!ip.includes(":")) return ip;
  const [head = "", tail = ""] = ip.toLowerCase().split("%")[0]?.split("::") ?? [];
  const h = head ? head.split(":") : [];
  const t = tail ? tail.split(":") : [];
  const full = ip.includes("::") ? [...h, ...Array(Math.max(0, 8 - h.length - t.length)).fill("0"), ...t] : h;
  return `${full
    .slice(0, 4)
    .map((x) => x.replace(/^0+(?=.)/, ""))
    .join(":")}::/64`;
}

const KEEP_ASIDE_MS = 7 * 24 * 3_600_000;
const INTERRUPTED_FILE = "interrupted.json";

/** Error meant for the client (player-facing message, `msg`: the client translates it). */
export class ClientError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
  ) {
    super(message);
  }
}

export class RulesChangedError extends Error {
  constructor(readonly rules: number) {
    super(`game recorded with rules version ${rules} (engine: ${RULES_VERSION})`);
  }
}

interface SavedRoom {
  code: string;
  seats: { seat: Seat; name: string; deck: DeckEntries; ai?: AiLevel; tokenHash: string }[];
  creator?: string;
  record: GameRecord;
  match?: MatchInfo;
}

interface SeatState {
  seat: Seat;
  name: string;
  deck: DeckEntries;
  ai?: AiLevel;
  token: string;
  tokenHash: string;
  peer: Peer | null;
  timeouts: number;
  rematch: boolean;
  /** Between two games of a BO3: ready for the next one. */
  ready: boolean;
  graceDeadline: number | null;
  graceTimer: ReturnType<typeof setTimeout> | null;
}

const AI_LEVEL_LABELS: Record<AiLevel, string> = {
  beginner: msg("ctx:aiSeat|beginner"),
  medium: msg("ctx:aiSeat|medium"),
  expert: msg("ctx:aiSeat|expert"),
};

/** Precons the AI can play in a format. */
function aiDecks(format: Format): DeckList[] {
  return PRECONS.filter((d) => validateDeck(d.main, format).length === 0);
}

const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const MAX_DECK_LINES = 80;

export function cleanName(raw: unknown): string {
  const name = String(raw ?? "")
    // biome-ignore lint/suspicious/noControlCharactersInRegex: control characters removed on purpose
    .replace(/[\u0000-\u001f\u007f<>]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 20);
  if (!name) throw new ClientError("name", msg("Choose a nickname."));
  return name;
}

/** Received deck lines: [count, definition id, print?], shape checked; then legal in the format and playable. */
export function checkDeck(raw: unknown, format: Format = "standard"): DeckEntries {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > MAX_DECK_LINES) throw new ClientError("deck", msg("Invalid deck."));
  const out: DeckEntries = [];
  for (const line of raw) {
    if (!Array.isArray(line) || (line.length !== 2 && line.length !== 3)) throw new ClientError("deck", msg("Invalid deck."));
    const [n, id, print] = line as [unknown, unknown, unknown];
    if (!Number.isInteger(n) || (n as number) < 1 || (n as number) > 60 || typeof id !== "string" || !CARDS[id])
      throw new ClientError("deck", msg("Invalid deck."));
    // A print of another card is dropped (the card keeps its default art).
    const ok = typeof print === "string" && PRINTS[print]?.defId === id;
    out.push(ok ? [n as number, id, print as string] : [n as number, id]);
  }
  const problems = validateDeck(out, format);
  if (problems.length) throw new ClientError("deck", msg("Deck refused: {error}.", { error: problems[0] as string }));
  return out;
}

/** Definitions and prints of a deck, in order. */
function buildDeck(entries: DeckEntries): { deck: CardDef[]; prints: (string | null)[] } {
  const deck: CardDef[] = [];
  const prints: (string | null)[] = [];
  for (const [n, id, print] of entries)
    for (let i = 0; i < n; i++) {
      deck.push(CARDS[id] as CardDef);
      prints.push(print ?? null);
    }
  return { deck, prints };
}

export class Room {
  readonly seats: SeatState[] = [];
  status: RoomInfo["status"] = "waiting";
  match: MatchInfo = { bestOf: 1, wins: { p1: 0, p2: 0 }, game: 0, winner: null };
  /** Who chooses to go first in the next game (the loser of the previous one); null: a coin flip. */
  private nextChooser: Seat | null = null;
  private host: GameHost | null = null;
  private outbox = new Map<Seat, { view: GameView; events: GameEvent[] }[]>();
  private clock: { player: Seat; deadline: number; timer: ReturnType<typeof setTimeout> } | null = null;
  private cleanupTimer: ReturnType<typeof setTimeout> | null = null;
  private queue: Promise<void> = Promise.resolve();
  private waitingTimer: ReturnType<typeof setTimeout> | null = null;
  creator: string | undefined;

  constructor(
    readonly code: string,
    private readonly config: RoomConfig,
    private readonly onClose: (room: Room) => void,
  ) {
    this.waitingTimer = setTimeout(() => {
      if (this.status !== "waiting") return;
      for (const s of this.seats)
        s.peer?.send({ type: "error", code: "closed", message: msg("Room closed: no opponent joined it in time.") });
      this.close();
    }, config.waitingMs);
    this.waitingTimer.unref?.();
  }

  seatOf(token: string): SeatState | undefined {
    const h = digest(token);
    const seat = this.seats.find((s) => s.tokenHash === h);
    if (seat) seat.token = token;
    return seat;
  }

  addPlayer(name: string, deck: DeckEntries, peer: Peer | null, ai?: AiLevel): SeatState {
    if (this.seats.length >= 2) throw new ClientError("full", msg("This room is full."));
    const taken = new Set(this.seats.map((s) => s.seat));
    const free: Seat = taken.has("p1") ? "p2" : "p1";
    const seat: SeatState = {
      seat: free,
      name,
      deck,
      ...(ai ? { ai } : {}),
      token: randomUUID(),
      tokenHash: "",
      peer,
      timeouts: 0,
      rematch: false,
      ready: false,
      graceDeadline: null,
      graceTimer: null,
    };
    seat.tokenHash = digest(seat.token);
    this.seats.push(seat);
    this.seats.sort((a, b) => (a.seat < b.seat ? -1 : 1));
    this.cancelCleanup();
    this.broadcastRoom();
    if (this.seats.length === 2) void this.enqueue(() => this.start());
    return seat;
  }

  get hasAi(): boolean {
    return this.seats.some((s) => s.ai);
  }

  // —— game ——

  private async start(): Promise<void> {
    if (this.waitingTimer) clearTimeout(this.waitingTimer);
    this.waitingTimer = null;
    for (const s of this.seats) {
      s.timeouts = 0;
      s.rematch = false;
      s.ready = false;
    }
    this.match = { ...this.match, game: this.match.game + 1 };
    const opts: GameOptions = {
      seed: randomInt(0, 2 ** 31),
      players: this.seats.map((s) => {
        const b = buildDeck(s.deck);
        return { id: s.seat, name: s.name, deck: b.deck, prints: b.prints };
      }) as GameOptions["players"],
      ...(this.nextChooser ? { chooser: this.nextChooser } : {}),
    };
    const record = newRecord(opts);
    const { state, events } = createGame(opts);
    this.status = "playing";
    this.saveHeader(record);
    const host = this.newHost(state, record, events);
    this.host = host;
    this.broadcastRoom();
    await this.advancing(host, () => host.run());
  }

  /** Runs an action on the game, then the timer and the sends (even if the action failed midway). */
  async advancing(host: GameHost, fn: () => Promise<void>): Promise<void> {
    const before = host.state;
    try {
      await fn();
    } catch (e) {
      console.error(`Room ${this.code}: internal error`, e);
      throw e;
    } finally {
      if (host.state !== before || this.outbox.size) this.afterStep();
    }
  }

  private aiAgentFor(seat: Seat, level: AiLevel): AsyncAgent {
    return (state, player) => {
      const p = state.pending;
      const pool = this.config.aiPool;
      if (!pool || !p) return fallbackDecision(state, p ?? { kind: "main", player });
      const n = this.host?.record?.decisions.length ?? 0;
      const seed = (Number(this.host?.record?.seed ?? 0) ^ (n * 2654435761) ^ seat.charCodeAt(1)) >>> 0;
      return pool.decide({ room: this.code, seat, level, seed, state });
    };
  }

  private agents(): Partial<Record<Seat, AsyncAgent>> {
    const out: Partial<Record<Seat, AsyncAgent>> = {};
    for (const s of this.seats) if (s.ai) out[s.seat] = this.aiAgentFor(s.seat, s.ai);
    return out;
  }

  private newHost(state: GameState, record: GameRecord, events: GameEvent[]): GameHost {
    return new GameHost(
      state,
      {
        agents: this.agents(),
        frames: true,
        onUpdate: (p, view, evts) => this.buffer(p as Seat, view, evts),
        record,
        onRecord: (p, d, after) => this.appendDecision(p, d, after),
      },
      events,
    );
  }

  // —— save to disk ——

  private get file(): string | null {
    return this.config.dataDir ? join(this.config.dataDir, `${this.code}.jsonl`) : null;
  }

  private saveHeader(record: GameRecord): void {
    const file = this.file;
    if (!file || !this.config.dataDir) return;
    try {
      mkdirSync(this.config.dataDir, { recursive: true, mode: 0o700 });
      const saved: SavedRoom = {
        code: this.code,
        seats: this.seats.map((s) => ({
          seat: s.seat,
          name: s.name,
          deck: s.deck,
          ...(s.ai ? { ai: s.ai } : {}),
          tokenHash: s.tokenHash,
        })),
        ...(this.creator ? { creator: this.creator } : {}),
        record: { ...record, decisions: [], checkpoints: [] },
        match: this.match,
      };
      // Readable by the server account only: the save reveals the decks.
      writeFileSync(file, `${JSON.stringify(saved)}\n`, { mode: 0o600 });
    } catch (e) {
      console.error(`Room ${this.code}: save failed`, e);
    }
  }

  private appendDecision(player: PlayerId, d: Decision, after: GameState): void {
    const file = this.file;
    if (!file) return;
    try {
      appendFileSync(file, `${JSON.stringify([player, d, outcomeHash(after)])}\n`);
    } catch (e) {
      console.error(`Room ${this.code}: save failed`, e);
    }
  }

  /** Resume of a saved room (server restart): the game is replayed, the players come back with their token. */
  static restore(
    saved: SavedRoom,
    decisions: [PlayerId, Decision][],
    checkpoints: [number, string][],
    config: RoomConfig,
    onClose: (room: Room) => void,
  ): Room {
    const record: GameRecord = { ...saved.record, decisions, checkpoints };
    const r = replayChecked(record, CARDS);
    const rules = saved.record.rules ?? 0;
    if (rules !== RULES_VERSION) {
      if (r.diverged || checkpoints.length < decisions.length) throw new RulesChangedError(rules);
    } else if (r.diverged) throw new Error(`replay differs from the game played after ${r.applied} decisions`);
    const room = new Room(saved.code, config, onClose);
    room.creator = saved.creator;
    for (const s of saved.seats)
      room.seats.push({
        ...s,
        token: "",
        peer: null,
        timeouts: 0,
        rematch: false,
        ready: false,
        graceDeadline: null,
        graceTimer: null,
      });
    if (saved.match) room.match = saved.match;
    room.host = room.newHost(r.state, record, []);
    room.status = "playing";
    if (room.waitingTimer) clearTimeout(room.waitingTimer);
    room.waitingTimer = null;
    for (const seat of room.seats) if (!seat.ai) room.disconnect(seat);
    room.afterStep();
    const pending = room.host.state.pending;
    if (pending && !room.host.state.over && room.seats.find((x) => x.seat === pending.player)?.ai)
      void room.enqueue(() => room.advancing(room.host as GameHost, () => (room.host as GameHost).run()));
    return room;
  }

  private buffer(p: Seat, view: GameView, events: GameEvent[]): void {
    this.outbox.set(p, [...(this.outbox.get(p) ?? []), { view, events }]);
  }

  private afterStep(): void {
    const host = this.host;
    if (!host) return;
    const s = host.state;
    if (s.over) {
      this.stopClock();
      if (this.status === "playing") {
        this.finishGame(s.winner as Seat | null);
        this.broadcastRoom();
      }
      this.scheduleCleanupIfIdle();
    } else if (s.pending) {
      const who = s.pending.player as Seat;
      if (this.seats.find((x) => x.seat === who)?.ai) this.stopClock();
      else this.armClock(who);
    }
    for (const [p, frames] of this.outbox)
      for (const u of frames) this.sendTo(p, { type: "update", ...u, clock: this.clockInfo() });
    this.outbox.clear();
  }

  /** End of a game: win counted; in a BO3, as long as nobody has two wins, the loser chooses who starts the next. */
  private finishGame(winner: Seat | null): void {
    const wins = { ...this.match.wins };
    if (winner) wins[winner] = (wins[winner] ?? 0) + 1;
    const need = Math.ceil(this.match.bestOf / 2);
    const w1 = wins.p1 ?? 0;
    const w2 = wins.p2 ?? 0;
    const decided = w1 >= need || w2 >= need || this.match.game >= this.match.bestOf;
    const matchWinner = decided ? (w1 > w2 ? "p1" : w2 > w1 ? "p2" : null) : null;
    this.match = { ...this.match, wins, winner: matchWinner };
    this.nextChooser = winner ? (winner === "p1" ? "p2" : "p1") : null;
    this.status = decided ? "over" : "between";
    // An AI seat is always ready.
    for (const s of this.seats) s.ready = !!s.ai;
  }

  /** Between two games of a BO3: this player is ready; the next game starts when both are. */
  next(seat: SeatState): Promise<void> {
    return this.enqueue(async () => {
      if (this.status !== "between") throw new ClientError("state", msg("No game to start now."));
      seat.ready = true;
      this.broadcastRoom();
      if (this.seats.every((s) => s.ready)) await this.start();
    });
  }

  private clockInfo(): Clock | null {
    if (!this.clock) return null;
    return {
      player: this.clock.player,
      remainingMs: Math.max(0, this.clock.deadline - Date.now()),
      totalMs: this.config.decisionMs,
      ropeMs: this.config.ropeMs,
      timeouts: Object.fromEntries(this.seats.map((s) => [s.seat, s.timeouts])) as Partial<Record<Seat, number>>,
      maxTimeouts: this.config.maxTimeouts,
    };
  }

  private armClock(player: Seat): void {
    this.stopClock();
    const timer = setTimeout(() => void this.enqueue(() => this.expire(player)), this.config.decisionMs);
    timer.unref?.();
    this.clock = { player, deadline: Date.now() + this.config.decisionMs, timer };
  }

  private stopClock(): void {
    if (this.clock) clearTimeout(this.clock.timer);
    this.clock = null;
  }

  /** Time is up: the default decision; a loss beyond the number of timeouts allowed. */
  private async expire(player: Seat): Promise<void> {
    const host = this.host;
    const seat = this.seats.find((s) => s.seat === player);
    const p = host?.state.pending;
    if (!host || !seat || host.state.over || !p || p.player !== player) return;
    seat.timeouts += 1;
    await this.advancing(host, async () => {
      let played = false;
      if (seat.timeouts < this.config.maxTimeouts) {
        try {
          played = (await host.submitHuman(player, fallbackDecision(host.state, p))) === null;
        } catch (e) {
          console.error(`Room ${this.code}: default decision failed`, e);
        }
      }
      if (!played && !host.state.over && host.state.pending === p) await host.submitHuman(player, { type: "concede" });
    });
  }

  exportRecord(): GameRecord | null {
    const host = this.host;
    return host?.state.over && host.record ? structuredClone(host.record) : null;
  }

  decide(seat: SeatState, d: Decision): Promise<void> {
    return this.enqueue(async () => {
      const host = this.host;
      if (!host || this.status !== "playing") throw new ClientError("state", msg("No game in progress."));
      await this.advancing(host, async () => {
        const error = await host.submitHuman(seat.seat, d);
        if (error) seat.peer?.send({ type: "error", code: "rules", message: error });
      });
    });
  }

  rematch(seat: SeatState): Promise<void> {
    return this.enqueue(async () => {
      if (this.status !== "over") throw new ClientError("state", msg("The game is not over."));
      seat.rematch = true;
      this.broadcastRoom();
      if (this.seats.length === 2 && this.seats.every((s) => s.ai || (s.rematch && s.peer))) {
        this.match = { ...this.match, wins: {}, game: 0, winner: null };
        this.nextChooser = null;
        await this.start();
      }
    });
  }

  // —— connections ——

  reconnect(seat: SeatState, peer: Peer): void {
    seat.peer = peer;
    seat.graceDeadline = null;
    if (seat.graceTimer) clearTimeout(seat.graceTimer);
    seat.graceTimer = null;
    this.cancelCleanup();
    this.sendRoom(seat);
    if (this.host) peer.send({ type: "update", view: this.host.view(seat.seat), events: [], clock: this.clockInfo() });
    this.sendOpponentStatus();
  }

  disconnect(seat: SeatState): void {
    seat.peer = null;
    if (this.status === "playing") {
      seat.graceDeadline = Date.now() + this.config.graceMs;
      seat.graceTimer = setTimeout(() => void this.enqueue(() => this.abandon(seat)), this.config.graceMs);
      seat.graceTimer.unref?.();
    }
    this.broadcastRoom();
    this.sendOpponentStatus();
    this.scheduleCleanupIfIdle();
  }

  leave(seat: SeatState): Promise<void> {
    return this.enqueue(async () => {
      if (this.status === "waiting") {
        this.seats.splice(this.seats.indexOf(seat), 1);
        if (!this.seats.some((s) => !s.ai)) this.close();
        else this.broadcastRoom();
        return;
      }
      seat.peer = null;
      if (this.status === "between") {
        const other = this.seats.find((s) => s !== seat)?.seat ?? null;
        this.match = { ...this.match, winner: other };
        this.status = "over";
      }
      await this.abandon(seat);
      this.broadcastRoom();
      this.scheduleCleanupIfIdle();
    });
  }

  private async abandon(seat: SeatState): Promise<void> {
    if (seat.graceTimer) clearTimeout(seat.graceTimer);
    seat.graceTimer = null;
    seat.graceDeadline = null;
    const host = this.host;
    if (!host || this.status !== "playing" || host.state.over) return;
    await this.advancing(host, async () => {
      await host.submitHuman(seat.seat, { type: "concede" });
    });
    if (this.hasAi && !this.seats.some((s) => !s.ai && s.peer)) this.close();
  }

  private sendOpponentStatus(): void {
    for (const s of this.seats) {
      const other = this.seats.find((o) => o !== s);
      if (!other) continue;
      s.peer?.send({
        type: "opponent",
        connected: !!other.peer || !!other.ai,
        remainingMs: other.graceDeadline ? Math.max(0, other.graceDeadline - Date.now()) : null,
      });
    }
  }

  private scheduleCleanupIfIdle(): void {
    const idle = this.seats.every((s) => !s.peer) && this.status !== "playing";
    if (!idle || this.cleanupTimer) return;
    this.cleanupTimer = setTimeout(() => this.close(), this.config.cleanupMs);
    this.cleanupTimer.unref?.();
  }

  private cancelCleanup(): void {
    if (this.cleanupTimer) clearTimeout(this.cleanupTimer);
    this.cleanupTimer = null;
  }

  close(): void {
    this.shutdown();
    this.config.aiPool?.forget(this.code);
    const file = this.file;
    if (file) rmSync(file, { force: true });
    this.onClose(this);
  }

  /** Server shutdown: the timers stop, the save stays (the game will be resumed on restart). */
  shutdown(): void {
    this.stopClock();
    this.cancelCleanup();
    if (this.waitingTimer) clearTimeout(this.waitingTimer);
    for (const s of this.seats) if (s.graceTimer) clearTimeout(s.graceTimer);
  }

  // —— sending ——

  private sendTo(p: Seat, m: ServerMessage): void {
    this.seats.find((s) => s.seat === p)?.peer?.send(m);
  }

  private sendRoom(seat: SeatState): void {
    seat.peer?.send({
      type: "room",
      room: {
        code: this.code,
        seat: seat.seat,
        token: seat.token,
        status: this.status,
        players: this.seats.map((s) => ({
          seat: s.seat,
          name: s.name,
          connected: !!s.peer || !!s.ai,
          rematch: s.rematch || !!s.ai,
          ...(s.ai ? { ai: s.ai } : {}),
        })),
        match: this.match,
      },
    });
  }

  private broadcastRoom(): void {
    for (const s of this.seats) this.sendRoom(s);
  }

  /** Runs the actions one by one: a decision, a timeout and a disconnection never overlap on the same game. */
  enqueue(fn: () => Promise<void>): Promise<void> {
    const run = this.queue.then(fn);
    this.queue = run.catch(() => {});
    return run;
  }
}

export class RoomManager {
  private readonly rooms = new Map<string, Room>();
  private readonly interrupted = new Map<string, number>();

  constructor(private readonly config: RoomConfig = DEFAULT_CONFIG) {
    if (config.dataDir) this.restore(config.dataDir);
  }

  private openedBy(creator: string): number {
    let n = 0;
    for (const r of this.rooms.values()) if (r.creator === creator) n++;
    return n;
  }

  private saveInterrupted(dir: string): void {
    try {
      writeFileSync(join(dir, INTERRUPTED_FILE), JSON.stringify(Object.fromEntries(this.interrupted)), { mode: 0o600 });
    } catch (e) {
      console.error("Interrupted tokens: save failed", e);
    }
  }

  /** Resumes the saved games; an unreadable file is set aside (`.bad`), one of other rules too (`.rules<N>`). */
  private restore(dir: string): void {
    if (!existsSync(dir)) return;
    const now = Date.now();
    try {
      const raw = JSON.parse(readFileSync(join(dir, INTERRUPTED_FILE), "utf8")) as Record<string, number>;
      for (const [h, at] of Object.entries(raw))
        if (typeof at === "number" && now - at < KEEP_ASIDE_MS) this.interrupted.set(h, at);
    } catch {
      // No file yet: no known interrupted token.
    }
    for (const name of readdirSync(dir).filter((f) => /\.jsonl\.(?:bad|rules\d+)$/.test(f))) {
      const file = join(dir, name);
      if (now - statSync(file).mtimeMs > KEEP_ASIDE_MS) rmSync(file, { force: true });
    }
    const files = readdirSync(dir)
      .filter((f) => f.endsWith(".jsonl"))
      .map((name) => ({ name, mtime: statSync(join(dir, name)).mtimeMs }))
      .sort((a, b) => b.mtime - a.mtime);
    for (const { name } of files.slice(this.config.maxRooms)) renameSync(join(dir, name), join(dir, `${name}.bad`));
    for (const { name } of files.slice(0, this.config.maxRooms)) {
      const file = join(dir, name);
      let saved: SavedRoom | null = null;
      try {
        const [head, ...lines] = readFileSync(file, "utf8").split("\n").filter(Boolean);
        saved = JSON.parse(head ?? "null") as SavedRoom;
        const rows = lines.map((l) => JSON.parse(l) as [PlayerId, Decision, string?]);
        const decisions = rows.map(([p, d]): [PlayerId, Decision] => [p, d]);
        const checkpoints = rows.flatMap(([, , h], i): [number, string][] => (typeof h === "string" ? [[i + 1, h]] : []));
        if (!saved?.code || !Array.isArray(saved.seats) || saved.record?.format !== "pocketmate-game")
          throw new Error("unknown format");
        const room = Room.restore(saved, decisions, checkpoints, this.config, (r) => this.rooms.delete(r.code));
        this.rooms.set(room.code, room);
        console.log(`Room ${room.code} resumed (${decisions.length} decisions)`);
      } catch (e) {
        if (e instanceof RulesChangedError && saved) {
          for (const s of saved.seats) this.interrupted.set(s.tokenHash, now);
          console.warn(`Room ${saved.code} interrupted by the rules update: ${e.message}`);
          renameSync(file, `${file}.rules${e.rules}`);
        } else {
          console.error(`Save ${name} unreadable, set aside:`, e);
          renameSync(file, `${file}.bad`);
        }
      }
    }
    this.saveInterrupted(dir);
  }

  wasInterrupted(token: unknown): boolean {
    return typeof token === "string" && this.interrupted.has(digest(token));
  }

  get size(): number {
    return this.rooms.size;
  }

  private newCode(): string {
    for (;;) {
      const code = [...randomBytes(6)].map((b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join("");
      if (!this.rooms.has(code)) return code;
    }
  }

  create(
    name: unknown,
    deck: unknown,
    peer: Peer,
    opts: { bestOf?: unknown; format?: unknown; ai?: unknown; ip?: string } = {},
  ): {
    room: Room;
    seat: SeatState;
  } {
    const n = cleanName(name);
    const format: Format = opts.format === "unlimited" ? "unlimited" : "standard";
    const d = checkDeck(deck, format);
    if (this.rooms.size >= this.config.maxRooms) throw new ClientError("busy", msg("Server full, try again later."));
    const heapMb = process.memoryUsage().heapUsed / 1_048_576;
    if (this.config.maxHeapMb && heapMb > this.config.maxHeapMb)
      throw new ClientError("busy", msg("Server full, try again later."));
    const creator = opts.ip ? digest(ipKey(opts.ip)) : undefined;
    if (creator && this.openedBy(creator) >= this.config.maxRoomsPerIp)
      throw new ClientError("busy", msg("Too many rooms open from this address: close one before creating another."));
    const ai = this.checkAi(opts.ai, format);
    const room = new Room(this.newCode(), this.config, (r) => this.rooms.delete(r.code));
    room.creator = creator;
    room.match = { ...room.match, bestOf: opts.bestOf === 3 ? 3 : 1, ...(format !== "standard" ? { format } : {}) };
    this.rooms.set(room.code, room);
    const seat = room.addPlayer(n, d, peer);
    if (ai) {
      const decks = aiDecks(format);
      const deckList = decks[randomInt(0, decks.length)] as DeckList;
      room.addPlayer(msg("AI ({level})", { level: AI_LEVEL_LABELS[ai] }), deckList.main, null, ai);
    }
    return { room, seat };
  }

  private checkAi(raw: unknown, format: Format): AiLevel | null {
    const r = raw as { level?: unknown } | null | undefined;
    if (!r) return null;
    if (!this.config.aiPool) throw new ClientError("busy", msg("The AI is not available on this server."));
    const level: AiLevel = (AI_LEVELS as readonly unknown[]).includes(r.level) ? (r.level as AiLevel) : "medium";
    let aiRooms = 0;
    for (const room of this.rooms.values()) if (room.hasAi) aiRooms++;
    const rssMb = process.memoryUsage().rss / 1_048_576;
    if (aiRooms >= (this.config.maxAiRooms ?? 12) || (this.config.maxRssMb && rssMb > this.config.maxRssMb))
      throw new ClientError("busy", msg("Too many games against the AI in progress on the server, try again later."));
    if (aiDecks(format).length === 0) throw new ClientError("deck", msg("No deck the AI can play in this format."));
    return level;
  }

  join(code: unknown, name: unknown, deck: unknown, peer: Peer): { room: Room; seat: SeatState } {
    const room = this.rooms.get(
      String(code ?? "")
        .toUpperCase()
        .trim(),
    );
    if (!room) throw new ClientError("room", msg("Room not found: check the code."));
    if (room.status !== "waiting" || room.seats.length >= 2) throw new ClientError("full", msg("This room is full."));
    const d = checkDeck(deck, room.match.format ?? "standard");
    return { room, seat: room.addPlayer(cleanName(name), d, peer) };
  }

  byToken(token: unknown): { room: Room; seat: SeatState } | null {
    if (typeof token !== "string") return null;
    for (const room of this.rooms.values()) {
      const seat = room.seatOf(token);
      if (seat) return { room, seat };
    }
    return null;
  }

  closeAll(): void {
    for (const room of [...this.rooms.values()]) room.shutdown();
    this.rooms.clear();
  }
}
