/**
 * Drag and drop from the hand: the setup by dragging a Basic Pokémon to the Active Spot, then, in the main phase, an
 * Energy dragged onto the Active Pokémon and a card released over the hand (it goes back).
 *
 * Requires Vite (npm run dev). Usage: npx tsx tools/drag-smoke.ts
 */
import { mkdirSync } from "node:fs";
import { chromium, type Locator, type Page } from "playwright";

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

async function drag(page: Page, from: Locator, to: Locator | { x: number; y: number }): Promise<void> {
  const a = await from.boundingBox();
  const t = "x" in to ? { x: to.x, y: to.y, width: 0, height: 0 } : await to.boundingBox();
  if (!a || !t) throw new Error("drag: element not found");
  await page.mouse.move(a.x + a.width / 2, a.y + 20);
  await page.mouse.down();
  await page.mouse.move(a.x + a.width / 2, a.y - 30, { steps: 4 });
  await page.mouse.move(t.x + t.width / 2, t.y + t.height / 2, { steps: 12 });
  await page.mouse.up();
  await page.waitForTimeout(700);
}

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 860 } });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(URL);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.locator(".play-bar .main-button").click();
  // Setup: the sturdiest Basic Pokémon is placed as Active at first.
  for (let i = 0; i < 60 && !(await page.locator(".side.mine .pokemon.placing").count()); i++) {
    const first = page.locator(".prompt .btn.primary:not([disabled])");
    if (await first.count())
      await first
        .first()
        .click()
        .catch(() => undefined);
    await page.waitForTimeout(300);
  }
  await page.waitForTimeout(500);
  await page.locator(".side.mine .active-spot .pokemon.placing").click();
  check((await page.locator(".side.mine .pokemon.placing").count()) === 0, "setup: a placed Pokémon taken back by a click");
  // The card flies back into the hand.
  await page.waitForTimeout(900);
  await drag(page, page.locator(".hand-card.playable").first(), page.locator(".side.mine .active-spot"));
  check(
    (await page.locator(".side.mine .active-spot .pokemon.placing").count()) === 1,
    "setup: Basic Pokémon dragged to the Active Spot",
  );
  await page.locator(".main-button.setup-confirm").click();
  await page.waitForSelector(".main-button.end-turn", { timeout: 30_000 });
  await page.waitForTimeout(600);
  const hand = await page.locator(".hand-card").count();
  // Released over the hand: the card goes back.
  const any = page.locator(".hand-card.playable").first();
  const box = await page.locator(".hand").boundingBox();
  if (box && (await any.count())) await drag(page, any, { x: box.x + box.width * 0.85, y: box.y + box.height * 0.7 });
  check((await page.locator(".hand-card").count()) === hand, "a card released over the hand goes back");
  const energy = page.locator(".hand-card.playable", { has: page.locator("img[alt*='Énergie']") }).first();
  if (await energy.count()) {
    const before = await page.locator(".side.mine .active-spot .pk-energy-pip").count();
    await drag(page, energy, page.locator(".side.mine .active-spot .pokemon"));
    const after = await page.locator(".side.mine .active-spot .pk-energy-pip").count();
    check(after === before + 1, `Energy dragged onto the Active Pokémon (${before} → ${after})`);
  } else console.log("   (no Energy in hand: Energy drag not tested)");
  await page.screenshot({ path: "test-results/drag.png" });
  check(errors.length === 0, errors.length ? `page errors: ${errors.join(" | ")}` : "no page error");
} finally {
  await browser.close();
}
if (!failed) console.log("ok: drag and drop checked");
