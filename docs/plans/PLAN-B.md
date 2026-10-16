# Pokecircle — every Standard card, by lots (PLAN-B)

## Context

Pokecircle (PLAN-A, done through P8 and the U1 interface) plays 1,129 of the 2,103 Standard definitions (marks H, I, J): every card of the 8 meta decks and the two starters, plus what the template compiler understands. The user wants **all Standard cards**, lot by lot, accurate to the printed text.

**What remains (census of 2026-10-16):**
- 974 definitions are missing, by kind: 712 Pokémon (including 146 ex), 46 Items, 44 Supporters, 29 Tools, 23 Stadiums and 13 Special Energy.
- 890 of them lack exactly one paragraph and 84 lack two. That is 231 Ability paragraphs and 827 attack, Trainer or Energy paragraphs.
- The tail is long: 913 distinct unmatched sentences, 841 of them on one card only. Templates alone will not finish the job: shared engine mechanics first, then hand scripts set by set.
- Mechanic families among the missing paragraphs (a paragraph can count in several):

  | Family | Paragraphs |
  |---|---|
  | conditional or "for each" bonus damage | 234 |
  | damage counters | 101 |
  | deck search variants | 92 |
  | prevent / reduce | 75 |
  | Energy move / attach | 73 |
  | coins (until tails, one per Energy…) | 71 |
  | discarding Energy, Tools or Stadiums | 58 |
  | Bench damage | 57 |
  | deck top / look | 54 |
  | evolution effects | 50 |
  | Special Conditions | 49 |
  | opponent's hand | 46 |
  | draw | 45 |
  | heal | 44 |
  | can't attack / retreat / play | 35 |
  | Prize cards | 34 |
  | switch / gust | 32 |
  | first turn and turn order | 22 |
  | copied attacks | 10 |
  | Fossils | 7 |
  | none of these | 157 |

- Remaining per set:

  | Set | Left | Set | Left | Set | Left | Set | Left |
  |---|---|---|---|---|---|---|---|
  | sv05 | 62 | sv06 | 79 | sv06.5 | 28 | sv07 | 47 |
  | sv08 | 103 | sv08.5 | 18 | sv09 | 53 | sv10 | 93 |
  | sv10.5b | 37 | sv10.5w | 36 | me01 | 56 | me02 | 36 |
  | me02.5 | 52 | me03 | 34 | me04 | 43 | me05 | 50 |
  | svp | 45 | mep | 42 | 30th | 59 | sv04 | 1 (Reversal Energy) |

**User decisions:**
- **Meta relevance first.** First the cards played in current top decks (Limitless), wherever they come from. Then the rest set by set, newest first, then promos and 30th Celebration.
- **Run every lot in sequence** on `dev`, one commit per lot, with a short report after each. The user merges to `main`.

## Approach

1. Accuracy tooling first (B0).
2. A meta refresh (B1).
3. Three cross-set engine waves that unlock many cards at once (B2–B4).
4. Set lots that finish each set with templates and hand scripts (B5–B15).
5. A closing lot (B16).

Conventions stay those of PLAN-A and `CLAUDE.md`:
- A builder returns null when it does not understand a phrase: no wrong card.
- No single-card debt: generic forms before fields, ops or union members for one card.
- `registerScripts` for unique texts.
- Card tests check behavior against the printed text.
- `docs/approximations.md` for anything approximated.
- `RULES_VERSION`, regenerated golden games and `tools/rooms-check.ts` whenever engine behavior changes.

### Definition of done of every card lot

1. `npm run coverage -- --set <set> --unscripted --sentences` (and `--families`, B0): classify what is left.
2. Generic before specific:
   - widen phrases and templates (`cards/src/compile/phrases.ts`, `templates.ts`, `effects.ts`, `attacks.ts`, `trainers.ts`, `abilities.ts`, `energies.ts`);
   - then new ops or statics only when generic (`engine/src/ops/*`, `model/effects.ts`, `model/rules.ts`, `statics.ts`);
   - then hand scripts in `cards/src/scripts/<set>.ts`, registered like `scripts/meta.ts`.
