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
