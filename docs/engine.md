# Engine

Pure, deterministic Pokémon TCG rules engine (`packages/engine/src`). Rules reference: `docs/rules.md`.

## Contract

- `createGame(opts)` and `submit(state, player, decision)` return `{ state, events }`; `submit` works on a copy (card
  definitions are shared, never copied). `applyMutable` is the in-place variant for AI simulation.
- An illegal decision throws a **`RulesError`** (player-facing English text, `msg`); any other error is an engine bug.
- `legalActions(s, p)` lists the options of the main phase; the interface, the AI and the autopilot choose only from it.
  The same predicates (`legal.ts`) validate decisions (`actions.ts`): an option offered then refused is a bug, caught by
  the strict fuzz (`--offers`).
- The state is one JSON object (`model/state.ts`): no classes, functions, Maps or Sets. Random numbers come from
  `s.rng` (`random`, `shuffle`, `flipCoin` in `state.ts`).
- Anything characteristics depend on calls `bump(s)` (statics cache, `statics.ts`).

## File map

| File | Role |
|---|---|
| `model/cards.ts` | `CardDef` (Pokémon, Trainer, Energy), attacks, Abilities, triggers, prints |
| `model/effects.ts` | the effect DSL: refs, scopes, filters, amounts, conditions, ops |
| `model/rules.ts` | `StaticRule`: continuous rules of Abilities, Tools, Stadiums, Special Energy, timed effects |
| `model/state.ts` | `GameState`, `PokemonInPlay`, resolutions, timed effects, turn log |
| `model/decisions.ts` | `Decision`, `PendingDecision`, `ChoiceRequest`, `ActionOption` |
| `state.ts` | ids, lookups, card movement (`moveCard` gives a new id in the deck and the Prizes), drawing |
| `match.ts` | filters and scopes (printed characteristics only: no recursion with statics) |
| `statics.ts` | rules in force (ability locks first), computed characteristics `chars`, Bench size, item locks |
| `energy.ts` | Energy units and cost payment (attacks, Retreat) |
| `effects.ts` | interpreter: frames, suspended questions (`answer`), refs, amounts, conditions |
| `ops/*.ts` | op handlers by domain, registered by `ops/index.ts` (`opRegistry.ts`) |
| `damage.ts` | the only place damage and damage counters are put (R-ATTACK-4 to 6, Tera) |
| `conditions.ts` | Special Conditions (R-COND) |
| `board.ts` | benching, evolving, switching, removing Pokémon, attaching cards |
| `triggers.ts` | triggered effects, queued (no stack) |
| `knockout.ts`, `prizes.ts` | Knock Outs, Prize cards, promotion, winning (R-KO, R-WIN) |
| `turn.ts` | setup, turns, Pokémon Checkup and the `advance` loop |
| `actions.ts` | main-phase decisions |
| `legal.ts` | main-phase options and their predicates |
| `game.ts` | `createGame`, `submit`, `applyMutable` |
| `view.ts` | `projectView` and `filterEvents` (hidden information) |
| `host.ts` | `GameHost`: agents, autopilot, pacing, frames, records |
| `record.ts`, `fingerprint.ts` | game records, replay (with a step callback for the replay viewer), checkpoints, `RULES_VERSION` |
| `scenario.ts` | staged positions (`buildScenario`): rules tests and tutorial lessons |
| `dsl.ts` | builders for templates and scripts |

## Resolutions and questions

- What resolves (an attack, a Trainer card, an Ability, a triggered effect) is a `Resolution`: a stack of frames of
  effects. Control ops (`if`, `may`, `chooseOne`, `repeat`, `forEach`) push frames.
- An op that needs a choice calls `answer(r, key, player, request)`: an answer already given, a forced answer (a
  question with a single possible answer is never asked), or a question, which suspends the resolution. When answered,
  **the same op runs again** and finds its answers; an op never changes the state before all its questions are answered.
- Questions about hidden cards carry them in `request.cards` (sent to the decider only by `projectView`).
- Triggered effects wait in `s.queue` and resolve in order once nothing else resolves; then Knock Outs are checked,
  then wins, then promotions.

## Attacks

- An attack's `effects` are its program: pre effects (damage modifiers, coin flips that decide them, "does nothing"),
  `mainDamage` (the printed damage to the Defending Pokémon), then the other effects. The card compiler places
  `mainDamage` (`cards/src/compile/attacks.ts`).
- Damage goes through `dealAttackDamage` only; damage counters through `putCounters`.
- Timed effects of attacks bound to Pokémon (`attackEffect`) end when they leave the Active Spot or evolve (R-TEXT-4).

## Hidden information

- Hands: the owner only. Decks and Prize cards: nobody (their ids change when they enter, so they cannot be tracked).
- The opponent's setup placement is hidden until both players have placed.
- `filterEvents` masks drawn cards, taken Prizes and moves between hidden zones for other viewers.

## Safety caps

- `limits.ts`: flow steps without a decision, mulligan rounds, automatic decisions per turn, turns, coin flips "until
  tails" (`ops/flow.ts`). Reaching one ends the game in a draw (or stops the flips); listed in `docs/approximations.md`.

## Card growth (PLAN-B)

- Amounts added for card texts: `tools`, `retreatCost`, `conditions`, `energyTypes`, `damageTaken` (damage done by attacks
  during the previous turn, from the turn log), `div`, `turnLog` with a card `filter`; filters `attackNamed`,
  `abilityNamed` (cards too), `maxRemainingHp` (computed HP, never in a static's scope).
- The turn log records amounts (`damagedByAttack`, `healed`). Rules: `prevent.maxDamage`, `attackFlip` (a coin before
  attacking), `prizes.oncePerGame`; ops `lockAttack`; Energy `providesIf`; Supporters `firstTurnOk`; a trigger's own card
  is `thisCard` in its effects.
- `chooseCards.random`: a random pick without a question ("a random card from your opponent's hand"); with `reveal`,
  both players see it. Compiler: a template's `condition` (feasibility, "only if") gates Trainers and Abilities only;
  an attack takes `useCondition` ("You can use this attack only if…"), R-TEXT-3b.
