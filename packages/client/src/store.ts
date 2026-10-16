/**
 * Interface state: screens and settings, the game in progress (view, playback of the host's frames, log), what the
 * player is selecting, and the decisions sent to the session.
 */
import type { AiLevel } from "@pokecircle/ai";
import type { DeckEntries } from "@pokecircle/cards";
import { PRECONS } from "@pokecircle/cards/decks";
import type { Decision, GameEvent, GameRecord, GameView, ObjectId, PlayerId, PokemonId } from "@pokecircle/engine";
import { msg, RULES_VERSION } from "@pokecircle/engine";
import type { Clock, RoomInfo, ServerMessage } from "@pokecircle/server/protocol";
import { PROTOCOL_VERSION } from "@pokecircle/server/protocol";
import { create } from "zustand";
import { soundsFor } from "./audio/eventSounds";
import { playSound } from "./audio/sfx";
import { type BoardChoice, isBoardChoice, PACES, type Pace, paceFactor } from "./boardThemes";
import { defsOf } from "./cards";
import { deckById } from "./decks/store";
import { fastMode } from "./fast";
import { decisionOnTarget, directOption, myTurn } from "./game/interaction";
import { describeEvent, rememberPokemon } from "./i18n";
import type { FromWorker } from "./protocol";
import { parseRecord, Replay } from "./replay";
import { clearSaved, loadSaved, SaveWriter } from "./savedGame";
import { LocalSession, RemoteSession, type Session } from "./session";
import { type Lang, setTextLang } from "./translate";
import { LESSONS } from "./tutorial/lessons";
import { alwaysAllowed, lessonDefs, matches, solve } from "./tutorial/runtime";

export type Screen = "home" | "game" | "decks" | "online" | "tutorial";

/** An online game to resume (token kept by the browser). */
export function savedOnline(): { token: string; code: string } | null {
  try {
    return JSON.parse(localStorage.getItem("pokecircle.online") ?? "null");
  } catch {
    return null;
  }
}

export interface LogLine {
  id: number;
  text: string;
  turn: number;
}

export type Selection = { kind: "card"; id: ObjectId } | { kind: "pokemon"; id: PokemonId } | null;

interface Update {
  view: GameView;
  events: GameEvent[];
}

const STORE = "pokecircle.settings";

interface Settings {
  deck: string;
  aiDeck: string;
  aiLevel: AiLevel;
  /** Online nickname. */
  nickname: string;
  /** Card images through the Pokecircle server (`/tcgdex/` relay) rather than from TCGdex directly. */
  relay: boolean;
  /** Playmat (`boardThemes.ts`). */
  board: BoardChoice;
  /** Pace of the game's effects. */
  pace: Pace;
}

/** Online: the room, the decision timer, the opponent's connection. */
export interface Online {
  room: RoomInfo | null;
  clock: (Clock & { receivedAt: number }) | null;
  opponent: { connected: boolean; remainingMs: number | null } | null;
  /** Waiting for the server's answer to create / join. */
  connecting: boolean;
}

const ONLINE_KEY = "pokecircle.online";

function loadSettings(): Settings {
  const fallback: Settings = {
    deck: PRECONS[0]?.id ?? "",
    aiDeck: PRECONS[1]?.id ?? PRECONS[0]?.id ?? "",
    aiLevel: "medium",
    nickname: "",
    relay: false,
    board: "stadium",
    pace: "normal",
  };
  try {
    const s = { ...fallback, ...(JSON.parse(localStorage.getItem(STORE) ?? "{}") as Partial<Settings>) };
    if (!isBoardChoice(s.board)) s.board = fallback.board;
    if (!PACES.some((p) => p.id === s.pace)) s.pace = fallback.pace;
    return s;
  } catch {
    return fallback;
  }
}

function storedLang(): Lang {
  try {
    return localStorage.getItem("pokecircle.lang") === "en" ? "en" : "fr";
  } catch {
    return "fr";
  }
}

