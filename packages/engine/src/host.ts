/**
 * GameHost: runs a game by consulting, for each pending decision, the player's AI, then the autopilot, then the human.
 * The same host runs in a Web Worker (game against the AI) or in the Node server (online game).
 */
import { type AutopilotSettings, autopilotDecision, DEFAULT_AUTOPILOT } from "./autopilot";
import { RulesError } from "./errors";
import { collectEvents } from "./events";
import { submit } from "./game";
import { endGame } from "./knockout";
import { MAX_AUTOMATIC_DECISIONS } from "./limits";
import { type GameRecord, recordDecision } from "./record";
import { cloneState } from "./state";
import type { Decision, GameEvent, GameState, PendingDecision, PlayerId } from "./types";
import { filterEvents, type GameView, projectView } from "./view";

/** An AI: receives the full state and returns a decision (it must read only public information). */
export type Agent = (state: GameState, player: PlayerId) => Decision;
/** An AI that thinks elsewhere (server: in a worker): the host waits for its decision. */
export type AsyncAgent = (state: GameState, player: PlayerId) => Decision | Promise<Decision>;

export interface HostOptions {
  agents?: Partial<Record<PlayerId, Agent | AsyncAgent>>;
  /** Called for each human player when their view changes. */
  onUpdate?: (player: PlayerId, view: GameView, events: GameEvent[]) => void;
  /** Pause between two visible actions of the AI (ms), so that the human can follow. */
  aiDelay?: number;
  sleep?: (ms: number) => Promise<void>;
  /** Consulted before each AI decision: a promise makes it wait (tutorial), null lets it play. */
  gate?: () => Promise<void> | null;
  record?: GameRecord;
  checkpointEvery?: number;
  onRecord?: (player: PlayerId, d: Decision, after: GameState) => void;
  /** One update per visible step (attack, Trainer card, coin flip, Knock Out) instead of one at the end. */
  frames?: boolean;
}

const FRAME_EVENTS = new Set<GameEvent["type"]>(["attack", "playTrainer", "ability", "knockOut", "evolve", "stadium", "prizes"]);

/** Fallback decision if an AI returns an illegal decision. */
export function fallbackDecision(s: GameState, p: PendingDecision): Decision {
  switch (p.kind) {
    case "main":
      return { type: "endTurn" };
    case "choice":
      return { type: "choose", values: p.request.suggested };
    case "setup": {
      const ps = s.players[p.player];
      const basics = (ps?.hand ?? []).filter((c) => {
        const d = s.defs[s.objects[c]?.defId ?? ""];
        return d?.category === "pokemon" && d.stage === "basic";
      });
      return { type: "setup", active: basics[0] as string, bench: [] };
    }
  }
}

export class GameHost {
  state: GameState;
  readonly settings: Record<PlayerId, AutopilotSettings> = {};
  private readonly opts: HostOptions;
  private pendingEvents: GameEvent[] = [];
  private running = false;
  private shownAt = 0;

  constructor(state: GameState, opts: HostOptions = {}, initialEvents: GameEvent[] = []) {
    this.state = state;
    this.opts = opts;
    this.pendingEvents = [...initialEvents];
    for (const p of state.playerOrder) this.settings[p] = structuredClone(DEFAULT_AUTOPILOT);
  }

  isHuman(p: PlayerId): boolean {
    return !this.opts.agents?.[p];
  }

  view(p: PlayerId): GameView {
    return projectView(this.state, p);
  }

  setSettings(p: PlayerId, settings: Partial<AutopilotSettings>): void {
    this.settings[p] = { ...(this.settings[p] ?? DEFAULT_AUTOPILOT), ...settings };
  }

  private apply(player: PlayerId, d: Decision): void {
    const { state, events } = submit(this.state, player, d);
    this.state = state;
    this.pendingEvents.push(...events);
    if (this.opts.frames && events.some((e) => FRAME_EVENTS.has(e.type))) this.flush(true);
    if (this.opts.record) recordDecision(this.opts.record, player, d, state, this.opts.checkpointEvery);
    this.opts.onRecord?.(player, d, state);
  }

  get record(): GameRecord | null {
    return this.opts.record ?? null;
  }

  /** Sends the view and the accumulated events to each human (`interim`: an intermediate step, no pending decision). */
  private flush(interim = false): void {
    const events = this.pendingEvents;
    this.pendingEvents = [];
    for (const p of this.state.playerOrder) {
      if (!this.isHuman(p)) continue;
      const view = this.view(p);
      this.opts.onUpdate?.(p, interim ? { ...view, pending: null, legal: [] } : view, filterEvents(events, p));
    }
  }

  /** Decision of a human. Returns an error message if it is illegal. */
  async submitHuman(player: PlayerId, d: Decision): Promise<string | null> {
    try {
      this.apply(player, d);
    } catch (e) {
      if (e instanceof RulesError) return e.message;
      throw e;
    }
    await this.run();
    return null;
  }

  private settle(): Promise<void> | null {
    const { aiDelay, sleep } = this.opts;
    if (!aiDelay || !sleep) return null;
    const rest = this.shownAt + aiDelay - Date.now();
    return rest > 0 ? sleep(rest) : null;
  }

  /** Chains the automatic decisions (AI, autopilot) until a human must choose. */
  async run(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      let turn = this.state.turn.number;
      for (let guard = 1; ; guard++) {
        const p = this.state.pending;
        if (this.state.turn.number !== turn) {
          turn = this.state.turn.number;
          guard = 1;
        }
        if (guard > MAX_AUTOMATIC_DECISIONS && !this.state.over) {
          console.warn(`GameHost: more than ${MAX_AUTOMATIC_DECISIONS} automatic decisions in turn ${turn}: draw`);
          const s = cloneState(this.state);
          const [, events] = collectEvents(() => endGame(s, null, "draw"));
          this.state = s;
          this.pendingEvents.push(...events);
          continue;
        }
        const agent = p && !this.state.over ? this.opts.agents?.[p.player] : undefined;
        const auto =
          p && !this.state.over && !agent
            ? autopilotDecision(this.state, p.player, this.settings[p.player] ?? DEFAULT_AUTOPILOT)
            : null;
        if (!p || this.state.over || (!agent && !auto)) {
          const pause = this.settle();
          if (!pause) break;
          await pause;
          continue;
        }
        if (agent) {
          const wait = this.opts.gate?.();
          if (wait) {
            await this.settle();
            this.flush();
            await wait;
            if (this.state.pending !== p) continue;
          }
          let d: Decision;
          try {
            const out = agent(this.state, p.player);
            if (out instanceof Promise) {
              d = await out;
              if (this.state.pending !== p) continue;
            } else d = out;
            this.apply(p.player, d);
          } catch (e) {
            if (!(e instanceof RulesError)) console.warn("AI error, fallback:", e);
            d = fallbackDecision(this.state, p);
            this.apply(p.player, d);
          }
          if (this.opts.aiDelay && this.opts.sleep && d.type !== "setup") {
            const pause = this.settle();
            if (pause) await pause;
            this.flush();
            this.shownAt = Date.now();
          }
          continue;
        }
        if (auto) this.apply(p.player, auto);
      }
    } finally {
      this.running = false;
    }
    this.flush();
  }
}
