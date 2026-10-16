/**
 * Fuzz: AI-vs-AI games with invariants checked at every decision.
 *
 *   npm run fuzz -- --games 300 --pool all [--seed 1] [--ai random|chaos|mixed|levels] [--offers N] [--jobs N]
 *
 * Pools: `all` (implemented Standard cards), a set id, `starter`, `meta`. Same results for the same seed, whatever
 * `--jobs`. Prints `results: …` and exits 1 on any error.
 */
import { fork } from "node:child_process";
import { availableParallelism } from "node:os";
import { chaosAgent } from "../packages/ai/src/chaos";
import { randomAgent } from "../packages/ai/src/random";
import { playGame } from "../packages/ai/src/selfplay";
import type { Agent } from "../packages/engine/src/host";
import { decksFor } from "./decks";
import { aiAgentFor } from "./fuzzAgents";

const argv = process.argv.slice(2);
const opt = (n: string, d?: string) => {
  const i = argv.indexOf(`--${n}`);
  return i >= 0 ? (argv[i + 1] as string) : d;
};
const games = Number(opt("games", "50"));
const pool = opt("pool", "all") as string;
const seed0 = Number(opt("seed", "1"));
const ai = opt("ai", "random") as string;
const offers = Number(opt("offers", "0"));
const jobs = Math.max(1, Math.min(games, Number(opt("jobs", String(Math.max(1, availableParallelism() - 2))))));

interface GameOutcome {
  seed: number;
  ok: boolean;
  decisions: number;
  turns: number;
  refused: number;
  winner: string | null;
  reason?: string;
  errors: string[];
}

function one(seed: number): GameOutcome {
  const decks = decksFor(pool, seed);
  if (!decks[0].length || !decks[1].length)
    return { seed, ok: true, decisions: 0, turns: 0, refused: 0, winner: null, errors: [] };
  let agents: [Agent, Agent];
  let junk: [(() => unknown) | null, (() => unknown) | null] | undefined;
  if (ai === "chaos") {
    const a = chaosAgent(seed);
    const b = chaosAgent(seed + 1);
    agents = [a.agent, b.agent];
    junk = [a.junk, b.junk];
  } else if (ai === "mixed" || ai === "levels") {
    agents = [aiAgentFor(ai, seed, 0), aiAgentFor(ai, seed, 1)];
  } else agents = [randomAgent(seed), randomAgent(seed + 1)];
  const r = playGame({ seed, decks, agents, ...(junk ? { junk } : {}), ...(offers ? { offers } : {}) });
  return {
    seed,
    ok: r.errors.length === 0,
    decisions: r.decisions,
    turns: r.state.turn.number,
    refused: r.refused,
    winner: r.state.winner,
    ...(r.state.endReason ? { reason: r.state.endReason } : {}),
    errors: r.errors.slice(0, 3),
  };
}

const seeds = Array.from({ length: games }, (_, i) => seed0 + i);

if (argv.includes("--worker")) {
  const from = Number(opt("from"));
  const to = Number(opt("to"));
  for (let s = from; s < to; s++) process.send?.(one(s));
  process.exit(0);
}

async function main() {
  const t0 = performance.now();
  const outcomes: GameOutcome[] = [];
  if (jobs === 1) for (const s of seeds) outcomes.push(one(s));
  else {
    const per = Math.ceil(games / jobs);
    await Promise.all(
      Array.from({ length: jobs }, (_, j) => {
        const from = seed0 + j * per;
        const to = Math.min(seed0 + games, from + per);
        if (from >= to) return Promise.resolve();
        return new Promise<void>((resolve, reject) => {
          const child = fork(
            new URL(import.meta.url).pathname,
            [...argv.filter((a) => a !== "--jobs"), "--worker", "--from", String(from), "--to", String(to)],
            {
              execArgv: process.execArgv,
            },
          );
          child.on("message", (m) => outcomes.push(m as GameOutcome));
          child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`worker exited with ${code}`))));
        });
      }),
    );
  }
  outcomes.sort((a, b) => a.seed - b.seed);
  const bad = outcomes.filter((o) => !o.ok);
  for (const o of bad.slice(0, 10)) console.log(`seed ${o.seed}: ${o.errors.join("\n   ")}`);
  const played = outcomes.filter((o) => o.decisions > 0);
  const avgTurns = played.reduce((n, o) => n + o.turns, 0) / Math.max(1, played.length);
  const reasons: Record<string, number> = {};
  for (const o of played) reasons[o.reason ?? "?"] = (reasons[o.reason ?? "?"] ?? 0) + 1;
  const refused = outcomes.reduce((n, o) => n + o.refused, 0);
  console.log(
    `results: ${played.length - bad.length}/${played.length} games ok, ${avgTurns.toFixed(1)} turns on average, ends ${JSON.stringify(reasons)}${refused ? `, ${refused} junk refused` : ""} (${((performance.now() - t0) / 1000).toFixed(1)} s)`,
  );
  process.exitCode = bad.length ? 1 : 0;
}

void main();
