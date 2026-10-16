/**
 * Scan of player-facing texts in the source (PLAN-A, same rules as Planecircle's PLAN-I): every string literal given to
 * `msg(…)`, `t(…)` or `tr(lang, …)` is a message id that must have a French entry in a catalog. Shared by
 * `packages/cards/test/locales.test.ts` and `tools/locales.ts`.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";

export const ROOT = new URL("../", import.meta.url);
export const SOURCE_DIRS = ["packages/engine/src", "packages/cards/src", "packages/client/src", "packages/server/src"];
/** Files that define the text functions themselves (their calls pass a variable on purpose). */
const IMPLEMENTATION = new Set([
  "packages/engine/src/text.ts",
  "packages/client/src/translate.ts",
  "packages/client/src/localize.ts",
]);

export const CATALOGS = ["packages/engine/locales/fr.json", "packages/server/locales/fr.json", "packages/client/locales/fr.json"];

/** Every catalog file, the cards' ones included. */
export function catalogPaths(): string[] {
  const cards = "packages/cards/locales/fr/";
  const extra = existsSync(new URL(cards, ROOT))
    ? readdirSync(new URL(cards, ROOT))
        .filter((f) => f.endsWith(".json"))
        .sort()
        .map((f) => cards + f)
    : [];
  return [...CATALOGS, ...extra].filter((p) => existsSync(new URL(p, ROOT)));
}

export function readCatalog(path: string): Record<string, string> {
  return JSON.parse(readFileSync(new URL(path, ROOT), "utf8"));
}

export function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  const walk = (rel: string) => {
    for (const e of readdirSync(new URL(rel, ROOT), { withFileTypes: true })) {
      const path = `${rel}/${e.name}`;
      if (e.isDirectory()) walk(path);
      else if (/\.tsx?$/.test(e.name)) out.push(path);
    }
  };
  if (existsSync(new URL(dir, ROOT))) walk(dir);
  return out;
}

/** Source without its comments (block comments, and line comments that start a line or follow a space). */
export function stripComments(code: string): string {
  return code.replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, " ")).replace(/(^|\s)\/\/.*$/gm, "$1");
}

/** The string literal at `i` (`"…"`, `'…'` or a template literal without `${…}`), or `undefined`. */
function literalAt(code: string, i: number): string | undefined {
  const q = code[i];
  if (q !== '"' && q !== "'" && q !== "`") return undefined;
  let j = i + 1;
  while (j < code.length && code[j] !== q) j += code[j] === "\\" ? 2 : 1;
  const body = code.slice(i + 1, j);
  if (q === "`") return body.includes("${") ? undefined : body;
  return q === '"' ? JSON.parse(`"${body}"`) : JSON.parse(`"${body.replace(/\\'/g, "'").replace(/"/g, '\\"')}"`);
}

export interface Scan {
  /** Message id → files citing it, by package directory (`packages/<pkg>/`). */
  ids: Map<string, Set<string>>;
  /** `file: call` whose first argument is not a string literal. */
  nonLiteral: string[];
}

export function scanSources(): Scan {
  const ids = new Map<string, Set<string>>();
  const nonLiteral: string[] = [];
  for (const dir of SOURCE_DIRS)
    for (const file of sourceFiles(dir)) {
      if (IMPLEMENTATION.has(file)) continue;
      const code = stripComments(readFileSync(new URL(file, ROOT), "utf8"));
      for (const m of code.matchAll(/(?<![\w.$])(?:(msg|t)\(\s*|tr\(\s*[^,()]+,\s*)/g)) {
        const at = (m.index ?? 0) + m[0].length;
        const text = literalAt(code, at);
        if (text === undefined) {
          // `t(` of an unrelated function (a parameter named t) is not ours: only flag clear calls.
          if (m[1] === "msg" || m[0].startsWith("tr(")) nonLiteral.push(`${file}: ${code.slice(m.index, at + 30)}`);
          continue;
        }
        const set = ids.get(text) ?? new Set<string>();
        set.add(file);
        ids.set(text, set);
      }
    }
  return { ids, nonLiteral };
}
