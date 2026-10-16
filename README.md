# Pokecircle

Pokémon Trading Card Game (Standard format) in the browser: play against the AI or online against another player.
The interface and the cards are in French by default (English available).

- Rules engine in TypeScript, pure and deterministic (`packages/engine`), rules reference in `docs/rules.md`.
- Card data from [TCGdex](https://tcgdex.dev/) (`packages/cards`).
- AI opponent (`packages/ai`), online play server (`packages/server`), React interface (`packages/client`).

## Commands

```bash
npm install
npm run dev          # interface on http://localhost:5174
npm run server       # game server on :8788 (online play)
npm test             # unit tests
npm run verify -- --ci
```

Pokémon and its trademarks belong to their owners; this non-commercial project stores no card image (images are
loaded from TCGdex).
