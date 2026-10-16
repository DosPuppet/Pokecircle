/**
 * Offline test (PWA): the production build served by the game server, a first visit (service worker installed, game
 * worker cached), then the network cut: the page reloads and a game against the AI is played without network.
 *
 * Requires: `npm run build` (packages/client/dist). Usage: npx tsx tools/offline-smoke.ts [actions]
 */
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";
import { startServer } from "../packages/server/src/index";
import { step } from "./ui-smoke";

const ACTIONS = Number(process.argv[2] ?? 40);
mkdirSync("test-results", { recursive: true });
const server = await startServer({ port: 0, host: "127.0.0.1", staticDir: "packages/client/dist", aiWorkers: 0 });
const url = `http://127.0.0.1:${server.port}/`;
const browser = await chromium.launch();
let failed = false;
const check = (cond: boolean, msg: string) => {
  console.log(`${cond ? "ok" : "FAILED"}: ${msg}`);
  if (!cond) {
    failed = true;
    process.exitCode = 1;
  }
};
try {
  const context = await browser.newContext({ viewport: { width: 1400, height: 860 } });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(url);
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
  // Controlled by the service worker after a reload; the game worker is fetched 3 s after it is ready.
  await page.reload();
  check(await page.evaluate(() => !!navigator.serviceWorker.controller), "page controlled by the service worker");
  await page.waitForTimeout(4500);
  await context.setOffline(true);
  await page.reload();
  check(await page.getByRole("button", { name: "Jouer contre l'IA" }).isVisible(), "home screen offline");
  await page.getByRole("button", { name: "Jouer contre l'IA" }).click();
  let acted = 0;
  let ended = false;
  for (let i = 0; i < ACTIONS * 4 && acted < ACTIONS; i++) {
    const r = await step(page);
    if (r === "end") {
      ended = true;
      break;
    }
    if (r === "acted") acted++;
    else await page.waitForTimeout(250);
  }
  await page.screenshot({ path: "test-results/offline.png" });
  // A short game (a single Basic Pokémon Knocked Out early) still counts once it reached its end.
  check(
    acted >= Math.min(ACTIONS, 10) || (ended && acted > 0),
    `game against the AI played offline (${acted} actions${ended ? ", to the end" : ""})`,
  );
  check(errors.length === 0, errors.length ? `page errors: ${errors.join(" | ")}` : "no page error");
} finally {
  await browser.close();
  await server.close();
}
if (!failed) console.log("ok: offline game played");