export interface Store extends Settings {
  screen: Screen;
  lang: Lang;
  view: GameView | null;
  log: LogLine[];
  /** Coin flips being shown (results), with a key per batch. */
  flips: { results: boolean[]; key: number } | null;
  /** Cards the opponent reveals (their hand, a searched card), shown for a moment. */
  revealed: { player: PlayerId; defIds: string[]; key: number } | null;
  selected: Selection;
  /** Retreat: choosing the Benched Pokémon to switch in. */
  retreating: boolean;
  /** Setup placement in progress. */
  placing: { active: ObjectId | null; bench: ObjectId[] };
  error: string | null;
  notice: string | null;
  preview: { defId: string; print?: string } | null;
  zone: { player: string; zone: "discard" | "lostZone" } | null;
  /** The side drawer (options and log). */
  drawerOpen: boolean;
  /** The hand card being dragged (its targets glow). */
  dragging: ObjectId | null;
  /** The "your turn" banner: whose turn starts (a new key for each turn). */
  banner: { player: string; key: number } | null;
  /** Drawn at the start of each game: the playmat of a "random" choice. */
  boardRoll: number;
  /** Updates still to show (playback of the host's frames). */
  queue: Update[];
  busy: boolean;
  hasSaved: boolean;
  /** "local": against the AI in the browser; "online": against a player through the server. */
  mode: "local" | "online";
  online: Online;
  /** A deck list received by a link (#deck=…), offered for import in the deck builder. */
  sharedDeck: string | null;
  /** Replay being watched: position, point of view, automatic playback. */
  replay: {
    index: number;
    total: number;
    viewer: string;
    players: { id: string; name: string }[];
    playing: boolean;
    /** Replay stopped before the end, or recorded with another rules version (engine text). */
    warning: string | null;
  } | null;
  /** Tutorial lesson in progress: its id and the current step (`step` = number of steps: finished). */
  tutorial: { lesson: string; step: number } | null;
  /** Lessons finished (remembered in this browser). */
  tutorialDone: string[];
  startLesson(id: string): void;
  /** The current explanation is read: next step. */
  tutorialNext(): void;
  /** Interface tests: does what the current step asks (or answers a question); "wait" when nothing can be done now. */
  tutorialSolve(): "acted" | "wait";
  /** The finished game's record: watched at once, or downloaded as a file. */
  exportGame(then: "watch" | "download"): void;
  openReplay(record: GameRecord): void;
  /** A record file chosen by the player (its text). */
  openReplayFile(text: string): void;
  replaySeek(index: number): void;
  replayViewer(player: string): void;
  replayPlay(on: boolean): void;
  clearSharedDeck(): void;
  setLang(l: Lang): void;
  createRoom(o: { bestOf: 1 | 3; ai?: AiLevel }): void;
  joinRoom(code: string): void;
  rejoinRoom(): void;
  leaveRoom(): void;
  rematch(): void;
  nextGame(): void;
  go(s: Screen): void;
  setSettings(p: Partial<Settings>): void;
  startGame(): void;
  resumeGame(): void;
  quitGame(): void;
  decide(d: Decision): void;
  select(sel: Selection): void;
  setRetreating(on: boolean): void;
  setPlacing(p: { active: ObjectId | null; bench: ObjectId[] }): void;
  notify(text: string): void;
  showPreview(p: Store["preview"]): void;
  showZone(z: Store["zone"]): void;
  toggleDrawer(open?: boolean): void;
  setDragging(card: ObjectId | null): void;
  /**
   * A hand card dropped on the table: on a Pokémon (evolve, attach, a Trainer on it), on the Active Spot or the Bench
   * (setup), or anywhere on the table (play a Basic, an Item, a Supporter, a Stadium). Otherwise, the card is selected
   * as by a click. Returns whether a decision was made.
   */
  dropHandCard(card: ObjectId, at: { pokemon?: PokemonId; zone?: "active" | "bench" | "table" }): boolean;
}

