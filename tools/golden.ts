/**
 * Golden games: recorded AI-vs-AI games that must replay identically at the same RULES_VERSION.
 *
 *   npx tsx tools/golden.ts --check     replays them (exit 1 on a divergence)
 *   npx tsx tools/golden.ts --update    regenerates the ones that diverge (or all, with --all)
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { randomAgent } from "../packages/ai/src/random";
import { playGame } from "../packages/ai/src/selfplay";
import { CARDS } from "../packages/cards/src/index";
import {
  type GameRecord,
  newRecord,
  outcomeHash,
  RULES_VERSION,
  recordDecision,
  replayChecked,
  submit,
} from "../packages/engine/src/index";
import { decksFor } from "./decks";

const DIR = new URL("../packages/ai/test/golden/", import.meta.url);
const GAMES: { name: string; pool: string; seed: number }[] = [
  { name: "starter-1", pool: "starter", seed: 1 },
  { name: "starter-2", pool: "starter", seed: 2 },
  { name: "starter-3", pool: "starter", seed: 3 },
  { name: "pool-1", pool: "all", seed: 11 },
  { name: "pool-2", pool: "all", seed: 12 },
];

export interface Golden {
  rules: number;
  record: GameRecord;
  final: string;
}

function generate(g: (typeof GAMES)[number]): Golden {
  const decks = decksFor(g.pool, g.seed);
  const r = playGame({ seed: g.seed, decks, agents: [randomAgent(g.seed), randomAgent(g.seed + 1)] });
  const rec = newRecord({
    seed: g.seed,
    players: [
      { id: "p1", name: "P1", deck: decks[0] },
      { id: "p2", name: "P2", deck: decks[1] },
    ],
  });
  // Replay the decisions to fill the checkpoints.
  let state = replayChecked(rec, CARDS, 0).state;
  for (const [p, d] of r.decided) {
    state = submit(state, p, d).state;
    recordDecision(rec, p, d, state);
  }
  return { rules: RULES_VERSION, record: rec, final: outcomeHash(state) };
}

export function checkGolden(gold: Golden): string | null {
  const r = replayChecked(gold.record, CARDS);
  if (r.diverged) return `diverged after ${r.applied} decisions`;
  if (outcomeHash(r.state) !== gold.final) return "final state differs";
  return null;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const update = process.argv.includes("--update");
  const all = process.argv.includes("--all");
  mkdirSync(DIR, { recursive: true });
  let bad = 0;
  for (const g of GAMES) {
    const file = new URL(`${g.name}.json`, DIR);
    const gold = existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")) as Golden) : null;
    const problem = gold ? checkGolden(gold) : "missing";
    if (problem && !update) {
      console.log(`${g.name}: ${problem}`);
      bad++;
    } else if (update && (problem || all)) {
      writeFileSync(file, `${JSON.stringify(generate(g))}\n`);
      console.log(`${g.name}: regenerated (${problem ?? "forced"})`);
    }
  }
  const n = readdirSync(DIR).filter((f) => f.endsWith(".json")).length;
  console.log(`golden: ${n - bad}/${n} replay identically (rules ${RULES_VERSION})`);
  process.exitCode = bad ? 1 : 0;
}
