# AI

`packages/ai`. The AI never reads hidden cards: every simulation starts from `determinize(s, p, rng)`, which redeals
the cards the player cannot see among their hidden places (its own deck and Prizes; the opponent's hand, deck and
Prizes) and reseeds the game's random numbers (no foreseen coin flips). `ai/test/fairness.test.ts` checks it.

## Levels (`levels.ts`)

- **beginner**: medium with 35% random choices.
- **medium** (`medium.ts`): one-step simulation. Every main-phase option (`expandOptions` of `legalActions`) is applied
  to a determinized copy, questions answered with their suggestion (`settle`), and the position evaluated. Actions that
  do not attack are played while they improve the position; then the best attack, or the end of the turn. Questions:
  small picks and yes/no are simulated, others take the engine's suggestion.
- **expert**: ISMCTS (PLAN-A P7); medium until then.

## Evaluation (`evaluate.ts`)

Prize race (steeper near the end), board value (HP left, Energy, evolution stage, Tools, damage it can do), a lone
Active Pokémon, Knock Out threats both ways next turn (Weakness included), Special Conditions on the Active, hand and
deck sizes (decking out).

## Measuring

`npm run arena -- --a medium --b random --games 200 --pool starter` (seats alternate; win rate with a 95% interval).
Reference (2026-10-16): medium beats random 92–93% (starter decks and the whole pool), beginner 73%.
