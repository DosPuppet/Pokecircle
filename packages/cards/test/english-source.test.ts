/**
 * Code, comments and tests are in English (French lives in the catalogs and the card data). A line may keep French on
 * purpose with `// i18n-ignore: <why>`; a whole file is allowed in `data/french-baseline.json` with its reason.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ROOT, sourceFiles } from "../../../tools/textScan";
import baseline from "../data/french-baseline.json";

const DIRS = ["packages/engine", "packages/cards", "packages/client", "packages/server", "packages/ai", "tools"].flatMap((p) =>
  p === "tools" ? ["tools"] : [`${p}/src`, `${p}/test`],
);
/** Letters that English text does not use (the "é" of Pokémon is allowed). */
const FRENCH = /[àâçèêëîïôùûœÀÂÇÈÊËÎÏÔÙÛŒ]|\b(?:le|la|les|des|une|est|avec|dans|sur)\b(?=\s+\p{L})/u;

describe("English source", () => {
  it("has no French outside the allowed files and lines", () => {
    const allowed = new Set(Object.keys(baseline.allowed));
    const offenders: string[] = [];
    for (const dir of DIRS)
      for (const file of sourceFiles(dir)) {
        if (allowed.has(file)) continue;
        readFileSync(new URL(file, ROOT), "utf8")
          .split("\n")
          .forEach((line, i) => {
            if (line.includes("i18n-ignore")) return;
            const text = line.replace(/Pokémon|é/g, "e");
            if (FRENCH.test(text)) offenders.push(`${file}:${i + 1}: ${line.trim().slice(0, 100)}`);
          });
      }
    expect(offenders).toEqual([]);
  });
});
