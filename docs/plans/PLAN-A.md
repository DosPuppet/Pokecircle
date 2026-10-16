# PocketMate — Pokémon TCG (Standard) vs AI and online, in French — PLAN-A

## Context

The user wants a Pokémon TCG app (the **physical TCG / TCG Live rules**, not TCG Pocket — confirmed) to play against an AI and against another player online. It must be in French and accurate to the official rules. The first objective is the **Standard format 2026-27 (regulation marks H, I, J)**. It is built on the same base as Planecircle (`/home/dospu/MTGX`, MTG app): a pure deterministic TS engine with a serializable effect DSL, a server-authoritative `ws` server, a React 19 + Zustand client, an ISMCTS AI, French catalogs, and pm2 + nginx on the user's VPS. Card data comes from **TCGdex** (`api.tcgdex.net/v2/{fr|en}`). `/home/dospu/PocketMate` is empty (no git, no memory).

**User decisions:**
- First card pool = **~8 current Standard meta decks** (every card scripted and tested), then growth set by set to all of Standard.
- Game = physical TCG (60 cards, 6 Prizes).

**Measured scale (TCGdex, H/I/J):**
- 3,235 prints → **~2,095 gameplay definitions**: 1,845 Pokémon, 233 Trainers, 17 Energy.
- 2,738 attacks, 977 of them with no text. 933 unique attack texts, 269 Talent texts, 240 Trainer/Energy texts.
- Damage strings `N`/`N+`/`N×`/`N-`.
- Top texts repeat 10–35×, so a template compiler pays off.
- FR data is complete for main sets. Some promos (svp/mep) and basic energies (sve/mee) lack FR images.
- Set `abbreviation.official` (SSP, PBL…) exists for TCG Live lists. Ids are identical across fr/en. Tera/Ancient/Future tags are *not* in TCGdex.

**Conventions carried over from Planecircle (CLAUDE.md, user memory):**
- English code, comments and docs. Bilingual UI, **French by default**, vouvoiement. Player text via `msg()`/`t()` with FR catalogs.
- Cards in French (name, text, image) by default.
- `RulesError` for illegal decisions. Determinism (rng in state). Server authority plus hidden-info projection.
- The no-single-card-debt guard. `docs/approximations.md`. `RULES_VERSION` + golden games.
- Branch `dev`, one commit per lot, commits only when asked, the user pushes.
- VPS: pm2, 127.0.0.1, no Docker/Caddy/systemd.

## Architecture

npm-workspaces monorepo (`@pocketmate/*`, raw `.ts` exports, ESM, strict TS, Vite 8, esbuild server bundle, tsx tools, Biome, Vitest 5 `isolate:false`, Playwright-library smokes):

```
packages/engine   pure rules engine, DSL, view projection, GameHost, record/replay
packages/cards    TCGdex data/<set>.json, compiler (EN text → DSL), hand scripts, decklists, legality, decks
packages/ai       heuristic / medium / ISMCTS expert, random+chaos agents, selfplay invariants
packages/server   http + ws /ws rooms (2 seats, BO1/BO3), JSONL persistence, AI worker pool, /tcgdex/ image relay
packages/client   React 19 + Zustand, Web Worker engine for vs-AI, board, deckbuilder, lobby, PWA
tools/            verify, fuzz, golden, arena, bench, coverage, import-tcgdex, locales, *-smoke
deploy/  docs/    pm2 'pocketmate' :8788, nginx conf, update.sh; engine/ai/ui/rules/glossary/approximations docs
```

### Reuse map from `/home/dospu/MTGX`

Renames on copy: `@mtgx`→`@pocketmate`, `planecircle.*`→`pocketmate.*`, `MTGX_*`→`PM_*`.

**Copy and rename:**
- Root config: `package.json` scripts, `tsconfig*.json`, `biome.json`, `vitest.config.ts` (incl. the /tmp cleanup plugin), `.github/workflows/ci.yml`.
- Engine: `text.ts` (msg/cardRef), `errors.ts`, `events.ts`, `opRegistry.ts`.
- Client: `translate.ts`, `localize.ts`, `LangToggle.tsx`, `Dialog.tsx`, `fast.ts`, `touch.ts`, `audio/*` (except `eventSounds.ts`), `public/sw.js` + manifest.
- Server: `validate.ts`, `aiPool.ts`, `aiWorker.ts`, `main.ts`.
- Tools: `verify.ts`, `fuzz.ts`, `golden.ts`, `ai-arena.ts`, `bench.ts`, `bundle-size.ts`, `locales.ts`, `french-source.ts`, `build-server.ts`, `rooms-check.ts`, `load-test.ts`, `debt-ceilings.ts`.

