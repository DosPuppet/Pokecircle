# Interface

`packages/client`: React 19, Zustand (`store.ts`), no router (`screen`), hand-written `styles.css` with tokens.

- **Game against the AI**: the engine and the AI run in a Web Worker (`worker/game.worker.ts`, `LocalSession`); the
  worker receives the definitions of the decks' cards (it does not bundle the card database).
- **Playback**: the host sends one update per visible step (`frames`); the store plays them in order with pauses (coin
  flips, attacks, Knock Outs; none with `?fast` in dev). Decisions are ignored during playback.
- **Board** (`game/`): each side has the Prize cards (left), the Bench and the Active Spot (center), the deck and the
  discard pile (right). A Pokémon in play (`PokemonSlot`) shows its card, rotated for Asleep (left), Paralyzed (right)
  and Confused (upside down), its damage, HP left, Poison and Burn markers, attached Energy and Tools.
- **Playing**: click a hand card (playable cards glow) → "Play", or click a highlighted Pokémon (Energy, Evolution,
  Tool); click your Active Pokémon → its attacks (cost, damage, K.O. preview), Abilities, Retreat (then a Benched
  Pokémon); "End turn". Questions of the engine (`Prompt`) preselect the suggested answer.
- **Setup**: click the Basic Pokémon of your hand (first = Active, then the Bench), "Confirm".
- **Log**: one line per event (`i18n.ts` `describeEvent`), built as engine texts, so it follows a change of language.
- **Images**: TCGdex French images first (`cards/src/images.ts`); Basic Energy (no image) gets a drawn Energy face.
- **Resume**: the game against the AI is saved as its record in `localStorage` (`pocketmate.localGame`) and replayed
  by the worker when the page is reopened.
- **Interface tests**: `npx tsx tools/ui-smoke.ts` (a whole game in French by clicking) and `tools/lang-smoke.ts`
  (both languages, no raw marker, no untranslated text). Vite must run (`npm run dev`, port 5174).
- **Deck builder** (`decks/`): catalog search in French or English (names, attacks, texts; `search.ts`, tested), filters
  (category, stage, Trainer kind, type, set, tags, playable only), click to add / right-click to remove, art choice per
  print, legality panel (`validateDeck`), TCG Live import and export (French or English), share by link (`#deck=1.…`,
  deflate + base64url, `share.ts`) and QR code (uqr). The player's decks live in `localStorage` (`pocketmate.decks`,
  `decks/store.ts`); deck pickers (`DeckPicker`) show them next to the precons, an unplayable one dimmed.
  `tools/deck-smoke.ts` drives it end to end.
- **Phone in portrait** (`styles.css`, `@media (orientation: portrait) and (max-width: 700px)`): card size from the
  screen (a Bench of 5 across, the whole table in the height), Prize cards and piles in a row under (or above) each
  Bench, the log on the center line, smaller cards for a Bench of more than 5. `.game` uses `overflow: clip` (a focused
  button must not scroll the table). `tools/mobile-smoke.ts` plays a game at iPhone size and checks the layout.
- **Offline (PWA)**: `public/sw.js` (production only, registered by `main.tsx`): the build files and sounds from the
  cache after the first visit, the page network first, the game worker fetched once in advance; card images relayed
  by the server (`/tcgdex/`) in their own cache (1500 at most). A game against the AI works without network
  (`tools/offline-smoke.ts`, on the production build served by the game server).
- **Images through the server**: a home-screen option (`relay` setting) loads the card images through `/tcgdex/`;
  without it, an image that fails from TCGdex is tried through the server before the text face (`CardImage`).
- **Replays** (`replay.ts`, `game/ReplayBar.tsx`): at the end of a game, "Watch the replay" (the record of the worker or
  the server, replayed in the page with every state kept) or "Export the game" (a `pocketmate-<date>.json` record);
  "Watch a game (file)" on the home screen opens one. The viewer steps, plays automatically, jumps and changes point
  of view; a record of another rules version replays up to its first divergence, with a warning.
  `tools/replay-smoke.ts`.
- **Tutorial** (`tutorial/`): five lessons (screen, Energy and attacks, Bench and evolution, Trainers and retreat,
  Weakness and Special Conditions), each a staged position (`buildScenario` in the worker) against a scripted opponent
  (`agent.ts`: attacks when it can). A lesson is a list of steps: an explanation ("Next") or an action with its allowed
  decisions (`Allow`, by English card names; anything else is refused with a hint) and an end predicate on the view and
  the events. `Coach.tsx` shows the step and circles its target; finished lessons are remembered
  (`pocketmate.tutorial`). `client/test/tutorial.test.ts` plays every lesson to its end with the solver;
  `tools/tutorial-smoke.ts` does it in the browser.
