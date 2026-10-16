/** Golden games replay identically (tools/golden.ts): an engine change that alters them needs a RULES_VERSION bump. */
import { readdirSync, readFileSync } from "node:fs";
import { RULES_VERSION } from "@pocketmate/engine";
import { describe, expect, it } from "vitest";
import { checkGolden, type Golden } from "../../../tools/golden";

const DIR = new URL("./golden/", import.meta.url);

describe("golden games", () => {
  for (const f of readdirSync(DIR).filter((x) => x.endsWith(".json"))) {
    it(f, () => {
      const gold = JSON.parse(readFileSync(new URL(f, DIR), "utf8")) as Golden;
      const problem = checkGolden(gold);
      if (gold.rules === RULES_VERSION) expect(problem, `${f} changed without a RULES_VERSION bump`).toBeNull();
    });
  }
});