let session: Session | null = null;
const TUTORIAL_KEY = "pokecircle.tutorial";

function loadTutorialDone(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(TUTORIAL_KEY) ?? "[]") as unknown;
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}
let replaying: Replay | null = null;
let replayTimer: ReturnType<typeof setInterval> | null = null;
/** What to do with the next record received (`exportGame`). */
let exportThen: "watch" | "download" | null = null;

function download(record: GameRecord): void {
  const blob = new Blob([JSON.stringify(record)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `pokecircle-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-")}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
let saver: SaveWriter | null = null;
let logId = 0;

function deckOf(id: string): DeckEntries {
  return deckById(id)?.main ?? PRECONS[0]?.main ?? [];
}

/** Pause after an update, so the player can follow (coin flips, attacks, Knock Outs). */
function pauseFor(events: GameEvent[], fast: boolean, factor: number): number {
  if (fast || !factor) return 0;
  let ms = 0;
  for (const e of events) {
    if (e.type === "coinFlip") ms = Math.max(ms, 1300);
    else if (e.type === "knockOut") ms = Math.max(ms, 900);
    else if (e.type === "attack") ms = Math.max(ms, 700);
    else if (e.type === "damage" || e.type === "counters") ms = Math.max(ms, 500);
  }
  return Math.round(ms * factor);
}

export const useGame = create<Store>((set, get) => {
  const settings = loadSettings();
  const lang = storedLang();
  setTextLang(lang);

  /** Leaves the finished steps of the lesson (`until` met); an explanation waits for its button. */
  const advanceTutorial = (view: GameView, events: GameEvent[]) => {
    const tuto = get().tutorial;
    const lesson = tuto && LESSONS.find((l) => l.id === tuto.lesson);
    if (!tuto || !lesson) return;
    let step = tuto.step;
    for (let st = lesson.steps[step]; st && !st.next && st.until?.({ view, events }); st = lesson.steps[step]) step++;
    if (step !== tuto.step) finishStep(lesson.id, step);
  };

  const finishStep = (lesson: string, step: number) => {
    const total = LESSONS.find((l) => l.id === lesson)?.steps.length ?? 0;
    const done = get().tutorialDone;
    if (step >= total && !done.includes(lesson)) {
      const next = [...done, lesson];
      try {
        localStorage.setItem(TUTORIAL_KEY, JSON.stringify(next));
      } catch {}
      set({ tutorialDone: next });
    }
    set({ tutorial: { lesson, step }, error: null });
  };

  const pump = async () => {
    if (get().busy) return;
    set({ busy: true });
    try {
      for (;;) {
        const u = get().queue[0];
        if (!u) break;
        set({ queue: get().queue.slice(1) });
        rememberPokemon(u.view);
        const turn = u.events.findLast((e) => e.type === "turnStart");
        if (turn?.type === "turnStart") set({ banner: { player: turn.player, key: ++logId } });
        const lines: LogLine[] = [];
        for (const e of u.events) {
          const text = describeEvent(e, u.view);
          if (text) lines.push({ id: ++logId, text, turn: u.view.turn.number });
        }
        const flips = u.events.filter((e) => e.type === "coinFlip").map((e) => (e.type === "coinFlip" ? e.heads : false));
        const shown = u.events.findLast((e) => e.type === "reveal" && e.player !== u.view.me);
        const revealed = shown?.type === "reveal" ? { player: shown.player, defIds: shown.defIds, key: logId } : null;
        set({
          view: u.view,
          log: lines.length ? [...get().log, ...lines].slice(-300) : get().log,
          ...(flips.length ? { flips: { results: flips, key: logId } } : {}),
          ...(revealed ? { revealed } : {}),
        });
        for (const k of soundsFor(u.events, u.view.me)) playSound(k);
        advanceTutorial(u.view, u.events);
        if (u.view.over) clearSaved();
        const factor = paceFactor(get().pace);
        const ms = Math.max(pauseFor(u.events, fastMode(), factor), revealed && !fastMode() ? Math.round(1600 * factor) : 0);
        if (ms) await new Promise((r) => setTimeout(r, ms));
        if (flips.length) set({ flips: null });
        if (revealed) set({ revealed: null });
      }
    } finally {
      set({ busy: false });
    }
  };

  const onMessage = (m: FromWorker) => {
    switch (m.type) {
      case "update":
        set({ queue: [...get().queue, { view: m.view, events: m.events }], selected: null, retreating: false });
        void pump();
        return;
      case "error":
        set({ error: m.message });
        playSound("error");
        return;
      case "saved":
        if (m.header) saver?.header(m.header);
        saver?.progress(m.decisions, m.checkpoints);
        return;
      case "resumeFailed":
        clearSaved();
        set({ screen: "home", notice: msg("The saved game could not be resumed: {why}.", { why: m.message }), hasSaved: false });
        return;
      case "record":
        onRecord(m.record);
        return;
    }
  };

  const onRecord = (record: GameRecord | null) => {
    const then = exportThen;
    exportThen = null;
    if (!record || !then) return;
    if (then === "download") download(record);
    else get().openReplay(record);
  };

  /** The log of a replay up to step `i`, from `viewer`'s point of view. */
  const replayLog = (r: Replay, i: number, viewer: string): LogLine[] => {
    const lines: LogLine[] = [];
    for (let k = 0; k <= i; k++) {
      const f = r.frame(k, viewer);
      rememberPokemon(f.view);
      for (const e of f.events) {
        const text = describeEvent(e, f.view);
        if (text) lines.push({ id: ++logId, text, turn: f.view.turn.number });
      }
    }
    return lines.slice(-300);
  };

  const stopReplay = () => {
    if (replayTimer) clearInterval(replayTimer);
    replayTimer = null;
    replaying = null;
  };

  const resetGame = () =>
    set({
      view: null,
      log: [],
      queue: [],
      selected: null,
      retreating: false,
      placing: { active: null, bench: [] },
      error: null,
      banner: null,
      drawerOpen: false,
      boardRoll: Math.random(),
    });

  const newSession = () => {
    stopReplay();
    set({ replay: null, tutorial: null });
    session?.close();
    session = new LocalSession(onMessage);
    resetGame();
    set({ mode: "local" });
  };

  const onServer = (m: ServerMessage) => {
    switch (m.type) {
      case "room": {
        try {
          localStorage.setItem(ONLINE_KEY, JSON.stringify({ token: m.room.token, code: m.room.code }));
        } catch {}
        const playing = m.room.status !== "waiting";
        set({ online: { ...get().online, room: m.room, connecting: false }, ...(playing ? { screen: "game" } : {}) });
        return;
      }
      case "update":
        set({
          queue: [...get().queue, { view: m.view, events: m.events }],
          selected: null,
          retreating: false,
          online: { ...get().online, clock: m.clock ? { ...m.clock, receivedAt: Date.now() } : null },
        });
        void pump();
        return;
      case "opponent":
        set({ online: { ...get().online, opponent: { connected: m.connected, remainingMs: m.remainingMs } } });
        return;
      case "error":
        if (m.code === "token" || m.code === "closed" || m.code === "version") {
          try {
            localStorage.removeItem(ONLINE_KEY);
          } catch {}
          if (m.code === "version") location.reload();
          session?.close();
          session = null;
          set({ screen: "online", online: { room: null, clock: null, opponent: null, connecting: false }, notice: m.message });
          return;
        }
        set({ error: m.message, online: { ...get().online, connecting: false } });
        playSound("error");
        return;
      case "record":
        onRecord(m.record);
        return;
    }
  };

  const remote = (): RemoteSession => {
    session?.close();
    const r = new RemoteSession(onServer, () => {
      // Connection lost: try again with the token (the server keeps the seat for a while).
      set({ notice: msg("Connection to the server lost: reconnecting…") });
      setTimeout(() => get().rejoinRoom(), 2000);
    });
    session = r;
    resetGame();
    set({ mode: "online", online: { room: null, clock: null, opponent: null, connecting: true } });
    return r;
  };
  const version = { protocol: PROTOCOL_VERSION, rules: RULES_VERSION };

  return {
    ...settings,
    screen: "home",
    lang,
    view: null,
    log: [],
    flips: null,
    revealed: null,
    selected: null,
    retreating: false,
    placing: { active: null, bench: [] },
    error: null,
    notice: null,
    preview: null,
    zone: null,
    drawerOpen: false,
    dragging: null,
    banner: null,
    boardRoll: Math.random(),
    queue: [],
    busy: false,
    hasSaved: !!loadSaved(),
    mode: "local",
    online: { room: null, clock: null, opponent: null, connecting: false },
    sharedDeck: null,
    tutorial: null,
    tutorialDone: loadTutorialDone(),
    startLesson(id) {
      const lesson = LESSONS.find((l) => l.id === id);
      if (!lesson) return;
      newSession();
      saver = null;
      const l = get().lang;
      session?.send({
        type: "lesson",
        spec: {
          ...lesson.scenario,
          names: [l === "fr" ? "Vous" : "You", l === "fr" ? "Adversaire" : "Opponent"], // i18n-ignore: player names
        },
        defs: lessonDefs(lesson.scenario),
        fast: fastMode(),
        pace: paceFactor(get().pace),
      });
      set({ screen: "game", tutorial: { lesson: id, step: 0 } });
    },
    tutorialNext() {
      const tuto = get().tutorial;
      if (!tuto) return;
      const lesson = LESSONS.find((x) => x.id === tuto.lesson);
      if (!lesson?.steps[tuto.step]?.next) return;
      finishStep(lesson.id, tuto.step + 1);
      const v = get().view;
      if (v) advanceTutorial(v, []);
    },
    tutorialSolve() {
      const { view: v, tutorial: tuto, queue } = get();
      if (!v || !tuto || queue.length || v.pending?.player !== v.me) return "wait";
      if (v.pending.kind === "choice" && v.pending.request) {
        get().decide({ type: "choose", values: v.pending.request.suggested });
        return "acted";
      }
      const allow = LESSONS.find((l) => l.id === tuto.lesson)?.steps[tuto.step]?.allow?.[0];
      const d = allow ? solve(allow, v) : null;
      if (!d) return "wait";
      get().decide(d);
      return "acted";
    },
    replay: null,
    exportGame(then) {
      exportThen = then;
      if (session instanceof RemoteSession) session.raw({ type: "export" });
      else session?.send({ type: "export" });
    },
    openReplay(record) {
      stopReplay();
      let r: Replay;
      try {
        r = new Replay(record);
      } catch (e) {
        set({ notice: msg("Replay impossible: {error}", { error: e instanceof Error ? e.message : String(e) }) });
        return;
      }
      if (get().mode === "online") get().leaveRoom();
      session?.close();
      session = null;
      replaying = r;
      // Point of view: the player of this browser if they took part (seat p1 against the AI), else the first one.
      const viewer = get().view?.me ?? r.players[0]?.id ?? "p1";
      const f = r.frame(0, viewer);
      set({
        screen: "game",
        mode: "local",
        view: f.view,
        queue: [],
        log: replayLog(r, 0, viewer),
        selected: null,
        retreating: false,
        error: null,
        replay: { index: 0, total: r.total, viewer, players: r.players, playing: false, warning: r.warning },
      });
    },
    openReplayFile(text) {
      const record = parseRecord(text);
      if (!record) {
        set({ notice: msg("This file is not a Pokecircle game.") });
        return;
      }
      get().openReplay(record);
    },
    replaySeek(index) {
      const replay = get().replay;
      const r = replaying;
      if (!replay || !r) return;
      const i = Math.max(0, Math.min(replay.total, index));
      const f = r.frame(i, replay.viewer);
      if (i === replay.index + 1) {
        rememberPokemon(f.view);
        const lines: LogLine[] = [];
        for (const e of f.events) {
          const text = describeEvent(e, f.view);
          if (text) lines.push({ id: ++logId, text, turn: f.view.turn.number });
        }
        set({ view: f.view, log: [...get().log, ...lines].slice(-300), replay: { ...replay, index: i } });
        for (const k of soundsFor(f.events, replay.viewer)) playSound(k);
      } else set({ view: f.view, log: replayLog(r, i, replay.viewer), replay: { ...replay, index: i } });
      if (i >= replay.total) get().replayPlay(false);
    },
    replayViewer(player) {
      const replay = get().replay;
      const r = replaying;
      if (!replay || !r) return;
      set({
        view: r.frame(replay.index, player).view,
        log: replayLog(r, replay.index, player),
        replay: { ...replay, viewer: player },
      });
    },
    replayPlay(on) {
      const replay = get().replay;
      if (!replay) return;
      if (replayTimer) clearInterval(replayTimer);
      replayTimer = null;
      if (on && replay.index < replay.total)
        replayTimer = setInterval(() => {
          const cur = get().replay;
          if (cur) get().replaySeek(cur.index + 1);
        }, 800);
      set({ replay: { ...(get().replay ?? replay), playing: on && replay.index < replay.total } });
    },
    clearSharedDeck() {
      set({ sharedDeck: null });
    },
    createRoom(o) {
      const { deck, nickname } = get();
      remote().raw({
        type: "create",
        name: nickname,
        deck: deckOf(deck),
        bestOf: o.bestOf,
        ...(o.ai ? { ai: { level: o.ai } } : {}),
        version,
      });
    },
    joinRoom(code) {
      const { deck, nickname } = get();
      remote().raw({ type: "join", code, name: nickname, deck: deckOf(deck), version });
    },
    rejoinRoom() {
      const token = savedOnline()?.token;
      if (!token) return;
      remote().raw({ type: "rejoin", token, version });
      set({ screen: "game" });
    },
    leaveRoom() {
      if (session instanceof RemoteSession) session.raw({ type: "leave" });
      session?.close();
      session = null;
      try {
        localStorage.removeItem(ONLINE_KEY);
      } catch {}
      set({
        screen: "online",
        view: null,
        queue: [],
        online: { room: null, clock: null, opponent: null, connecting: false },
        mode: "local",
      });
    },
    rematch() {
      if (session instanceof RemoteSession) session.raw({ type: "rematch" });
    },
    nextGame() {
      resetGame();
      if (session instanceof RemoteSession) session.raw({ type: "next" });
    },
    setLang(l) {
      setTextLang(l);
      try {
        localStorage.setItem("pokecircle.lang", l);
      } catch {}
      set({ lang: l });
    },
    go(screen) {
      set({ screen });
    },
    setSettings(p) {
      set(p);
      const { deck, aiDeck, aiLevel, nickname, relay, board, pace } = get();
      if ("pace" in p) session?.send({ type: "pace", pace: paceFactor(pace) });
      try {
        localStorage.setItem(STORE, JSON.stringify({ deck, aiDeck, aiLevel, nickname, relay, board, pace }));
      } catch {}
    },
    startGame() {
      newSession();
      const { deck, aiDeck, aiLevel, lang: l } = get();
      const mine = deckOf(deck);
      const theirs = deckOf(aiDeck);
      saver = new SaveWriter(aiLevel);
      session?.send({
        type: "start",
        seed: Math.floor(Math.random() * 2 ** 31),
        playerName: l === "fr" ? "Vous" : "You", // i18n-ignore: the player's own name
        aiName: l === "fr" ? "IA" : "AI", // i18n-ignore: the AI's name
        playerDeck: mine,
        aiDeck: theirs,
        defs: defsOf(mine, theirs),
        aiLevel,
        fast: fastMode(),
        pace: paceFactor(get().pace),
      });
      set({ screen: "game", hasSaved: false });
    },
    resumeGame() {
      const saved = loadSaved();
      if (!saved) return;
      newSession();
      saver = new SaveWriter(saved.aiLevel);
      saver.resume(saved);
      const decks = saved.record.players.map((p) => p.deck.map(([id]) => [1, id] as [number, string]));
      session?.send({
        type: "resume",
        record: saved.record,
        defs: defsOf(...decks),
        aiLevel: saved.aiLevel as AiLevel,
        fast: fastMode(),
        pace: paceFactor(get().pace),
      });
      set({ screen: "game" });
    },
    quitGame() {
      if (get().tutorial) {
        session?.close();
        session = null;
        set({ screen: "tutorial", view: null, queue: [], tutorial: null, log: [] });
        return;
      }
      if (get().replay) {
        stopReplay();
        set({ screen: "home", view: null, queue: [], replay: null, log: [] });
        return;
      }
      if (get().mode === "online") {
        get().leaveRoom();
        set({ screen: "home" });
        return;
      }
      saver?.flush();
      session?.close();
      session = null;
      set({ screen: "home", view: null, queue: [], hasSaved: !!loadSaved() });
    },
    decide(d) {
      const v = get().view;
      if (!v || get().queue.length || !v.pending || v.pending.player !== v.me) return;
      // Tutorial: only what the current step asks (questions of the engine and conceding are always accepted).
      const tuto = get().tutorial;
      const step = tuto ? LESSONS.find((l) => l.id === tuto.lesson)?.steps[tuto.step] : undefined;
      if (tuto && step && !alwaysAllowed(d) && !(step.allow ?? []).some((a) => matches(a, d, v))) {
        set({ error: step.hint ?? msg("Follow the guide: read the explanation, then press Next.") });
        playSound("error");
        return;
      }
      set({ selected: null, retreating: false, error: null });
      session?.send({ type: "decision", decision: d });
    },
    select(sel) {
      set({ selected: sel, retreating: false });
    },
    setRetreating(on) {
      set({ retreating: on });
    },
    setPlacing(p) {
      set({ placing: p });
    },
    notify(text) {
      set({ notice: text });
    },
    showPreview(p) {
      set({ preview: p });
    },
    showZone(z) {
      set({ zone: z });
    },
    toggleDrawer(open) {
      set({ drawerOpen: open ?? !get().drawerOpen });
    },
    setDragging(card) {
      set({ dragging: card });
    },
    dropHandCard(card, at) {
      const v = get().view;
      if (!v || get().queue.length) return false;
      // Setup: the Basic Pokémon of the hand go to the Active Spot or the Bench.
      if (v.pending?.kind === "setup" && v.pending.player === v.me) {
        const { placing } = get();
        const bench = placing.bench.filter((c) => c !== card);
        if (at.zone === "active" || (!placing.active && at.zone)) {
          const old = placing.active && placing.active !== card ? [placing.active] : [];
          set({ placing: { active: card, bench: [...bench, ...old].slice(0, 5) } });
          return true;
        }
        if (at.zone === "bench" && bench.length < 5) {
          set({ placing: { active: placing.active === card ? null : placing.active, bench: [...bench, card] } });
          return true;
        }
        return false;
      }
      if (!myTurn(v)) return false;
      const d = at.pokemon ? decisionOnTarget(v, { kind: "card", id: card }, false, at.pokemon) : null;
      const direct = d ?? (at.zone ? directOption(v, card) : null);
      if (direct) {
        get().decide(direct);
        return true;
      }
      get().select({ kind: "card", id: card });
      return false;
    },
  };
});

if (typeof window !== "undefined") window.addEventListener("pagehide", () => saver?.flush());
