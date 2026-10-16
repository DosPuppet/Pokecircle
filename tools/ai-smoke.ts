/**
 * Interface test of the AI level: home-screen selector (remembered after a reload), and latency of the expert AI in
 * real time (without fast mode), with a normal CPU then a CPU throttled 4 times (CDP): the gap between two visible AI
 * actions must stay close to the 0.9 s pause, thinking included (time budget, `AI_BUDGET` of the worker).
 *
 * Requires: `npm run dev` running. Usage: npx tsx tools/ai-smoke.ts
 */
import { mkdirSync } from "node:fs";
import { chromium, type Page } from "playwright";

const URL = process.env.PK_URL ?? "http://localhost:5174/";
mkdirSync("test-results", { recursive: true });
const browser = await chromium.launch();
let failed = false;
const check = (cond: boolean, msg: string) => {
  console.log(`${cond ? "ok" : "FAILED"}: ${msg}`);
  if (!cond) {
    failed = true;
    process.exitCode = 1;
  }
};

/** Our turns are ended at once (questions: the confirm button); the gaps between the AI's actions are measured. */
async function measure(page: Page, label: string): Promise<number[]> {
  await page.evaluate(`(() => {
    window.__gaps = [];
    let last = 0;
    let seen = 0;
    const ACTIONS = ["playBasic", "evolve", "attach", "playTrainer", "ability", "retreat", "attack"];
    window.__pk.subscribe((st) => {
      // Updates are appended to the playback queue: look at the new ones.
      const q = st.queue;
      if (q.length < seen) seen = 0;
      for (const u of q.slice(seen)) {
        const me = u.view && u.view.me;
        if (u.events.some((e) => ACTIONS.includes(e.type) && e.player && e.player !== me)) {
          const now = Date.now();
          if (last && now - last < 5000) window.__gaps.push(now - last);
          last = now;
        }
      }
      seen = q.length;
    });
  })()`);
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    if (await page.locator(".modal.end").count()) break;
    if (((await page.evaluate("window.__gaps.length")) as number) >= 8) break;
    for (const sel of [
      ".prompt .btn.primary:not([disabled])",
      ".main-button.setup-confirm:not([disabled])",
      ".main-button.end-turn",
    ]) {
      const b = page.locator(sel);
      if (await b.count()) {
        await b
          .first()
          .click({ timeout: 1500 })
          .catch(() => undefined);
        break;
      }
    }
    await page.waitForTimeout(200);
  }
  await page.screenshot({ path: `test-results/ai-${label}.png` });
  return (await page.evaluate("window.__gaps")) as number[];
}

try {
  const page = await browser.newPage({ viewport: { width: 1400, height: 860 } });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(URL);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  const levels = page.locator(".home-main .seg button");
  check((await page.locator(".home-main .seg button.on").innerText()) === "Intermédiaire", "intermediate level by default");
  await levels.filter({ hasText: "Expert" }).click();
  await page.reload();
  check((await page.locator(".home-main .seg button.on").innerText()) === "Expert", "level remembered after a reload");

  const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] ?? 0;
  for (const [label, rate] of [
    ["normal", 1],
    ["throttled-x4", 4],
  ] as const) {
    await page.goto(URL);
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Emulation.setCPUThrottlingRate", { rate });
    await page.getByRole("button", { name: "Jouer contre l'IA" }).click();
    const gaps = await measure(page, label);
    const m = median(gaps);
    console.log(`${label}: ${gaps.length} gaps between AI actions, median ${m} ms, max ${Math.max(0, ...gaps)} ms`);
    check(gaps.length >= 3, `${label}: the expert AI plays`);
    check(m < 1600, `${label}: median gap between two AI actions < 1.6 s (0.9 s pause, thinking absorbed)`);
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
    // A new game from the home screen (the game in progress is saved; it is replaced).
    await page.evaluate("localStorage.removeItem('pokecircle.localGame')");
  }
  check(errors.length === 0, errors.length ? `page errors: ${errors.join(" | ")}` : "no page error");
} finally {
  await browser.close();
}
if (!failed) console.log("ok: AI level and latency checked");
