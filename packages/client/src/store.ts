/**
 * Interface state: screens and settings, the game in progress (view, playback of the host's frames, log), what the
 * player is selecting, and the decisions sent to the session.
 */
import type { AiLevel } from "@pocketmate/ai";
import type { DeckEntries } from "@pocketmate/cards";
import { PRECONS } from "@pocketmate/cards/decks";
import type { Decision, GameEvent, GameView, ObjectId, PokemonId } from "@pocketmate/engine";
import { msg, RULES_VERSION } from "@pocketmate/engine";
import type { Clock, RoomInfo, ServerMessage } from "@pocketmate/server/protocol";
import { PROTOCOL_VERSION } from "@pocketmate/server/protocol";
import { create } from "zustand";
import { soundsFor } from "./audio/eventSounds";
import { playSound } from "./audio/sfx";
import { defsOf } from "./cards";
import { fastMode } from "./fast";
import { describeEvent, rememberPokemon } from "./i18n";
import type { FromWorker } from "./protocol";
import { clearSaved, loadSaved, SaveWriter } from "./savedGame";
import { LocalSession, RemoteSession, type Session } from "./session";
import { type Lang, setTextLang } from "./translate";

export type Screen = "home" | "game" | "decks" | "online";

/** An online game to resume (token kept by the browser). */
export function savedOnline(): { token: string; code: string } | null {
  try {
    return JSON.parse(localStorage.getItem("pocketmate.online") ?? "null");
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

const STORE = "pocketmate.settings";

interface Settings {
  deck: string;
  aiDeck: string;
  aiLevel: AiLevel;
  /** Online nickname. */
  nickname: string;
}

/** Online: the room, the decision timer, the opponent's connection. */
export interface Online {
  room: RoomInfo | null;
  clock: (Clock & { receivedAt: number }) | null;
  opponent: { connected: boolean; remainingMs: number | null } | null;
  /** Waiting for the server's answer to create / join. */
  connecting: boolean;
}

const ONLINE_KEY = "pocketmate.online";

function loadSettings(): Settings {
  const fallback: Settings = {
    deck: PRECONS[0]?.id ?? "",
    aiDeck: PRECONS[1]?.id ?? PRECONS[0]?.id ?? "",
    aiLevel: "medium",
    nickname: "",
  };
  try {
    return { ...fallback, ...(JSON.parse(localStorage.getItem(STORE) ?? "{}") as Partial<Settings>) };
  } catch {
    return fallback;
  }
}

function storedLang(): Lang {
  try {
    return localStorage.getItem("pocketmate.lang") === "en" ? "en" : "fr";
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
  selected: Selection;
  /** Retreat: choosing the Benched Pokémon to switch in. */
  retreating: boolean;
  /** Setup placement in progress. */
  placing: { active: ObjectId | null; bench: ObjectId[] };
  error: string | null;
  notice: string | null;
  preview: { defId: string; print?: string } | null;
  zone: { player: string; zone: "discard" | "lostZone" } | null;
  logOpen: boolean;
  /** Updates still to show (playback of the host's frames). */
  queue: Update[];
  busy: boolean;
  hasSaved: boolean;
  /** "local": against the AI in the browser; "online": against a player through the server. */
  mode: "local" | "online";
  online: Online;
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
  toggleLog(): void;
}

let session: Session | null = null;
let saver: SaveWriter | null = null;
let logId = 0;

function deckOf(id: string): DeckEntries {
  return PRECONS.find((p) => p.id === id)?.main ?? PRECONS[0]?.main ?? [];
}

/** Pause after an update, so the player can follow (coin flips, attacks, Knock Outs). */
function pauseFor(events: GameEvent[], fast: boolean): number {
  if (fast) return 0;
  let ms = 0;
  for (const e of events) {
    if (e.type === "coinFlip") ms = Math.max(ms, 1300);
    else if (e.type === "knockOut") ms = Math.max(ms, 900);
    else if (e.type === "attack") ms = Math.max(ms, 700);
    else if (e.type === "damage" || e.type === "counters") ms = Math.max(ms, 500);
  }
  return ms;
}

export const useGame = create<Store>((set, get) => {
  const settings = loadSettings();
  const lang = storedLang();
  setTextLang(lang);

  const pump = async () => {
    if (get().busy) return;
    set({ busy: true });
    try {
      for (;;) {
        const u = get().queue[0];
        if (!u) break;
        set({ queue: get().queue.slice(1) });
        rememberPokemon(u.view);
        const lines: LogLine[] = [];
        for (const e of u.events) {
          const text = describeEvent(e, u.view);
          if (text) lines.push({ id: ++logId, text, turn: u.view.turn.number });
        }
        const flips = u.events.filter((e) => e.type === "coinFlip").map((e) => (e.type === "coinFlip" ? e.heads : false));
        set({
          view: u.view,
          log: lines.length ? [...get().log, ...lines].slice(-300) : get().log,
          ...(flips.length ? { flips: { results: flips, key: logId } } : {}),
        });
        for (const k of soundsFor(u.events, u.view.me)) playSound(k);
        if (u.view.over) clearSaved();
        const ms = pauseFor(u.events, fastMode());
        if (ms) await new Promise((r) => setTimeout(r, ms));
        if (flips.length) set({ flips: null });
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
        return;
    }
  };

  const resetGame = () =>
    set({ view: null, log: [], queue: [], selected: null, retreating: false, placing: { active: null, bench: [] }, error: null });

  const newSession = () => {
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
    selected: null,
    retreating: false,
    placing: { active: null, bench: [] },
    error: null,
    notice: null,
    preview: null,
    zone: null,
    logOpen: false,
    queue: [],
    busy: false,
    hasSaved: !!loadSaved(),
    mode: "local",
    online: { room: null, clock: null, opponent: null, connecting: false },
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
        localStorage.setItem("pocketmate.lang", l);
      } catch {}
      set({ lang: l });
    },
    go(screen) {
      set({ screen });
    },
    setSettings(p) {
      set(p);
      const { deck, aiDeck, aiLevel, nickname } = get();
      try {
        localStorage.setItem(STORE, JSON.stringify({ deck, aiDeck, aiLevel, nickname }));
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
      });
      set({ screen: "game" });
    },
    quitGame() {
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
    toggleLog() {
      set({ logOpen: !get().logOpen });
    },
  };
});

if (typeof window !== "undefined") window.addEventListener("pagehide", () => saver?.flush());
