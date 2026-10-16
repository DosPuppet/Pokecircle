/**
 * French catalogs: every player-facing English text (`msg`, `t`, `tr` literals) has its French entry, no entry is
 * stale, catalogs are sorted and one id has one translation everywhere (the client merges them).
 * `npx tsx tools/locales.ts` sorts them and lists what is missing.
 */
import { describe, expect, it } from "vitest";
import { catalogPaths, readCatalog, scanSources } from "../../../tools/textScan";

describe("French catalogs", () => {
  const scan = scanSources();
  const catalogs = Object.fromEntries(catalogPaths().map((p) => [p, readCatalog(p)]));
  const all = new Map<string, string>();
  for (const c of Object.values(catalogs)) for (const [k, v] of Object.entries(c)) all.set(k, v);

  it("every text call takes a string literal", () => {
    expect(scan.nonLiteral).toEqual([]);
  });

  it("every message id has a French entry", () => {
    const missing = [...scan.ids.keys()].filter((id) => !all.has(id)).sort();
    expect(missing).toEqual([]);
  });

  it("no catalog entry is stale", () => {
    const stale = [...all.keys()].filter((id) => !scan.ids.has(id)).sort();
    expect(stale).toEqual([]);
  });

  it("catalogs are sorted, and an id has one translation", () => {
    const seen = new Map<string, string>();
    for (const [path, c] of Object.entries(catalogs)) {
      const keys = Object.keys(c);
      expect(keys, path).toEqual([...keys].sort());
      for (const [k, v] of Object.entries(c)) {
        if (seen.has(k)) expect(v, `${path}: ${k}`).toBe(seen.get(k));
        seen.set(k, v);
      }
    }
  });

  it("French uses vouvoiement", () => {
    // Letter boundaries in Unicode (an accented letter is a letter).
    const tu = [...all.entries()].filter(([, v]) => /(?<!\p{L})(tu|ton|ta|tes|toi|t')(?!\p{L})/iu.test(v)).map(([k]) => k);
    expect(tu).toEqual([]);
  });
});
