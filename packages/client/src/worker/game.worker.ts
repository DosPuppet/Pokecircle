/** Game against the AI, entirely in the browser: the engine and the AI run here, off the interface thread. */
import { aiAgent } from "@pocketmate/ai";
import type { DeckEntries } from "@pocketmate/cards";
import {
  buildScenario,
  type CardDef,
  createGame,
  GameHost,
  type GameRecord,
  msg,
  newRecord,
  RULES_VERSION,
  replayChecked,
} from "@pocketmate/engine";
import type { FromWorker, ToWorker } from "../protocol";
import { lessonAgent } from "../tutorial/agent";

const HUMAN = "p1";
const AI = "p2";
let host: GameHost | null = null;
let sent = 0;

const post = (m: FromWorker) => (self as unknown as Worker).postMessage(m);
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function buildDeck(entries: DeckEntries, defs: Record<string, CardDef>): { deck: CardDef[]; prints: (string | null)[] } {
  const deck: CardDef[] = [];
  const prints: (string | null)[] = [];
  for (const [n, id, print] of entries) {
    const d = defs[id];
    if (!d) throw new Error(`unknown card ${id}`);
    for (let i = 0; i < n; i++) {
      deck.push(d);
      prints.push(print ?? null);
    }
  }
  return { deck, prints };
}

function postProgress(header?: GameRecord): void {
  const rec = host?.record;
  if (!rec || (!header && rec.decisions.length <= sent)) return;
  post({
    type: "saved",
    ...(header ? { header: { ...structuredClone(header), decisions: [], checkpoints: [] } } : {}),
    decisions: rec.decisions.slice(sent),
    checkpoints: structuredClone(rec.checkpoints),
  });
  sent = rec.decisions.length;
}

/** Thinking time of the expert AI per decision (ms): absorbed by the 0.9 s pause between AI actions. */
const AI_BUDGET = 700;

function makeHost(
  state: GameHost["state"],
  record: GameRecord,
  level: Parameters<typeof aiAgent>[0],
  seed: number,
  fast?: boolean,
  events = [],
) {
  return new GameHost(
    state,
    {
      // Expert level: thinking within the pause between two AI actions (0.15 s in fast mode).
      agents: { [AI]: aiAgent(level, { seed: seed + 1, budget: fast ? 150 : AI_BUDGET }) },
      aiDelay: fast && import.meta.env.DEV ? 0 : 900,
      sleep,
      frames: true,
      record,
      onUpdate: (_p, view, evts) => {
        post({ type: "update", view, events: evts });
        postProgress();
      },
    },
    events,
  );
}

self.onmessage = (e: MessageEvent<ToWorker>) => {
  handle(e.data).catch((err: unknown) => {
    console.error(err);
    post({ type: "error", message: msg("Engine error: {error}", { error: err instanceof Error ? err.message : String(err) }) });
  });
};

async function handle(m: ToWorker): Promise<void> {
  switch (m.type) {
    case "start": {
      const me = buildDeck(m.playerDeck, m.defs);
      const ai = buildDeck(m.aiDeck, m.defs);
      const opts = {
        seed: m.seed,
        players: [
          { id: HUMAN, name: m.playerName, deck: me.deck, prints: me.prints },
          { id: AI, name: m.aiName, deck: ai.deck, prints: ai.prints },
        ] as [import("@pocketmate/engine").PlayerSetup, import("@pocketmate/engine").PlayerSetup],
        ...(m.chooser ? { chooser: m.chooser } : {}),
      };
      const record = newRecord(opts);
      const { state, events } = createGame(opts);
      sent = 0;
      host = makeHost(state, record, m.aiLevel, m.seed, m.fast, events as never);
      postProgress(record);
      await host.run();
      return;
    }
    case "resume": {
      const r = replayChecked(m.record, m.defs);
      if (r.diverged) {
        post({
          type: "resumeFailed",
          message:
            m.record.rules === RULES_VERSION
              ? msg("the game no longer replays identically")
              : msg("the game no longer replays identically (the engine has been updated since)"),
        });
        return;
      }
      const record: GameRecord = { ...structuredClone(m.record) };
      sent = record.decisions.length;
      host = makeHost(r.state, record, m.aiLevel, m.record.seed, m.fast);
      await host.run();
      post({ type: "update", view: host.view(HUMAN), events: [] });
      return;
    }
    case "lesson": {
      const { s } = buildScenario(m.spec, m.defs);
      sent = 0;
      host = new GameHost(s, {
        agents: { [AI]: lessonAgent },
        aiDelay: m.fast && import.meta.env.DEV ? 0 : 900,
        sleep,
        frames: true,
        onUpdate: (_p, view, evts) => post({ type: "update", view, events: evts }),
      });
      post({ type: "update", view: host.view(HUMAN), events: [] });
      await host.run();
      return;
    }
    case "decision": {
      if (!host) return;
      const error = await host.submitHuman(HUMAN, m.decision);
      if (error) post({ type: "error", message: error });
      postProgress();
      return;
    }
    case "export":
      post({ type: "record", record: host?.record ?? null });
      return;
  }
}
