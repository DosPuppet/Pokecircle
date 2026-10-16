/**
 * French catalogs: sorts every catalog and lists the message ids without a French entry (and stale entries).
 *
 *   npx tsx tools/locales.ts            report
 *   npx tsx tools/locales.ts --prune    also removes stale entries
 */
import { writeFileSync } from "node:fs";
import { catalogPaths, ROOT, readCatalog, scanSources } from "./textScan";

const prune = process.argv.includes("--prune");
const scan = scanSources();
const all = new Set<string>();
for (const path of catalogPaths()) {
  const c = readCatalog(path);
  const sorted: Record<string, string> = {};
  for (const k of Object.keys(c).sort()) if (!prune || scan.ids.has(k)) sorted[k] = c[k] as string;
  for (const k of Object.keys(sorted)) all.add(k);
  writeFileSync(new URL(path, ROOT), `${JSON.stringify(sorted, null, 2)}\n`);
}
const missing = [...scan.ids.entries()].filter(([id]) => !all.has(id));
for (const [id, files] of missing) console.log(`missing: ${JSON.stringify(id)}  (${[...files].join(", ")})`);
const stale = [...all].filter((id) => !scan.ids.has(id));
for (const id of stale) console.log(`stale: ${JSON.stringify(id)}`);
console.log(`${missing.length} missing, ${stale.length} stale`);
