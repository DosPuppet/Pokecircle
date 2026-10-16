/**
 * AI tournament: two levels play each other on a deck pool (seats alternate), with the win rate and its 95% interval.
 *
 *   npm run arena -- --a medium --b random --games 200 --pool starter [--seed 1] [--jobs 8] [--iterations 48]
 *
 * `--jobs` splits the games among child processes (same games, same results as one process).
 */
import { spawn } from "node:child_process";
import { type AiLevel, aiAgent } from "../packages/ai/src/levels";
import { randomAgent } from "../packages/ai/src/random";
import { playGame } from "../packages/ai/src/selfplay";
import type { Agent } from "../packages/engine/src/host";
import { decksFor } from "./decks";

const argv = process.argv.slice(2);
const opt = (n: string, d: string) => {
  const i = argv.indexOf(`--${n}`);
  return i >= 0 ? (argv[i + 1] as string) : d;
};
const a = opt("a", "medium");
const b = opt("b", "random");
const games = Number(opt("games", "100"));
const pool = opt("pool", "starter");
const seed0 = Number(opt("seed", "1"));
const jobs = Number(opt("jobs", "1"));
const iterations = argv.includes("--iterations") ? Number(opt("iterations", "0")) : undefined;

const agent = (level: string, seed: number): Agent =>
  level === "random" ? randomAgent(seed) : aiAgent(level as AiLevel, { seed, iterations });

export function arena(levelA: string, levelB: string, n: number, poolName: string, seed = 1) {
  let winsA = 0;
  let draws = 0;
  let turns = 0;
  const t0 = performance.now();
  for (let i = 0; i < n; i++) {
    const s = seed + i;
    const decks = decksFor(poolName, s);
    const aFirst = i % 2 === 0;
    const agents: [Agent, Agent] = aFirst ? [agent(levelA, s), agent(levelB, s + 1)] : [agent(levelB, s + 1), agent(levelA, s)];
    const r = playGame({ seed: s, decks, agents, invariants: false });
    const aSeat = aFirst ? "p1" : "p2";
    if (r.state.winner === aSeat) winsA++;
    else if (!r.state.winner) draws++;
    turns += r.state.turn.number;
  }
  const p = winsA / n;
  const half = 1.96 * Math.sqrt((p * (1 - p)) / n);
  return { winsA, draws, rate: p, half, turns: turns / n, seconds: (performance.now() - t0) / 1000 };
}

type Result = ReturnType<typeof arena>;

/** The same games as `arena`, split among `n` child processes. */
async function arenaJobs(n: number): Promise<Result> {
  const t0 = performance.now();
  // Game i alternates seats with i: each job starts on an even game, for the same seats as one process.
  const per = 2 * Math.ceil(games / n / 2);
  const runs: Promise<Result & { games: number }>[] = [];
  for (let k = 0; k * per < games; k++) {
    const count = Math.min(per, games - k * per);
    const args = argv.filter(
      (_, i) =>
        !["--jobs", "--games", "--seed"].includes(argv[i - 1] ?? "") && !["--jobs", "--games", "--seed"].includes(argv[i] ?? ""),
    );
    const child = spawn(
      process.execPath,
      [
        ...process.execArgv,
        process.argv[1] as string,
        ...args,
        "--games",
        String(count),
        "--seed",
        String(seed0 + k * per),
        "--json",
      ],
      { stdio: ["ignore", "pipe", "inherit"] },
    );
    let out = "";
    child.stdout.on("data", (c) => {
      out += c;
    });
    runs.push(
      new Promise((resolve, reject) =>
        child.on("close", (code) =>
          code ? reject(new Error(`job ${k}: ${code}`)) : resolve({ ...JSON.parse(out), games: count }),
        ),
      ),
    );
  }
  const all = await Promise.all(runs);
  const winsA = all.reduce((x, r) => x + r.winsA, 0);
  const p = winsA / games;
  return {
    winsA,
    draws: all.reduce((x, r) => x + r.draws, 0),
    rate: p,
    half: 1.96 * Math.sqrt((p * (1 - p)) / games),
    turns: all.reduce((x, r) => x + r.turns * r.games, 0) / games,
    seconds: (performance.now() - t0) / 1000,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const r = jobs > 1 && games > 1 ? await arenaJobs(jobs) : arena(a, b, games, pool, seed0);
  if (argv.includes("--json")) {
    console.log(JSON.stringify(r));
    process.exit(0);
  }
  console.log(
    `${a} vs ${b} on ${pool}: ${r.winsA}/${games} wins (${(100 * r.rate).toFixed(1)}% ± ${(100 * r.half).toFixed(1)}), ${r.draws} draws, ${r.turns.toFixed(1)} turns, ${r.seconds.toFixed(1)} s`,
  );
}