3. Review every newly implemented program against its English text with `npx tsx tools/card-program.ts --set <set> --new` (B0). French names and texts are checked in the deck builder.
4. Tests:
   - `cards/test/<set>.test.ts`: one test per new mechanic and per tricky card, citing the printed text. Model: `cards/test/meta.test.ts`, with helpers `scenario`, `play`, `answer`, `handOf` from `engine/test/helpers.ts`.
   - The every-card test (B0) covers all of them automatically.
5. `cards/data/compile-baseline.json` updated. It becomes a list of implemented ids in B0, so any card that falls back fails.
6. `npm run verify -- --set <SET>` (fuzz on the set pool, `tools/decks.ts` `poolDefs`). Interface tests whenever a new prompt kind or view field appears.
7. `docs/extensions/<set>.md` (cards, scripts, approximations) and the PLAN-B tracking table.
8. Commit `B<n>: <sets> (<k> cards)`, with `[rules N]` when engine behavior changed.

## Lots

| Lot | Content | Verification |
|---|---|---|
| **B0 Tooling and accuracy harness** | (details below) | the new tests pass on the 1,129 cards; `verify --ci` |
| **B1 Meta refresh** | (details below) | the new precons fully implemented; `verify --set META`; `ui-smoke` with `PK_DECK` on two new decks |
| **B2 Engine wave 1: attack effects [rules]** | (details below) | rules tests (`docs/rules.md` ids for Weakness / Resistance exceptions); every-card test; `verify --full`; golden regenerated |
| **B3 Engine wave 2: cards and zones [rules]** | (details below) | tests per op; hidden-info audit (`engine/test/hidden.test.ts`) extended to reveals and looks; `lang-smoke`; `ui-smoke` |
| **B4 Engine wave 3: continuous effects and Abilities [rules]** | (details below) | rules tests; every-card test; fuzz chaos and strict offers on the whole pool |
| **B5 me05** | finish the set | DoD |
| **B6 me04 + me03** | finish both sets | DoD |
| **B7 me02.5** | finish the set | DoD |
| **B8 me02 + me01** | finish both sets | DoD |
| **B9 sv10.5b + sv10.5w** | Black Bolt / White Flare | DoD |
| **B10 sv10** | Destined Rivals (Team Rocket's) | DoD |
| **B11 sv09 + sv08.5** | Journey Together, Prismatic Evolutions | DoD |
| **B12 sv08** | Surging Sparks (the largest set left) | DoD |
| **B13 sv07 + sv06.5** | Stellar Crown, Shrouded Fable | DoD |
| **B14 sv06** | Twilight Masquerade | DoD |
| **B15 sv05 + sv04 + svp + mep + 30th** | Temporal Forces, Reversal Energy; Scarlet & Violet and Mega Evolution promos; 30th Celebration (mostly reprints: many already share a definition) | DoD |
| **B16 Closing** | (details below) | `verify --full`; `npm run arena -- --a expert --b medium --games 600 --pool all --jobs 10`; all smokes |

### B0 Tooling and accuracy harness

- `tools/card-coverage.ts --families`: missing paragraphs grouped by mechanic family (the census above as a tool).
- `tools/card-program.ts --set <set> [--new]`: programs next to their text for a set, or only the cards implemented since the baseline.
- `compile-baseline.json` changed to a list of implemented ids, guarded by `cards/test/compile.test.ts`.
- **Every-card test** (`cards/test/every-card.test.ts` plus a helper in `engine/test/helpers.ts`). For each implemented Standard definition, a generated scenario puts the card where it acts and uses each of its effects once, answering questions with their suggestion:
  - each attack, with the cost attached;
  - each activated Ability;
  - the Trainer card played;
  - the Energy attached.

  It then checks no engine error, `checkInvariants` (`ai/src/invariants.ts`), damage in multiples of 10, and a pure-JSON state. All cards are run in `verify --full`; a sample runs in vitest.
- `docs/plans/PLAN-B.md` (this plan) and its tracking table.

### B1 Meta refresh

- Import the current Limitless top lists into `docs/meta/<date>/`: the most played archetypes of Standard, about 16 lists, with the existing 8 updated.
- `tools/meta-decks.ts` ranks their unimplemented cards by the number of lists using them; implement them all with templates and scripts.
- New meta precons in `cards/decks/meta-*.json`; `docs/extensions/meta.md` updated.

### B2 Engine wave 1: attack effects [rules]

Families: bonus damage, damage counters, coins, Bench damage.

- **Coins:** until tails; one per Energy; heads counts feeding amounts; riders.
- **New Amount and Condition forms**, ranked by reuse:
  - damage counters already on the Defending Pokémon or on your Bench;
  - extra Energy beyond the cost;
  - Tools on your Pokémon;
  - healed this turn (`turnLog`);
  - Prize comparison;
  - a type on your Bench;
  - the opponent's Retreat Cost;
  - Pokémon with a named attack in play.
- **Damage counters:** until remaining HP is N; on N of the opponent's Pokémon; on each Benched Pokémon of both sides.
- **Damage pipeline flags:** ignore Resistance, ignore Weakness, ignore effects on the Defending Pokémon (`damage.ts` stays the single choke point).
- **Attack restrictions:** "can't use this attack again until it leaves the Active Spot"; attack cost modifiers per count.
- **Healing:** heal as much as the damage done.

Unlocks most of the 234 + 101 + 71 + 57 paragraphs.

### B3 Engine wave 2: cards and zones [rules]

- **The opponent's hand:** reveal; random discard; look and choose; shuffle into the deck. Hidden-information rules: `projectView` and `filterEvents` show revealed cards to the right player only; a "revealed cards" viewer in the client.
- **Deck top of either deck:** look, reveal, order, discard.
- **Search variants:** a card that evolves from this Pokémon (evolve it); one per Benched Pokémon; up to N any cards.
- **Draw:** until N; one per X; each player.
- **Costs and piles:** discard-from-hand costs; Pokémon from the discard pile onto the Bench; Energy back to the hand or the deck.
- **Board:** shuffle a Pokémon and its cards into the deck; discard a Stadium in play; discard Tools before damage.

### B4 Engine wave 3: continuous effects and Abilities [rules]

- **Prevent / reduce:** from Basic Pokémon; effects but not damage; on the Bench.
- **Next turn:** can't retreat, can't attack, flip to attack.
- **Cost modifiers:** Retreat and attack cost per count; Ability locks with exceptions (named Pokémon).
- **Type changes:** by Tool (Future Booster Energy Capsule…), Ancient / Future conditions.
- **Special Energy riders.**
- **Pokémon Checkup** modifiers.
- **First-turn exceptions:** attack on the first turn when going first, only when going second.
- **"Your turn ends".**
- **Fossils:** "Play this card as if it were a N-HP Basic {C} Pokémon"; a Trainer in play as a Pokémon (legal.ts, board.ts, view, client).
- **Play restrictions:** "put into play only with…".

Abilities: once-per-turn draw, search and Energy families, triggered on play, evolve or Knock Out, and passive damage and HP modifiers. These cover most of the 231 Ability paragraphs.

### B16 Closing

- 100% of Standard implemented (or each exception listed in `docs/approximations.md` with its reason).
- Whole-pool fuzz with 3 seeds.
- AI check on the new mechanics: answers to new question kinds, `evaluate.ts` aware of the new conditions where it matters; arena expert against medium on the whole pool.
- Deck builder "playable only" filter off by default.
- `docs/`, `CLAUDE.md` and memory updated.
- Then a standing process for each new set release: import, coverage, one lot.

**Order rationale:** after B1 (the competitive cards) and the engine waves, sets go newest first, because their cards stay legal longest. Promos and 30th Celebration come last: they mostly reprint cards already covered.

## Risks

| Risk | Mitigation |
|---|---|
| Wrong programs from widened templates | null-on-doubt builders; the `--new` program review each lot; every-card test; behavior tests citing the text |
| Engine changes breaking golden games and saved online rooms | `[rules]` lots bump `RULES_VERSION`; golden regeneration; `tools/rooms-check.ts` before deploying |
| Hidden-information leaks with reveals and looks | `projectView` / `filterEvents` tests for every new reveal; the hidden-info audit in fuzz |
| Long tail (841 sentences used once) | scripts per set, grouped in `scripts/<set>.ts`; no single-card fields in the model |
| AI blind to new mechanics | suggested answers by default; review in B16 with the arena |
| Bundle size (more scripts) | card data and scripts stay in the `cards` chunk; the bundle budget check in verify |

## Verification (end to end)

- **Each lot:**
  - `npm run verify -- --set <SET>`: tsc, Biome, coverage, vitest including the every-card sample, fuzz on the set pool (random, mixed AI, chaos, strict offers), interface tests when client, view or protocol changed;
  - `npx tsx tools/card-program.ts --set <set> --new` reviewed;
  - the coverage count for the set reaches its total.
- **[rules] lots:** `npx tsx tools/golden.ts --update --all`, `npm run verify -- --full`.
- **End (B16):**
  - `npm run verify -- --full`, with the every-card test on all 2,103 definitions;
  - `npm run arena -- --a expert --b medium --games 600 --pool all --jobs 10`;
  - online smoke BO1 and BO3;
  - a manual game in French with new-mechanic cards (`npm run dev`, deck builder with "playable only" off).

## Tracking

| Lot | State | Notes |
|---|---|---|
| B0 Tooling and accuracy harness | done 2026-10-16 | `--families`, `--write-baseline` (ids), `card-program --set/--new`, every-card test (1,121 cards, 2,337 effects; all in `verify --full`) |
| B1 Meta refresh | done 2026-10-16 | rules 4; 8 more archetypes (16 meta precons, 209 cards, all implemented); 1,129 → 1,200 Standard; scripts keyed by print where names are shared (4 wrong P6 applications fixed) |
| B2 Engine wave 1: attack effects | done 2026-10-16 | rules 5; 1,200 → 1,356 Standard; coins as sentences (each heads/tails, if both/all/any), ~20 conditions and amounts (Tools, Retreat Cost, Special Conditions, Energy types, damage taken last turn, healed this turn, Round…), counters until HP N, Bench and per-Energy damage, next-turn effects (attack flip, prevent up to N or from Basic/Evolution Pokémon, take more/less), first-turn attacks; HTML and the Bench W/R reminder removed from texts; fixes: per-Energy damage, "during your next turn" timing, W/R exemptions without main damage, "attach them to 1 of your Pokémon" |
| B3 Engine wave 2: cards and zones | done 2026-10-16 | rules 6; 1,356 → 1,408 Standard; random cards from the opponent's hand (no question, revealed to both), the opponent choosing their own discards, revealed hands, discard-a-card costs, "only if you go second", the top card of the deck, Basic Pokémon from the deck top or the deck onto the Bench, "up to N cards", shuffle this Pokémon in, Energy back to the opponent's hand; Abilities: Bench-only protection, no effects of attacks, Active-only damage reduction, no Retreat Cost without Energy, a Bench-only activated form; client: revealed-cards overlay; fix: attacks no longer inherit Trainer feasibility conditions (about 150 attacks were wrongly unusable with an empty deck or a full Bench, R-TEXT-3b) |
| B4 Engine wave 3: continuous effects and Abilities | done 2026-10-16 | rules 7; 1,408 → 1,485 Standard; a sentence grammar for static texts (`compile/statics.ts`, Abilities, Tools, Stadiums, Special Energy riders): damage taken and dealt with attacker and target filters, Retreat Cost, HP (amounts too), Ability locks with exceptions, card locks, attack costs per count, single Special Condition immunity, added types, prevention (from, at least N damage), Pokémon Checkup counters, survive at 10 HP, Berries (`consume`), "doesn't stack" (`noStack`); Fossils (Items played as Basic Pokémon, R-FOSSIL, a "Discard from play" action) and Fossil Quarry; Stadium actions "that player may…"; Special Energy every type on a kind of Pokémon (Prism, Neo Upper, Reversal); first-turn Supporters and attacks; card filters no longer widen silently |
| B5 me05 | done 2026-10-16 | rules 8; me05 88/88 (52 before); 1,485 → 1,552 Standard; generic: hand, Prize and damage-counter conditions, cards attached by name, filtered counts, named searches onto the Bench at any Stage, timed static sentences, `retaliate`, `survive` variants, trigger event facts (`ev:*`, damaged-by-attack triggers hold after a Knock Out), delayed `endOfTurn` effects, `reflip`, bottom of the deck; 8 scripts (`docs/extensions/me05.md`) |
| B6 me04 + me03 | done 2026-10-16 | rules 9; me04 90/90, me03 92/92; 1,552 → 1,645 Standard; phrases (hand sizes, cards played this turn, cards in the discard pile, names as scopes and Trainer names), ~15 templates, static grammar (less damage, ignore {C}, first-turn evolution, Ability immunity, coin prevention), engine (`cantAttach`, `attackFlip.coins`, `weakTo`, Stadium `replaces`, `replaceCard`, Energy back to the hand, `discardedFromDeck`); 36 scripts (`docs/extensions/me04-me03.md`) |
| B7 me02.5 | done 2026-10-16 | rules 10; me02.5 225/225 (with the reprinted earlier cards); 1,645 → 1,715 Standard; turn log of attacks and Prize cards (`didLastTurn`, `turnLog.sum`), `dealt.attack`, `oppToBench` trigger, Prize `flip` and `by`, `noTools`, ~20 templates and phrases; 19 scripts (`docs/extensions/me02.5.md`) |
| B8 me02 + me01 | done 2026-10-16 | rules 11; me02 98/98, me01 135/135; 1,715 → 1,774 Standard; `altCost`, `movedToBench`/`allyBecameActive` triggers, `onAttach`, `keepConfused`, `leastHp`, `takePrizes.side`, `useCardEffects`, Stadium owner, `myTurn`, `setupActive` (client too); ~15 templates; fix: "Switch this Pokémon with your Active Pokémon"; 21 scripts (`docs/extensions/me02-me01.md`) |
| B9 sv10.5b + sv10.5w | done 2026-10-16 | rules 12; 86/86 and 87/87; 1,774 → 1,818 Standard; evolution from the deck, `firstTurnAttacks`, `attackBase`, `resistance` filter, ~20 templates and phrases; 9 scripts (`docs/extensions/sv10.5.md`) |
| B10 sv10 | done 2026-10-16 | rules 13; sv10 184/184; 1,818 → 1,854 Standard; `allyKnockedOut`/`oppEvolved` triggers, trigger `noStack`, `eventCard`, `cantPlayPokemon`, `retaliate.asDamage`, delayed end-of-turn templates, ~15 templates; 16 scripts (`docs/extensions/sv10.md`) |
| B11 sv09 + sv08.5 | done 2026-10-16 | rules 14; sv09 157/157, every Standard definition of sv08.5 (13 non-Standard reprints out of scope); 1,854 → 1,906 Standard; KO attacker event, `onAttach.heal`, `evolvesAs`, `winGame`, `attackCost.attack/anyType`, `ignoreEffects`, `onlyByEffect`; ~15 templates; 31 scripts (`docs/extensions/sv09-sv08.5.md`) |
| B12 sv08 | done 2026-10-16 | rules 15; every Standard sv08 definition (Jet Energy non-Standard); 1,906 → 1,955 Standard; `untilYourNextTurnEnd`, two-effect clauses, ~10 phrases and templates; 40 scripts (`docs/extensions/sv08.md`) |
| B13 sv07 + sv06.5 | done 2026-10-16 | rules 16; sv07 144/145 (Blastoise ex non-Standard), sv06.5 70/70; 1,955 → 1,993 Standard; `shielded` enforced (with Supporters), confusion counters, `benchFromHand`, `evolveFromHand.store`, ACE SPEC `noRecovery`, ~5 templates and phrases; 34 scripts (`docs/extensions/sv07-sv06.5.md`) |
| B14 sv06 | done 2026-10-16 | rules 17; every Standard sv06 definition (Raifort, Luminous Energy non-Standard); 1,993 → 2,028 Standard; `noToHand`, `nameInPlay`, `replaceCard.old` (Palafin's Zero to Hero), `thisCard` for played Trainers, stored cards as Pokémon references; 35 scripts (`docs/extensions/sv06.md`) |
| B15 sv05 + sv04 + svp + mep + 30th | done 2026-10-16 | rules 18; **every Standard definition implemented (2,103 / 2,103)**; 2,028 → 2,103; "evolves from" filled for 30th prints (10 implemented cards could not be evolved into), spelled-out Energy symbols read as symbols, `weakness.mult`, `prevolutionAttacks`, `noHeal`, `trainerFlip`, duration `whileActive`, `evolveFromHand.filter`, card filter `retreat`; 71 scripts (`docs/extensions/sv05-promos.md`) |
