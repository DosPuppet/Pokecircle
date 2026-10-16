/**
 * Tutorial end to end: the lesson menu, then every lesson played by clicking "Next" for explanations and doing what
 * each step asks (the solver of `tutorial/runtime.ts`, given to the store), with a refused move checked once. The
 * lessons are remembered as done.
 *
 * Requires Vite (npm run dev). Usage: npx tsx tools/tutorial-smoke.ts
 */
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";

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

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1400, height: 860 } });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(URL);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole("button", { name: "Apprendre à jouer" }).click();
  const lessons = await page.locator(".lesson").count();
  check(lessons >= 5, `${lessons} lessons in the menu`);
  for (let k = 0; k < lessons; k++) {
    await page.locator(".lesson").nth(k).click();
    await page.waitForSelector(".coach");
    // In the second lesson, once: a move the step does not ask for (ending the turn) is refused.
    let refused = k !== 1;
    for (let i = 0; i < 400; i++) {
      if (await page.locator(".coach", { hasText: "Bravo" }).count()) break;
      const next = page.locator(".coach .btn", { hasText: "Suivant" });
      if (await next.count()) {
        await next.click();
        continue;
      }
      if (!refused) {
        refused = true;
        const error = await page.evaluate(`(() => {
          const g = window.__pk.getState();
          g.decide({ type: "endTurn" });
          return window.__pk.getState().error;
        })()`);
        check(!!error, "a move the step does not ask for is refused");
      }
      const r = await page.evaluate("window.__pk.getState().tutorialSolve()");
      await page.waitForTimeout(r === "acted" ? 50 : 150);
    }
    const done = await page.locator(".coach", { hasText: "Bravo" }).count();
    await page.screenshot({ path: `test-results/tutorial-${k + 1}.png` });
    check(done > 0, `lesson ${k + 1} finished`);
    await page.locator(".coach .btn", { hasText: "Leçons" }).click();
  }
  check((await page.locator(".lesson.done").count()) === lessons, "every lesson marked as done");
  check(errors.length === 0, errors.length ? `page errors: ${errors.join(" | ")}` : "no page error");
} finally {
  await browser.close();
}
if (!failed) console.log("ok: tutorial played through");
