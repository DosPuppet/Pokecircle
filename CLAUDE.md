# CLAUDE.md — tracking and conventions for PocketMate

This file tracks the project between sessions: current state, working rules, pitfalls. The plan is
`docs/plans/PLAN-A.md`; the history is in `docs/history.md`; open items in `docs/backlog.md`.

## Goal and scope

- Pokémon Trading Card Game (physical TCG / TCG Live rules, **not** TCG Pocket) against the AI and online (2 players,
  BO1/BO3), home-grown rules engine in TypeScript, fluid interface with automation. Same base as Planecircle
  (`/home/dospu/MTGX`, read-only reference).
- **Scope: Standard 2026-27** (regulation marks H, I, J; `docs/rules.md` R-FORMAT). First card pool: about 8 current
  meta decks, then set by set.
- Card data: TCGdex (`https://api.tcgdex.net/v2/{fr,en}`), imported offline into `packages/cards/data/<set>.json`.

## State

- PLAN-A lots: see the tracking table at the end of `docs/plans/PLAN-A.md`.

## Documents

- `docs/plans/PLAN-A.md`: the plan (lots P0 to P9) and its tracking.
- `docs/rules.md`: **rules reference with ids** (R-SETUP-3…), cited by the tests. Read before changing the engine.
- `docs/glossary.md`: official French terms; the catalogs follow it.
- `docs/engine.md`: engine file map and design rules. `docs/ai.md`, `docs/ui.md`, `docs/deployment.md`.
- `docs/approximations.md`: every known approximation (added when introduced, removed when lifted).
- `docs/extensions/<set or deck>.md`: detail of each card batch.

## Conventions

- **Language:** code, comments, tests and documents in **English** (`cards/test/english-source.test.ts`; a line kept in
  French on purpose: `// i18n-ignore: <why>`). The interface is **bilingual, French by default** (`pocketmate.lang`),
  with **vouvoiement**. Every player-facing text is English in the source: `msg("…", { args })` in the engine, cards
  and server; `t("…")` / `useT()` in the client; always a string literal. French goes into a catalog keyed by the
  English text (`engine/locales/fr.json`, `server/locales/fr.json`, `cards/locales/fr/<file>.json`,
  `client/locales/fr.json`); `npx tsx tools/locales.ts` sorts them and lists what is missing;
  `cards/test/locales.test.ts` fails on a missing, stale or conflicting entry. Terms: `docs/glossary.md`.
- **Cards in French by default:** name, texts and image from TCGdex FR; EN as fallback.
- **Engine:** pure and deterministic (seed in the state); effects are serializable data (DSL), never functions in the
  state; an illegal decision throws a **`RulesError`**; any change that may alter characteristics calls `bump(s)`;
  `legalActions` is the only source of options (UI, AI, autopilot).
- **Online:** the server is authoritative; a player receives only their view (`projectView`) and filtered events.
  Prize cards are hidden from **both** players.
- **No single-card debt:** look for a generic form before adding a field, op or union member for one card.
- **Rules accuracy:** a test never freezes a wrong behavior; rules tests cite `docs/rules.md` ids.
- **Git:** branches `main` (stable) and `dev` (work). Work on `dev`; one commit per lot at its end (authorized by the
  user); English message ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. The user pushes.

## Cards: compiler and scripts

- `packages/cards/src/compile/`: English text → DSL at load time (`phrases.ts` grammar, `templates.ts` matcher,
  `effects.ts` shared templates, `attacks.ts`, `trainers.ts`). A template's builder returns null when it does not
  understand a phrase: the card then stays unimplemented rather than wrong. A text compiles only if every sentence does.
- Hand scripts: `registerScripts({ "<English name>": (def) => ({ … }) })` (`cards/src/scripts.ts`), merged before compiling.
- `npm run coverage -- --set standard --sentences` ranks unmatched sentences; `--card "<name>"` shows one card;
  `--deck all` the precons. `cards/data/compile-baseline.json`: implemented Standard definitions can only go up.
- Card-text tests check behavior against the printed text (`cards/test/starter.test.ts` model), with the engine's
  scenario helpers (`engine/test/helpers.ts`: `scenario`, `play`, `answer`, `handOf`).

## Card data

- `npm run import-cards -- <set>|all [--refresh]` (`tools/import-tcgdex.ts`): TCGdex EN for structure, FR for strings
  (aligned by index), raw cache in `packages/cards/data/cache/` (gitignored), output `packages/cards/data/<set>.json`
  (committed, 1-space indent). Sets: `packages/cards/src/setRegistry.ts` (the only list; `only` imports single prints of
  a rotated set) and `sets.ts` (the static imports, checked by `catalog.test.ts`).
- Tags TCGdex lacks (Tera, Ancient, Future, ACE SPEC): `npx tsx tools/import-tags.ts` (pokemon-tcg-data on GitHub)
  writes `data/card-tags.json`.
- Definitions (`cards/src/tcgdex.ts`): prints with the same gameplay share a definition (`slug-hash` id); prints missing
  Weakness/Resistance (promos) or text (30th Celebration) join their only complete variant; legality from TCGdex's
  per-print `legal.standard` (it applies the reprint rule); French from the first French print, else a translation
  memory, else `data/french-overrides.json` (`missing` lists the cards that have no French at all).
- Legality check: `npx tsx tools/check-legality.ts` (differences mean a reimport).
- Decklists: TCG Live format, FR or EN (`cards/src/decklist.ts`); precons in `packages/cards/decks/*.json` (a TCG Live
  list each, loaded by `decks.ts`).

## Checks before handing in a lot

- `npm run verify -- --set <SET>` (tsc, Biome, coverage, vitest, fuzz, golden, interface tests when the client changed)
  or `--ci`; `--full` at the end of a series.
- [rules] lot: advance `RULES_VERSION` (`engine/src/record.ts`).

## Known pitfalls

- **Vite under WSL** may serve a stale engine module: restart `npm run dev` before a browser test.
- Dev server: Vite on 5174, game server on 8788 (Planecircle uses 5173 and 8787 on the same machine).
- **Playwright is pinned to 1.63.0**: its browsers are already cached (`~/.cache/ms-playwright/*-1243`, shared with
  Planecircle); another version would need `npx playwright install`.
- Interface tests wait for the playback to end (`window.__pm` store: `queue` empty, not `busy`) before clicking.
