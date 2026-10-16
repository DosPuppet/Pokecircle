/**
 * Interface smoke test: a whole game against the AI in the browser (French interface, `?fast`), played by clicking:
 * setup, prompts, attaching Energy, playing cards, attacking, ending turns. Fails on a page error or a stuck game.
 * Requires Vite (npm run dev). Screenshots in test-results/.
 *
 *   npx tsx tools/ui-smoke.ts [maxActions]
 */
import { mkdirSync } from "node:fs";
import { chromium, type Page } from "playwright";

const URL = process.env.PK_URL ?? "http://localhost:5174/?fast";
const MAX = Number(process.argv[2] ?? 400);
mkdirSync("test-results", { recursive: true });

/** The interface has shown every update (no playback in progress). */
async function idle(page: Page): Promise<void> {
  await page
    .waitForFunction(
      () => {
        const s = (window as unknown as { __pk: { getState(): { queue: unknown[]; busy: boolean } } }).__pk.getState();
        return s.queue.length === 0 && !s.busy;
      },
      undefined,
      { timeout: 15000 },
    )
    .catch(() => undefined);
}

async function tap(_page: Page, selector: ReturnType<Page["locator"]>): Promise<boolean> {
  try {
    await selector.click({ timeout: 2000 });
    return true;
  } catch {
    return false;
  }
}

/** A hand card: the fan overlaps them, the visible strip is at the left of each card. */
async function tapCard(selector: ReturnType<Page["locator"]>): Promise<boolean> {
  try {
    await selector.click({ timeout: 2000, position: { x: 8, y: 24 } });
    return true;
  } catch {
    return false;
  }
}

/** One action on a page if it is this page's turn; returns "end" when the game is over, "acted" or "waiting". */
export async function step(page: Page): Promise<"end" | "acted" | "waiting"> {
  if (await page.locator(".modal.end").count()) return "end";
  const confirm = page.locator(".prompt .btn.primary:not([disabled])");
  if (await confirm.count()) return (await tap(page, confirm.first())) ? "acted" : "waiting";
  const setup = page.locator(".main-button.setup-confirm:not([disabled])");
  if (await setup.count()) return (await tap(page, setup)) ? "acted" : "waiting";
  const end = page.locator(".main-button.end-turn");
  if (!(await end.count())) return "waiting";
  const playable = page.locator(".hand-card.playable");
  const n = await playable.count();
  for (let k = 0; k < n && k < 3; k++) {
    if (!(await tapCard(playable.nth(k)))) break;
    const play = page.locator(".action-panel .btn.play", { hasText: /Jouer|Play/ });
    if (await play.count()) return (await tap(page, play.first())) ? "acted" : "waiting";
    const target = page.locator(".pokemon.targetable");
    if (await target.count()) return (await tap(page, target.first())) ? "acted" : "waiting";
  }
  await tap(page, page.locator(".side.mine .active-spot .pokemon").first());
  const attack = page.locator(".btn.attack.primary");
  if (await attack.count()) return (await tap(page, attack.first())) ? "acted" : "waiting";
  return (await tap(page, end)) ? "acted" : "waiting";
}

export async function playGame(page: Page, maxActions: number): Promise<string> {
  let stuck = 0;
  for (let i = 0; i < maxActions; i++) {
    await idle(page);
    if (await page.locator(".modal.end").count()) return (await page.locator(".end-title").textContent()) ?? "";
    // A question: confirm the suggested answer.
    const confirm = page.locator(".prompt .btn.primary:not([disabled])");
    if (await confirm.count()) {
      await tap(page, confirm.first());
      stuck = 0;
      continue;
    }
    // Setup: confirm the suggested placement.
    const setup = page.locator(".main-button.setup-confirm:not([disabled])");
    if (await setup.count()) {
      await tap(page, setup);
      continue;
    }
    const end = page.locator(".main-button.end-turn");
    if (await end.count()) {
      // My turn: attach an Energy, play a Basic, attack if possible, else end the turn.
      const playable = page.locator(".hand-card.playable");
      const n = await playable.count();
      let acted = false;
      for (let k = 0; k < n && !acted && k < 3; k++) {
        if (!(await tapCard(playable.nth(k)))) break;
        const play = page.locator(".action-panel .btn.play", { hasText: /Jouer|Play/ });
        if (await play.count()) {
          acted = await tap(page, play.first());
          break;
        }
        const target = page.locator(".pokemon.targetable");
        if (await target.count()) {
          acted = await tap(page, target.first());
          break;
        }
      }
      if (!acted) {
        await tap(page, page.locator(".side.mine .active-spot .pokemon").first());
        const attack = page.locator(".btn.attack.primary");
        if (await attack.count()) await tap(page, attack.first());
        else await tap(page, end);
      }
      await page.waitForTimeout(30);
      continue;
    }
    // The opponent plays: wait.
    await page.waitForTimeout(80);
    stuck++;
    if (stuck > 400) throw new Error("the game is stuck");
  }
  return "";
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => {
    if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errors.push(m.text());
  });
  await page.goto(URL);
  // PK_DECK / PK_AI_DECK: precon ids to play (default: the first two).
  await page.evaluate(
    ([deck, aiDeck]) => {
      localStorage.clear();
      if (deck) localStorage.setItem("pokecircle.settings", JSON.stringify({ deck, aiDeck: aiDeck ?? deck }));
    },
    [process.env.PK_DECK, process.env.PK_AI_DECK] as const,
  );
  await page.goto(URL);
  await page.getByRole("button", { name: /Jouer contre l'IA/ }).click();
  await page.waitForSelector(".game");
  await page.waitForTimeout(500);
  await page.screenshot({ path: "test-results/ui-smoke-start.png" });
  const result = await playGame(page, MAX);
  await page.screenshot({ path: "test-results/ui-smoke-end.png" });
  await browser.close();
  if (errors.length) {
    console.log(errors.join("\n"));
    process.exit(1);
  }
  console.log(`ok: game played in French (${result || "not finished"}), no page error`);
}

/** Concedes through the drawer (☰ → Concede → Confirm). */
export async function concede(page: Page): Promise<void> {
  await page.locator(".drawer-toggle").click();
  await page.locator(".sidebar .btn", { hasText: /^(Abandonner|Concede)$/ }).click();
  await page.locator(".sidebar .btn.danger").click();
}