**Adapt (same role and API, Pokémon content):**
- `engine/src/host.ts` (GameHost, agents, aiDelay, frames; new `fallbackDecision`/FRAME_EVENTS).
- `record.ts` (format `pocketmate-game`, RULES_VERSION restarts at 1), `fingerprint.ts`, `decisionShape.ts`, `choices.ts` (ChoiceRequest with `suggested`, CostPick).
- `game.ts` (submit/applyMutable pattern), `view.ts` (projectView/filterEvents/visibleFaces), `state.ts` (random, shuffle, clone), `turnlog.ts`, `scenario.ts`, `limits.ts`.
- Server: `index.ts` (the `/scry/` relay becomes `/tcgdex/`, strict allow-list), `rooms.ts` (2 seats, BO1/BO3, rope 60s/20s, reconnection tokens, persistence + resume, AI seats; no sideboard/Commander), `protocol.ts` (PROTOCOL_VERSION 1).
- Client: `session.ts`, `protocol.ts`, `worker/game.worker.ts`, `savedGame.ts`, `decks/{share,store}.ts`, `lobby/*`, `prompts/{ChoicePrompt,ZoneTabs,Prompts}.tsx`, `vite.config.ts` (port 5174, chunks cards/locales/vendor).
- AI: `ismcts.ts` (root search as is), `levels.ts`, `profile.ts`, `random.ts`, `chaos.ts`, `selfplay.ts`; card-test guards (`debt`, `op-handlers`, `locales`, `english-source`).
- `deploy/*`: the nginx conf must **not** redeclare the `map $http_upgrade` that Planecircle's site already defines; own cache zone.

**Rewrite (Pokémon-specific):**
- `model/*`, `dsl.ts`, `dsl/*`, `ops/*`, `legal.ts`, `turn.ts`, `autopilot.ts`.
- Cards: `decklist.ts`, `scryfall.ts`→`tcgdex.ts` + `compile/`, `audit.ts`.
- AI: `evaluate.ts`, `heuristic.ts`, `policy.ts`, `choices.ts`.
- Client: `store.ts` interaction (keep playback/frames plumbing), `i18n.ts` describeEvents, `board/*`, `images.ts`, DeckBuilder, `eventSounds.ts`.
- Dropped: stack/priority/mana/layers/control/combat and the MTG card folders.

## Engine design (`packages/engine/src`)

**State:**
- `CardObject { id, defId, printId?, owner, zone }`, with zones deck, hand, discard, prizes, lostZone, inPlay, stadium.
- `PokemonInPlay { id, owner, cards[] (evolution stack, top = current), energy[], tools[], damage (×10), conditions { rotating?: asleep|confused|paralyzed, poisoned?, burned? }, enteredTurn, evolvedTurn }`.
- `PlayerState { deck, hand, discard, lostZone, prizes[6], active, bench[], mulligans }`.
- `GameState { rng, idCounters, defs, objects, pokemon, players, stadium, turn { number, active, first, phase, used {energy, supporter, stadium, retreat} }, setup, pending, resolving (suspend/replay with answers in vars, as MTGX), queue (triggers, no stack), effects (TimedEffect: thisTurn / yourNextTurn / opponentsNextTurn / untilLeavesActive), turnLog, oncePerGame, winner, over, endReason }`.
- Card-readable "this turn" facts go through `turnLog`, not new fields (debt rule).

**Decisions:**
- `chooseFirst`, `setup {active, bench[]}`, `playBasic`, `evolve {card, target}`, `attachEnergy`, `playTrainer {card, target?, picks?}`, `useAbility`, `retreat {to, discard[]}`, `attack {index, source?}`, `endTurn`, `choose`, `concede`.
- Pending kinds: `chooseFirst | setup | main | choice` (purposes: effect, promote, prize, mulliganDraw, benchOverflow, triggerOrder).
- `legalActions` is the only source of options. Each attack option carries cost, `usable` + reason, and a `preview {damage, ko}` (Weakness/Resistance and modifiers applied).
- Simultaneous hidden choices (setup placement, double-KO promotion) are asked in sequence but masked in the view until both players have answered.

