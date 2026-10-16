/**
 * Replays end to end: a game against the AI (a few actions, then concede), "Watch the replay": the viewer steps
 * forward, back, jumps to the end and changes point of view; then "Export the game" (downloaded file) and "Watch a
 * game (file)" from the home screen with that file.
 *
 * Requires Vite (npm run dev). Usage: npx tsx tools/replay-smoke.ts
 */
import { mkdirSync } from "node:fs";
import { chromium, type Page } from "playwright";
import { concede, step } from "./ui-smoke";

const URL = process.env.PK_URL ?? "http://localhost:5174/?fast";
mkdirSync("test-results", { recursive: true });
let failed = false;
const check = (cond: boolean, msg: string) => {
  console.log(`${cond ? "ok" : "FAILED"}: ${msg}`);
  if (!cond) {
    failed = true;
    process.exitCode = 1;
  }
};
const pos = async (page: Page) => {
  const [i, n] = (await page.locator(".replay-pos").innerText()).split("/").map((x) => Number(x.trim()));
  return { i: i ?? -1, n: n ?? -1 };
};

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1400, height: 860 }, acceptDownloads: true });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(URL);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole("button", { name: "Jouer contre l'IA" }).click();
  await page.waitForSelector(".game");
  for (let i = 0, acted = 0; i < 120 && acted < 20; i++) {
    const r = await step(page);
    if (r === "end") break;
    if (r === "acted") acted++;
    else await page.waitForTimeout(200);
  }
  if (!(await page.locator(".modal.end").count())) await concede(page);
  await page.getByRole("button", { name: "Revoir la partie" }).click();
  await page.waitForSelector(".replay-bar");
  const start = await pos(page);
  check(start.i === 0 && start.n > 10, `replay opened at the start (${start.n} steps)`);
  check((await page.locator(".modal.end").count()) === 0, "no end-of-game window during the replay");
  await page.locator(".replay-bar button", { hasText: "▶" }).click();
  await page.locator(".replay-bar button", { hasText: "▶" }).click();
  check((await pos(page)).i === 2, "two steps forward");
  await page.locator(".replay-bar button", { hasText: "◀" }).click();
  check((await pos(page)).i === 1, "one step back");
  await page.locator(".replay-bar button", { hasText: "⏭" }).click();
  check((await pos(page)).i === start.n, "jump to the end");
  const myHand = await page.locator(".hand .hand-card").count();
  await page.locator(".replay-viewer select").selectOption({ index: 1 });
  await page.waitForTimeout(200);
  check((await page.locator(".side.mine").getAttribute("data-player")) === "p2", "point of view changed to the AI");
  await page.screenshot({ path: "test-results/replay.png" });
  console.log(`   hands: ${myHand} (player), ${await page.locator(".hand .hand-card").count()} (AI)`);
  await page.locator(".drawer-toggle").click();
  await page.locator(".sidebar .btn", { hasText: "Menu" }).click();

  // The same game again, exported then opened from the home screen.
  await page.getByRole("button", { name: "Jouer contre l'IA" }).click();
  await page.waitForSelector(".game");
  await page.waitForTimeout(500);
  await concede(page);
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Exporter la partie" }).click(),
  ]);
  const file = `test-results/${download.suggestedFilename()}`;
  await download.saveAs(file);
  check(/^pokecircle-.*\.json$/.test(download.suggestedFilename()), `game exported (${download.suggestedFilename()})`);
  await page.locator(".modal.end .btn", { hasText: "Accueil" }).click();
  await page.locator(".file-btn input").setInputFiles(file);
  await page.waitForSelector(".replay-bar");
  check((await pos(page)).n > 0, "exported game opened from the home screen");
  check(errors.length === 0, errors.length ? `page errors: ${errors.join(" | ")}` : "no page error");
} finally {
  await browser.close();
}
if (!failed) console.log("ok: replays watched, exported and opened");
