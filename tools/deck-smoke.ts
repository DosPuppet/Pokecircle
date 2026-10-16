/**
 * Deck builder smoke test: search a card in French, add cards, import a TCG Live list, check that it is legal, save it,
 * share it (link and QR code), then play a few turns against the AI with it. Requires Vite (npm run dev).
 */
import { chromium } from "playwright";
import { playGame } from "./ui-smoke";

const URL = process.env.PK_URL ?? "http://localhost:5174/?fast";
const LIST = `Pokémon: 17
4 Ponyta TEF 26
3 Rapidash SCR 20
3 Litleo PRE 15
2 Pyroar PRE 16
3 Larvesta JTG 28
2 Volcarona JTG 29

Trainer: 27
4 Cheren WHT 81
2 Judge POR 76
2 Boss's Orders MEG 114
4 Ultra Ball MEG 131
4 Poké Ball POR 80
2 Switch MEG 130
3 Potion POR 83
2 Energy Retrieval WHT 82
2 Energy Search POR 72
2 Pokémon Catcher POR 82

Energy: 16
16 Fire Energy MEE 10

Total Cards: 60`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 880 } });
const errors: string[] = [];
page.on("pageerror", (e) => errors.push(String(e)));
await page.goto(URL);
await page.evaluate(() => localStorage.clear());
await page.goto(URL);
await page.getByRole("button", { name: /Mes decks/ }).click();
await page.locator(".search").fill("némélios");
await page.waitForTimeout(200);
const results = await page.locator(".result").count();
if (!results) throw new Error("no search result for némélios");
await page.locator(".result").first().click();
await page.locator(".result").first().click();
if ((await page.locator(".deck-row").count()) !== 1) throw new Error("the card was not added");
await page.getByRole("button", { name: /^Importer$/ }).click();
await page.locator(".list-text").fill(LIST);
await page.locator(".modal-box .btn.primary").click();
await page.waitForTimeout(200);
const size = await page.locator(".deck-size").textContent();
if (!/60/.test(size ?? "")) throw new Error(`imported deck: ${size}`);
if (!(await page.locator(".valid").count())) throw new Error("the imported deck is not legal");
await page.locator(".deck-name").fill("Deck de test");
await page.getByRole("button", { name: /^Enregistrer$/ }).click();
await page.getByRole("button", { name: /^Partager$/ }).click();
await page.waitForSelector(".qr svg");
const link = await page.locator(".share-link").inputValue();
if (!link.includes("#deck=1.")) throw new Error(`share link: ${link}`);
await page.getByRole("button", { name: /^Fermer$/ }).click();
await page.screenshot({ path: "test-results/deck-smoke.png" });
await page.getByRole("button", { name: /^Accueil$/ }).click();
await page.locator(".deck-summary").first().click();
await page.locator(".deck-dialog .seg button", { hasText: "Vos decks" }).click();
await page.locator(".deck-tile", { hasText: "Deck de test" }).first().click();
await page.getByRole("button", { name: /Jouer contre l'IA/ }).click();
await page.waitForSelector(".game");
await playGame(page, 40);
await browser.close();
if (errors.length) {
  console.log(errors.join("\n"));
  process.exit(1);
}
console.log("ok: game started with a built deck (search, import, save, share), no page error");
