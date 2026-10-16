/**
 * Online smoke test: two browser pages; one creates a room, the other joins it with the code, and they play a game
 * (French interface) until it ends. Fails on a page error or a stuck game. Requires Vite (npm run dev) and the game
 * server (npm run server).
 *
 *   npx tsx tools/online-smoke.ts [maxActions] [--bo3]
 */
import { chromium, type Page } from "playwright";
import { step } from "./ui-smoke";

const BASE = process.env.PM_URL ?? "http://localhost:5174/";
const MAX = Number(process.argv[2] ?? 600);
const bo3 = process.argv.includes("--bo3");

const browser = await chromium.launch();
const errors: string[] = [];
async function open(name: string): Promise<Page> {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 820 } });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(`${name}: ${String(e)}`));
  await page.goto(`${BASE}?fast`);
  await page.evaluate((n) => {
    localStorage.clear();
    localStorage.setItem("pocketmate.settings", JSON.stringify({ nickname: n }));
  }, name);
  return page;
}

const a = await open("Alice");
await a.goto(`${BASE}?fast`);
await a.getByRole("button", { name: /Jouer en ligne/ }).click();
if (bo3) await a.getByRole("button", { name: /meilleur des trois/ }).click();
await a.getByRole("button", { name: /^Créer$/ }).click();
const code = (await a.locator(".room-code").textContent({ timeout: 10000 }))?.trim() ?? "";
if (!/^[A-Z0-9]{6}$/.test(code)) throw new Error(`no room code (${code})`);
const b = await open("Bob");
await b.goto(`${BASE}?room=${code}&fast`);
await b.getByRole("button", { name: /^Rejoindre$/ }).click();
await a.waitForSelector(".game", { timeout: 15000 });
await b.waitForSelector(".game", { timeout: 15000 });

let games = 0;
let idle = 0;
for (let i = 0; i < MAX; i++) {
  const ra = await step(a);
  const rb = await step(b);
  if (ra === "end" && rb === "end") {
    games++;
    const next = a.getByRole("button", { name: /Partie suivante/ });
    if (bo3 && (await next.count())) {
      await next.click();
      await b.getByRole("button", { name: /Partie suivante/ }).click();
      continue;
    }
    break;
  }
  if (ra === "waiting" && rb === "waiting") {
    idle++;
    await a.waitForTimeout(100);
    if (idle > 300) throw new Error("the online game is stuck");
  } else idle = 0;
}
await a.screenshot({ path: "test-results/online-smoke-a.png" });
await b.screenshot({ path: "test-results/online-smoke-b.png" });
const title =
  (await a
    .locator(".end-title")
    .textContent()
    .catch(() => "")) ?? "";
await browser.close();
if (errors.length) {
  console.log(errors.join("\n"));
  process.exit(1);
}
console.log(`ok: online game${games > 1 ? `s (${games})` : ""} played (${title || "not finished"}), no page error`);
