/**
 * Energy type symbols for the interface (`packages/client/public/energy/<type>.png`): cropped from real cards, so
 * they are the printed symbols. Basic types: the orb in the middle of the Crown Zenith basic Energy cards; Colorless
 * and Dragon (no basic Energy card): the type symbol in the corner of a Pokémon card. Run once (images committed):
 *
 *   npx tsx tools/energy-icons.ts [--debug]
 */
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";

/** Source image (TCGdex, English), crop center and radius as fractions of the image width (height for `cy`). */
interface Crop {
  type: string;
  url: string;
  cx: number;
  cy: number;
  r: number;
  /** Output scale of the crop (small corner symbols are enlarged). */
  scale: number;
}

const CRZ = (n: number) => `https://assets.tcgdex.net/en/swsh/swsh12.5/${n}/high.webp`;
const ORB = { cx: 0.5, cy: 0.4952, r: 0.234, scale: 0.5 };
const CORNER = { cx: 0.9117, cy: 0.055, r: 0.0285, scale: 2.5 };

const CROPS: Crop[] = [
  ...["G", "R", "W", "L", "P", "F", "D", "M"].map((type, i) => ({ type, url: CRZ(152 + i), ...ORB })),
  { type: "C", url: "https://assets.tcgdex.net/en/sv/sv08/143/high.webp", ...CORNER },
  { type: "N", url: "https://assets.tcgdex.net/en/sv/sv06/126/high.webp", ...CORNER },
];

const OUT = "packages/client/public/energy";
const debug = process.argv.includes("--debug");
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
try {
  for (const c of CROPS) {
    const page = await browser.newPage({ viewport: { width: 800, height: 1000 }, deviceScaleFactor: c.scale });
    await page.setContent(`<body style="margin:0;background:transparent">
      <img id="src" src="${c.url}" style="display:block;width:600px">
      <div id="crop"></div></body>`);
    await page.waitForFunction(() => (document.getElementById("src") as HTMLImageElement).complete);
    const h = await page.evaluate(() => (document.getElementById("src") as HTMLImageElement).height);
    const d = Math.round(2 * c.r * 600);
    await page.evaluate(
      ({ url, x, y, d, h, debug }) => {
        document.getElementById("src")?.remove();
        const el = document.getElementById("crop") as HTMLDivElement;
        Object.assign(el.style, {
          width: `${d}px`,
          height: `${d}px`,
          borderRadius: debug ? "0" : "50%",
          backgroundImage: `url(${url})`,
          backgroundSize: `600px ${h}px`,
          backgroundPosition: `${-(x - d / 2)}px ${-(y - d / 2)}px`,
        });
      },
      { url: c.url, x: c.cx * 600, y: c.cy * h, d, h, debug },
    );
    await page.waitForTimeout(300);
    await page.locator("#crop").screenshot({ path: `${OUT}/${c.type}.png`, omitBackground: true });
    await page.close();
    console.log(`${c.type}: ${d}px × ${c.scale}`);
  }
} finally {
  await browser.close();
}
