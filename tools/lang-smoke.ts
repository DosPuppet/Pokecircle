/**
 * Both languages: a game against the AI in French then in English, a number of actions each; fails on a raw text
 * marker (⟨…⟩, ⟦…⟧), on an English interface text left untranslated in French, or on a page error.
 * Requires Vite (npm run dev).
 *
 *   npx tsx tools/lang-smoke.ts [actions]
 */
import { readFileSync } from "node:fs";
import { chromium } from "playwright";
import { playGame } from "./ui-smoke";

const URL = process.env.PK_URL ?? "http://localhost:5174/?fast";
const ACTIONS = Number(process.argv[2] ?? 50);
const FR: Record<string, string> = {};
for (const f of ["packages/client/locales/fr.json", "packages/engine/locales/fr.json", "packages/cards/locales/fr/core.json"])
  Object.assign(FR, JSON.parse(readFileSync(f, "utf8")));
const english = new Set(
  Object.entries(FR)
    .filter(([k, v]) => k !== v && !k.includes("{"))
    .map(([k]) => k),
);

const browser = await chromium.launch();
const problems: string[] = [];
for (const lang of ["fr", "en"]) {
  const page = await browser.newPage({ viewport: { width: 1366, height: 860 } });
  page.on("pageerror", (e) => problems.push(`${lang}: ${String(e)}`));
  await page.goto(URL);
  await page.evaluate((l) => {
    localStorage.clear();
    localStorage.setItem("pokecircle.lang", l);
  }, lang);
  await page.goto(URL);
  await page.locator(".play-bar .main-button").click();
  await page.waitForSelector(".game");
  await playGame(page, ACTIONS);
  await page.locator(".drawer-toggle").click({ force: true });
  const texts = await page.evaluate(() => {
    const out: string[] = [];
    const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = walk.nextNode(); n; n = walk.nextNode()) if (n.textContent?.trim()) out.push(n.textContent.trim());
    return out;
  });
  for (const t of texts) {
    if (/[⟨⟩⟦⟧]/.test(t)) problems.push(`${lang}: raw marker in "${t}"`);
    if (lang === "fr" && english.has(t)) problems.push(`fr: untranslated "${t}"`);
  }
  await page.screenshot({ path: `test-results/lang-smoke-${lang}.png` });
  await page.close();
}
await browser.close();
if (problems.length) {
  console.log([...new Set(problems)].join("\n"));
  process.exit(1);
}
console.log(`ok: both languages, ${ACTIONS} actions each, no raw marker or untranslated text`);
