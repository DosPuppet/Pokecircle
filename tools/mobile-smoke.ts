/**
 * Phone test (portrait, iPhone 13 size, touch): a game against the AI played by tapping, with the table checked on
 * the way: nothing wider than the screen, the header, both Active Spots and the end-of-turn button visible.
 *
 * Requires Vite (npm run dev). Usage: npx tsx tools/mobile-smoke.ts [actions]
 */
import { mkdirSync } from "node:fs";
import { chromium, devices, type Page } from "playwright";
import { step } from "./ui-smoke";

const URL = process.env.PK_URL ?? "http://localhost:5174/?fast";
const ACTIONS = Number(process.argv[2] ?? 60);
mkdirSync("test-results", { recursive: true });
let failed = false;
const check = (cond: boolean, msg: string) => {
  if (!cond) {
    console.log(`FAILED: ${msg}`);
    failed = true;
    process.exitCode = 1;
  }
};

/** Elements that must be fully on screen, and the page width. */
async function layout(page: Page, label: string): Promise<void> {
  // A string: tsx would wrap a named inner function with a helper the page does not have.
  const r = (await page.evaluate(`(() => {
    const inside = (sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const b = el.getBoundingClientRect();
      return b.left >= -1 && b.top >= -1 && b.right <= innerWidth + 1 && b.bottom <= innerHeight + 1;
    };
    return {
      width: document.documentElement.scrollWidth,
      inner: innerWidth,
      top: inside(".top-row"),
      mine: inside(".side.mine .active-spot"),
      theirs: inside(".side.top .active-spot"),
      end: inside(".main-button.end-turn"),
    };
  })()`)) as {
    width: number;
    inner: number;
    top: boolean | null;
    mine: boolean | null;
    theirs: boolean | null;
    end: boolean | null;
  };
  check(r.width <= r.inner, `${label}: page ${r.width}px wide for a ${r.inner}px screen`);
  check(r.top !== false, `${label}: header on screen`);
  check(r.mine !== false && r.theirs !== false, `${label}: both Active Spots on screen`);
  check(r.end !== false, `${label}: end-of-turn button on screen`);
}

const browser = await chromium.launch();
try {
  const context = await browser.newContext({ ...devices["iPhone 13"] });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(URL);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  const homeWidth = await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
  check(homeWidth, "home screen: no horizontal scroll");
  await page.getByRole("button", { name: "Jouer contre l'IA" }).tap();
  await page.waitForSelector(".game");
  let acted = 0;
  let result = "";
  for (let i = 0; i < ACTIONS * 4 && acted < ACTIONS; i++) {
    const r = await step(page);
    if (r === "end") {
      result = (await page.locator(".end-title").innerText()).trim();
      break;
    }
    if (r === "acted") {
      acted++;
      if (acted % 10 === 0) await layout(page, `after ${acted} actions`);
    } else await page.waitForTimeout(250);
  }
  await page.screenshot({ path: "test-results/mobile.png" });
  check(acted >= 10 || !!result, `game played on a phone (${acted} actions${result ? `, ${result}` : ""})`);
  check(errors.length === 0, `page errors: ${errors.join(" | ")}`);
  if (!failed) console.log(`ok: game played on a phone in portrait (${result || `${acted} actions`}), layout checked`);
} finally {
  await browser.close();
}
