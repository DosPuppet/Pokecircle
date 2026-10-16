/**
 * Verification of a lot, parallelized and timed.
 *
 * Usage:
 *   npm run verify -- --set SV08    verification of a lot (fuzz targeted on the set or deck pool)
 *   npm run verify -- --set META    meta lot: fuzz between the playable meta decks
 *   npm run verify -- --full        full verification (end of a series, before a merge)
 *   npm run verify -- --ci          continuous integration: checks, tests and short fuzzes, no interface tests
 *   options: --ui (forces the interface tests), --no-ui (skips them)
 *
 * Each step prints its duration; the detail of a step is printed only on failure (full logs in test-results/verify/).
 * Steps whose tool does not exist yet are skipped. The interface tests require Vite (npm run dev): by default, they run
 * only if the client, the view or the protocol changed since the last commit.
 */
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { availableParallelism } from "node:os";

const argv = process.argv.slice(2);
const flag = (n: string) => argv.includes(`--${n}`);
const opt = (n: string) => {
  const i = argv.indexOf(`--${n}`);
  return i >= 0 ? argv[i + 1] : undefined;
};
const full = flag("full");
const ci = flag("ci");
const set = opt("set")?.toUpperCase();
if (!full && !ci && !set) {
  console.error("Specify --set <set> (verification of a lot), --full or --ci.");
  process.exit(2);
}
const pool = set === "META" ? "meta" : (set?.toLowerCase() ?? "all");
const jobs = Math.max(1, availableParallelism() - 2);
const LOGS = "test-results/verify";
mkdirSync(LOGS, { recursive: true });

interface Step {
  name: string;
  cmd: string;
  /** Result line(s) to print even on success. */
  show?: RegExp;
  /** The step runs only if this file exists. */
  needs?: string;
}

interface Result {
  step: Step;
  ok: boolean;
  seconds: number;
  out: string;
}

function run(step: Step): Promise<Result> {
  const t0 = performance.now();
  return new Promise((resolve) => {
    const child = spawn("bash", ["-c", step.cmd], { env: { ...process.env, FORCE_COLOR: "0" } });
    let out = "";
    child.stdout.on("data", (d) => {
      out += d;
    });
    child.stderr.on("data", (d) => {
      out += d;
    });
    child.on("close", (code) => {
      const seconds = (performance.now() - t0) / 1000;
      writeFileSync(`${LOGS}/${step.name.replace(/\W+/g, "-")}.log`, out);
      resolve({ step, ok: code === 0, seconds, out });
    });
  });
}

function report(r: Result): void {
  const shown = r.step.show ? (r.out.match(new RegExp(r.step.show, "gm")) ?? []).map((l) => l.trim()).join(" | ") : "";
  console.log(`${r.ok ? "✅" : "❌"} ${r.step.name.padEnd(28)} ${r.seconds.toFixed(1).padStart(6)} s  ${shown}`);
  if (!r.ok) console.log(`${r.out.split("\n").slice(-40).join("\n")}\n`);
}

/** Steps started together; the group must finish before the next one. */
async function group(steps: Step[]): Promise<boolean> {
  const active = steps.filter((s) => !s.needs || existsSync(s.needs));
  const results = await Promise.all(active.map(run));
  for (const r of results) report(r);
  return results.every((r) => r.ok);
}

async function changedFiles(): Promise<string[]> {
  const r = await run({ name: "git-status", cmd: "git status --porcelain" });
  return r.out
    .split("\n")
    .map((l) => l.slice(3).trim())
    .filter(Boolean);
}

async function serverUp(): Promise<boolean> {
  try {
    const res = await fetch("http://127.0.0.1:8788/healthz", { signal: AbortSignal.timeout(2000) });
    return res.ok;
  } catch {
    return false;
  }
}

async function viteUp(): Promise<boolean> {
  try {
    const res = await fetch("http://localhost:5174/", { signal: AbortSignal.timeout(2000) });
    return res.ok;
  } catch {
    return false;
  }
}

const t0 = performance.now();
let ok = true;