**Flow (official FR rulebook; each rule gets an id in `docs/rules.md`, cited by tests):**
- **Setup:**
  1. Coin flip; the winner chooses first or second. In BO3, the previous game's loser chooses.
  2. Draw 7 each.
  3. Automatic mulligan: the hand without a Basic is revealed and reshuffled.
  4. Active + up to 5 Bench, face down.
  5. 6 Prizes each.
  6. Extra draws for the opponent's mulligans (0..n).
  7. Reveal.
- **Turn:**
  1. Draw (an empty deck loses).
  2. Main actions in any order:
     - bench Basics;
     - evolve (not on either player's first turn, nor on a Pokémon that entered or evolved this turn; Mega ex do not end the turn);
     - 1 Energy;
     - any Items;
     - 1 Supporter (not on the first player's turn 1);
     - 1 Stadium (not the same name as the one in play);
     - Tools (1 per Pokémon);
     - 1 retreat (not Asleep or Paralyzed; clears conditions);
     - Abilities ("once during your turn" via turnLog).
  3. Attack, which ends the turn; the first player cannot attack on turn 1. Or `endTurn`.
  4. End-of-turn expiry.
- **Attack:**
  1. Energy cost solver (`energy.ts`: what each attached card provides, plus cost modifiers).
  2. Confused flip (tails = 3 counters on itself, the attack ends).
  3. Effects in text order.
  4. **Damage pipeline** (`damage.ts`, the single choke point): base (`N`/`N+`/`N×`/`N-` via Amount) → attacker modifiers → Weakness ×2 → Resistance −30 (Active only; none on the Bench) → defender reductions → prevention (incl. Tera on the Bench) → floor 0.
  5. "Place N damage counters" bypasses Weakness, Resistance and modifiers but honors "effects of attacks" prevention.
- **Pokémon Checkup:** Poison (1 counter) → Burn (2 counters, then a flip to recover) → Sleep flip → Paralysis ends after its owner's turn → Checkup abilities → KO check. Rotating conditions exclude each other; evolving or going to the Bench removes all.
- **KO, Prizes, win** (`knockout.ts`):
  - Simultaneous KOs after an attack, after the Checkup, or after counters placed by an Ability or Trainer.
  - Prizes: 1, **2 for ex, 3 for Mega ex**, with static modifiers. The owner promotes a new Active (hidden if both must).
  - Wins: last Prize taken, the opponent has no Pokémon in play, the opponent cannot draw. Simultaneous wins → Sudden Death (a draw until P8, listed in approximations).
- **Points to settle from the FR rulebook / Tournament Rules before P2 closes (listed "verify" in `docs/rules.md`):** timing of the mulligan extra draws, double-KO promotion order, simultaneous-win precedence, reprint legality.

**Effect DSL** (`model/effects.ts` ops, handlers in `ops/*`, builders `fx/when/cond/amount/ref/target`, same style as MTGX):

| Family | Ops |
|---|---|
| damage | damage(to, amount, applyWR), damageEach, placeCounters, placeCountersDivided, moveCounters, heal |
| conditions | addCondition, removeConditions |
| cards | draw, drawUntil, shuffleHandIntoDeck, discardHand, discardFromHand, search{deck\|discard → hand\|bench\|attach}, lookAtTop, millTop, shuffleDeck, toLostZone |
| energy | attachEnergyFrom{hand\|deck\|discard}, discardEnergy, moveEnergy, returnEnergyToHand |
| board | switch, gust, benchFromDeck, evolveFrom{deck\|hand, skipStage} (Rare Candy), devolve, returnToHand, shuffleIntoDeck, discardTool/Stadium, benchOverflow |
| prizes | lookAtPrizes, takePrizes |
| flow | coinFlip{n\|untilTails}, if, may, chooseOne, opponentChooses, repeat, forEach, vars, endTurn |
| timed | addEffect(duration, scope, StaticRule) |

`Amount`s: perEnergy, perBench, perPrizeTaken, perCounters, perHeads, countInZone.

**Statics** (one `StaticRule` union for Abilities, Tools, Stadiums, Special Energy and timed effects, each with an `affects` filter and a condition):
- damageMod, prevent, hpMod, retreatMod, costMod, cantAttack, cantRetreat, cantEvolve;
- abilityLock, itemLock, toolLock;
- energyProvides, typeChange, benchSize, prizeMod.

**`chars(s, pokemonId)` cache:** HP, types, Weakness/Resistance, retreat, live abilities, attacks granted by Tools, provided Energy. It is memoized by `s.version`, with `bump(s)` on every change.

**Triggers:** playedToBench, evolved, knockedOut, damagedByAttack, energyAttached, becameActive, checkup, turnStart/End, attackUsed. They resolve in order from `queue`.

**Hidden info:**
- Hands and deck order are hidden from the opponent.
- **Prize identities are hidden from both players, the owner included.**
- Setup stays face down until the reveal. Search/look results go to the actor only.
- Coin flips use `s.rng` and emit public `coinFlip` events, which the UI animates.

## Card pipeline (`packages/cards`)

**Import (`tools/import-tcgdex.ts`, `npm run import-cards -- <set>|all`):**
- Sets come from `src/setRegistry.ts`: TCGdex id, PTCGL code, FR/EN names, release date.
- EN via GraphQL (pages of 100), FR via REST. Raw cache in `data/cache/` (gitignored). Output `data/<set>.json` (committed, so builds never depend on the API).
- **Structure from EN** (category, stage, types, costs, damage, Weakness/Resistance, retreat, trainer/energy type), **strings from FR** (name, attack/ability names and texts), aligned by index. A parity check fails on mismatches.

**Definitions (`src/tcgdex.ts`, `src/index.ts`):**
- Prints merge into one def by gameplay key (name, hp, stage, types, costs, damage, texts…). Def id = `slug(enName)-hash4`; the other prints go to `prints[]` (art, PTCGL code/number). `CARDS`, `BY_NAME`, `BY_PRINT`.
- **Legality:** a def is Standard-legal if a print has mark H/I/J (Basic Energy always). Cross-checked against TCGdex per-card `legal.standard` (the set-level flag is stale). Diffs go to `data/legality-overrides.json`. Standard decks show only legal prints.
- **Tags:** ACE SPEC (rarity), Mega (name + ex), Trainer's Pokémon (name). Tera, Ancient and Future come from hand-kept `data/card-tags.json`, guarded by a test.

**Template compiler (`src/compile/*`):**
- EN text is split into sentences (reminder text stripped). Each sentence must match exactly one typed template, e.g. `"Flip a coin. If heads, your opponent's Active Pokémon is now {condition}."`. A text compiles only if all its sentences match.
- Damage strings `N+`/`N×` bind to their "more damage for each…" sentence.
- Tests: fixtures per template, no overlap between templates, and a compile snapshot baseline (`data/compile-baseline.json`).

**Hand scripts and gating:**
- Hand scripts go in `src/<set>/*.ts`, keyed by EN name (or `Name@printId`), merged per paragraph over the compiled result.
- `implemented` = every paragraph is compiled or scripted. It gates the deckbuilder, `validateDeck` and server validation.

**Overrides** in `data/`: `text-fixes.json` (TCGdex errors), `french-overrides.json` (missing FR, after trying a same-key print), `ptcgl-codes.json` (promo/energy codes), `debt-baseline.json`, `audit-baseline.json`, `french-baseline.json`.

**Decklists (`src/decklist.ts`):**
- TCG Live format with FR/EN headers (`Pokémon : N`, `Dresseur : N`, `Énergie : N`) and `4 Name CODE 123` lines. Resolution by code+number, then FR/EN name, then the Basic Energy type word.
- `validateDeck`: exactly 60, ≤4 per name (Basic Energy excepted), ≥1 Basic, ≤1 ACE SPEC.

**Coverage tool:** `npm run coverage -- --set X | --deck <id> [--unscripted] [--sentences]` ranks unmatched sentences by how many defs and meta decks use them. It drives which templates come next.

## AI (`packages/ai`)

- **Levels:**
  - beginner: noisy heuristic.
  - medium: greedy one-step simulation of every `legalActions` option plus evaluation.
  - expert: the ISMCTS root search from MTGX, playouts to the AI's next turn, time budget in the UI, iterations in tests.
- **`evaluate.ts`:**
  - prize race (steeper near the end);
  - KO threats both ways next turn (energy missing, damage after Weakness/Resistance vs remaining HP, gust targets, Prizes at risk 1/2/3);
  - energy toward attack costs;
  - evolution progress;
  - bench count and exposure;
  - Active conditions;
  - hand, deck and deck-out risk.
- **Determinization:** the opponent's hand, deck and prizes are redrawn from what has been seen. The AI's own deck and prize slots are shuffled together (own prizes are unknown). Coin-flip rng is reseeded. The AI never reads hidden zones.

## Client UI (`packages/client/src`)

- **Board** (`board/layout.ts`, pure and tested): Active, Bench 5–8 slots, Prize grid 2×3, Deck with count, Discard and Lost Zone viewers, Stadium on the center line, hand fan reused from MTGX.
- **`PokemonCard.tsx`:**
  - FR art, damage badge, Poison/Burn tokens;
  - rotation for Asleep (90° left), Paralyzed (90° right) and Confused (180°), plus an icon;
  - energy pips, Tool tucked under the card, evolution stack.
- **Action panel on your Active:** attacks with cost icons, damage preview, and a reason when unusable; Retreat (energy picker only if there is a real choice); Abilities.
- **Play:** drag or click cards to targets highlighted from `legalActions`. Generic prompts (search grid, order, yes/no, divide counters). Setup placement with a one-click "Confirmer".
- **Feedback:** coin-flip animation and sound; KO, prize and attack animations; log in French.
- **Images:** `assets.tcgdex.net/{lang}/…/{high|low}.webp`. Fallback chain: FR → EN → other print → generated text face. Optional `/tcgdex/` relay.
- **Deckbuilder:**
  - filters for type, stage, category/subtype, set, regulation mark, tags, implemented-only, FR/EN search;
  - validity panel;
  - TCG Live import/export, link/QR share, print choice.

## Lots (branch `dev`, one commit per lot when the user asks)

| Lot | Deliverables | Verification |
|---|---|---|
| **P0 Bootstrap** | `git init` (master + dev), workspaces, copied root config and generic engine infra, client shell (lobby placeholder, i18n, LangToggle), `CLAUDE.md`, `docs/{plans/PLAN-A,rules,glossary,engine}.md`, PocketMate memory files | `npm run verify -- --ci` (tsc, Biome, english-source, locales) |
| **P1 Card data** | setRegistry (Standard sets + sve/mee), import-tcgdex with cache, RawCard JSON, defs/prints/legality/tags, decklist parse/serialize, `validateDeck`, images.ts; two simple **starter decks** using only core-op cards | Import runs; tests: FR/EN parity, legality vs TCGdex, decklist round-trip FR/EN, copy limit, ACE SPEC |
| **P2 Engine core [rules]** | model, setup/mulligan, turn, actions, energy solver, attack + damage pipeline, conditions + Checkup, KO/prizes/promotion/win, legal.ts, view.ts, autopilot, host, first ~25 ops + core statics + first templates; RULES_VERSION 1, first golden games | `engine/test/rules-*.test.ts` (setup, turn, attack, damage, checkup, ko, trainers, energy), hidden.test, offers.test; fuzz random/chaos/`--offers` |
| **P3 Slice vs AI** | Starter decks fully playable, medium AI, worker session, board/PokemonCard/action panel/prompts/coin flip/log/sounds, saved-game resume, `?fast`, FR/EN | `ui-smoke` (full game vs AI in FR), `lang-smoke`, medium beats random ≥90%; `verify --set STARTER --ui` |
| **P4 Online** | Server adapted (2 seats, BO1/BO3, rope, reconnect, persistence + resume, AI seats), `/tcgdex/` relay, online lobby, `deploy/` (pm2 `pocketmate` :8788, nginx conf), `docs/deployment.md` | server tests, hidden-info audit incl. prizes, `online-smoke`, `bo3-smoke`, rooms-check, `verify --full`; the user deploys |
| **P5 Deckbuilder** | Builder, filters, TCG Live import/export, share/QR, print choice | `deck-smoke`, search/share tests |
| **P6 Compiler + meta decks** | P6a: compiler infra, coverage tool, top templates. P6b onward, one lot per 1–2 decks: the **~8 meta decks** (candidates from Limitless TEF–30C, Oct 2026: Dragapult ex, Slowking, Basic Box (Mega Kangaskhan ex), N's Zoroark ex, Alakazam, Festival Lead, Mega Lopunny ex, Hydrapple ex; final list and Limitless lists confirmed with the user at P6 start), each shipped as a precon | Per-set rules tests checking card text, a smoke test where every card is played, `verify --set META`, a coverage report per lot |
| **P7 Expert AI** | ISMCTS + determinization with prizes, arena, `docs/ai.md` | ismcts/levels tests, `ai-smoke`, `npm run arena -- --a medium --b expert --games 600` |
| **P8 Polish** | Sudden Death [rules], tutorial, PWA offline, mobile portrait, replays | tutorial/mobile/replay smokes |
| **P9+ Growth** | The rest of Standard, set by set (sv05 → me05, svp, mep, 30th), when the user names the set | `verify --set <SET>`, `--full` at the end of a series |

## Verification (end to end)

- **`npm run verify -- --set <SET>`:** tsc, Biome, coverage, bundle budget (no cards in the worker), vitest (`isolate:false`), targeted fuzz (random/mixed/chaos/`--offers`), UI smokes when client, view or protocol changed. **`--full`** before merges: all smokes, 3 seeds on the whole pool, golden, arena, bench.
- **Invariants checked at every fuzz decision:**
  - 60 cards per player, each in exactly one place;
  - damage is a multiple of 10;
  - at most one rotating condition, and none on the Bench;
  - the Bench is within its maximum;
  - exactly one Active outside setup/promotion;
  - the `chars` cache equals a fresh computation;
  - the state is pure JSON.
- **Hidden-info audit:** no opponent hand, deck or prize card appears in a view or event, and the **owner's own prizes are never shown**.
- **Golden games:** a divergence at the same RULES_VERSION fails.
- **Rules accuracy:** one test file per rule area citing `docs/rules.md` ids; one file per set checking card text; never a test that freezes wrong behavior; every approximation goes in `docs/approximations.md`.
- **Manual:**
  - `npm run dev` (Vite :5174) and play vs AI in French;
  - `npm run server` (:8788), two browsers via room code;
  - `npm run build && npm run build:server` for production.

## Risks

| Risk | Mitigation |
|---|---|
| TCGdex errors (text variants splitting defs, stale set-level legality, missing FR images) | Parity check, near-duplicate def test, `text-fixes.json`, a weekly legality check, the FR→EN→other-print image fallback, a "not in French" report at import |
| Rules ambiguities (no numbered comprehensive rules) | `docs/rules.md` with ids and citations of the FR rulebook / Tournament Rules; "verify" points settled before P2 closes, with the user if needed |
| Volume (~2,100 defs) | Template compiler driven by the sentence census, `implemented` gating, deck-by-deck then set-by-set growth, debt guard |
| Shared VPS | Distinct pm2 name, port 8788, data dir, nginx cache zone, no duplicate `map` |

## Tracking

| Lot | Status | Notes |
|---|---|---|
| P0 Bootstrap | done 2026-10-16 | workspaces, generic engine text/errors/events, client shell, guard tests, verify, docs |
| P1 Card data | done 2026-10-16 | 23 registry entries, 3,478 prints → 2,273 definitions (2,103 Standard); tags from pokemon-tcg-data; decklists FR/EN; 2 starter decks |
| P2 Engine core [rules] | done 2026-10-16 | rules 1; model, setup/mulligans, turns, attacks/damage pipeline, conditions/Checkup, KO/Prizes/win, statics, energy solver, interpreter + ops, view, host, records; compiler (47% of Standard), random/chaos agents, invariants, fuzz, golden games; 85 tests |
| P3 Slice vs AI | done 2026-10-16 | medium AI (92% vs random), beginner; worker session, board, hand, action bar, prompts, setup, coin flips, log, sounds, saves; ui-smoke and lang-smoke in French and English |
| P4 Online | done 2026-10-16 | ws server: rooms (2 seats, BO1/BO3, rope, reconnection, AI seat in worker threads), JSONL persistence + resume, TCGdex relay; online lobby; deploy (pm2 :8788, nginx without duplicate map, update.sh, rooms-check); server tests, online-smoke (BO1 and BO3) |
| P5 Deck builder | done 2026-10-16 | search FR/EN with filters, legality panel, TCG Live import/export FR/EN, share link + QR, print choice, user decks in pickers; client tests, deck-smoke |
| P6 Compiler + meta decks | done 2026-10-16 | rules 2; 8 meta decks fully implemented (Limitless TEF–30C); Ability and Special Energy compilers, 50 hand scripts, new mechanics (copied attacks, Festival Lead, Energy provision…); 54% of Standard; 20 meta card tests; program review tool |
