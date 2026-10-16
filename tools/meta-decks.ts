/**
 * Meta decks from Limitless TCG: for each archetype, the first decklist of its page (the best recent placing), written
 * as a TCG Live list in `docs/meta/<date>/<archetype>.txt` (then turned into precons by hand: `packages/cards/decks/`).
 *
 *   npx tsx tools/meta-decks.ts 284:dragapult 322:slowking …
 */
import { mkdirSync, writeFileSync } from "node:fs";

const BASE = "https://limitlesstcg.com";
const UA = { "User-Agent": "Mozilla/5.0 (Pokecircle meta import)" };
const date = new Date().toISOString().slice(0, 10);
const dir = new URL(`../docs/meta/${date}/`, import.meta.url);
mkdirSync(dir, { recursive: true });

async function text(url: string): Promise<string> {
  const res = await fetch(url, { headers: UA });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.text();
}

const decode = (s: string) =>
  s
    .replace(/&#039;|&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .trim();

for (const arg of process.argv.slice(2)) {
  const [id, name] = arg.split(":");
  const page = await text(`${BASE}/decks/${id}`);
  const listId = /href="\/decks\/list\/(\d+)"/.exec(page)?.[1];
  if (!listId) throw new Error(`no decklist for archetype ${id}`);
  const html = await text(`${BASE}/decks/list/${listId}`);
  const title = decode(/<meta property="og:description" content="([^"]+)"/.exec(html)?.[1] ?? "");
  const sections: Record<string, string[]> = { Pokémon: [], Trainer: [], Energy: [] };
  const counts: Record<string, number> = { Pokémon: 0, Trainer: 0, Energy: 0 };
  let current = "Pokémon";
  for (const m of html.matchAll(
    /decklist-column-heading">([^<(]+)|data-set="([A-Za-z0-9-]*)" data-number="([^"]*)"[\s\S]*?card-count">(\d+)<\/span>\s*<span class="card-name">([^<]+)</g,
  )) {
    if (m[1]) {
      const h = m[1].trim();
      current = h.startsWith("Pok") ? "Pokémon" : h.startsWith("Trainer") ? "Trainer" : "Energy";
      continue;
    }
    const [, , set, number, count, cardName] = m;
    sections[current]?.push(`${count} ${decode(cardName as string)}${set ? ` ${set} ${number}` : ""}`);
    counts[current] = (counts[current] ?? 0) + Number(count);
  }
  const total = (counts.Pokémon ?? 0) + (counts.Trainer ?? 0) + (counts.Energy ?? 0);
  const out = [
    `// ${name}: ${title} (${BASE}/decks/list/${listId}, imported ${date})`,
    `Pokémon: ${counts.Pokémon}`,
    ...(sections.Pokémon ?? []),
    "",
    `Trainer: ${counts.Trainer}`,
    ...(sections.Trainer ?? []),
    "",
    `Energy: ${counts.Energy}`,
    ...(sections.Energy ?? []),
    "",
    `Total Cards: ${total}`,
  ].join("\n");
  writeFileSync(new URL(`${name}.txt`, dir), `${out}\n`);
  console.log(`${name}: ${total} cards (${title})`);
}