// 1. Static checks (light, together), then vitest (it already takes all the cores).
ok &&= await group([
  { name: "tsc", cmd: "npx tsc -p tsconfig.json" },
  { name: "biome", cmd: "npx biome check .", show: /^Found .*$/ },
  {
    name: "coverage",
    cmd: `npx tsx tools/card-coverage.ts ${set === "META" || set === "STARTER" ? "--deck all" : `--set ${set && !full && !ci ? set.toLowerCase() : "standard"}`}`,
    show: /^.* implemented .*$/,
    needs: "tools/card-coverage.ts",
  },
  { name: "bundle", cmd: "npx tsx tools/bundle-size.ts", show: /^bundle: .*$/, needs: "tools/bundle-size.ts" },
]);
ok &&= await group([{ name: "vitest", cmd: "npx vitest run", show: /^\s*Tests .*$/ }]);

// 2. Fuzz: AI-vs-AI games with invariants checked at every decision.
const fuzz = (name: string, args: string): Step => ({
  name,
  cmd: `npx tsx tools/fuzz.ts ${args} --jobs ${jobs}`,
  show: /^results: .*$/,
  needs: "tools/fuzz.ts",
});
const fuzzes = ci
  ? [
      fuzz("fuzz", "--games 150 --pool all --seed 1 --offers 4"),
      fuzz("fuzz chaos", "--games 80 --pool all --ai chaos --seed 3000"),
    ]
  : full
    ? [
        fuzz("fuzz seed 1", "--games 300 --pool all --seed 1 --offers 4"),
        fuzz("fuzz seed 1000", "--games 300 --pool all --seed 1000"),
        fuzz("fuzz seed 5000", "--games 300 --pool all --seed 5000"),
        fuzz("fuzz mixed AI", "--games 100 --pool all --ai mixed"),
        fuzz("fuzz AI levels", "--games 40 --pool all --ai levels"),
        fuzz("fuzz chaos", "--games 300 --pool all --ai chaos --seed 3000"),
        fuzz("fuzz meta", "--games 100 --pool meta --ai levels"),
      ]
    : [
        fuzz(`fuzz ${set}`, `--games 300 --pool ${pool} --seed 1 --offers 4`),
        fuzz(`fuzz ${set} mixed AI`, `--games 60 --pool ${pool} --ai mixed`),
        fuzz("fuzz whole pool", "--games 200 --pool all --seed 2000"),
        fuzz(`fuzz ${set} chaos`, `--games 150 --pool ${pool} --ai chaos`),
      ];
for (const f of fuzzes) ok = (await group([f])) && ok;

// 3. Golden games replay identically.
ok =
  (await group([{ name: "golden", cmd: "npx tsx tools/golden.ts --check", show: /^golden: .*$/, needs: "tools/golden.ts" }])) &&
  ok;

// 4. Interface tests, if the client, the view or the protocol changed (or --ui, or --full).
const changed = await changedFiles();
const uiTouched = changed.some((f) => /packages\/client\/|engine\/src\/view\.ts|server\/src\/protocol\.ts/.test(f));
if (!ci && !flag("no-ui") && (full || flag("ui") || uiTouched)) {
  if (await viteUp()) {
    const online = await serverUp();
    if (!online) console.log("⚠️  online-smoke skipped: the game server does not answer on :8788 (run npm run server)");
    for (const step of [
      { name: "ui-smoke", cmd: "npx tsx tools/ui-smoke.ts", show: /^ok: .*$/, needs: "tools/ui-smoke.ts" },
      { name: "deck-smoke", cmd: "npx tsx tools/deck-smoke.ts", show: /^ok: .*$/, needs: "tools/deck-smoke.ts" },
      ...(online
        ? [{ name: "online-smoke", cmd: "npx tsx tools/online-smoke.ts", show: /^ok: .*$/, needs: "tools/online-smoke.ts" }]
        : []),
      {
        name: "lang-smoke",
        cmd: `npx tsx tools/lang-smoke.ts ${full ? 150 : 50}`,
        show: /^ok: .*$/,
        needs: "tools/lang-smoke.ts",
      },
    ])
      ok = (await group([step])) && ok;
  } else {
    console.log("⚠️  interface tests skipped: Vite does not answer on http://localhost:5174 (run npm run dev)");
    ok = false;
  }
} else {
  const why = ci ? "continuous integration" : flag("no-ui") ? "--no-ui" : "neither client, nor view, nor protocol changed";
  console.log(`·  interface tests skipped (${why})`);
}

console.log(
  `\n${ok ? "✅ Verification passed" : "❌ Verification failed"} in ${((performance.now() - t0) / 1000).toFixed(0)} s.`,
);
process.exitCode = ok ? 0 : 1;
