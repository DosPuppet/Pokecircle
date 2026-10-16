# AI

`packages/ai`. The AI never reads hidden cards: every simulation starts from `determinize(s, p, rng)`
(`determinize.ts`), and the game's random numbers are reseeded (no foreseen coin flips).

- **Its own deck and Prizes**: it knows its decklist, not where the cards are: their cards are redealt among them
  (sorted first, so that their real places have no effect).
- **The opponent's hand, deck and Prizes**: it knows neither their list nor their hand. Each hidden card is drawn from
  what it has seen of that opponent (their cards in play, under and attached to their Pokémon, in their discard pile
  and Lost Zone, their Stadium), with 20% of Basic Energy of the types seen. Before anything is seen (setup), their own
  cards are redealt.
- **Cards its pending question shows it** (a search of its deck, a look at the opponent's hand) stay what they are.
- Cards revealed earlier and gone back to a hidden zone are not remembered.

`ai/test/fairness.test.ts` and `ai/test/ismcts.test.ts` check it (an expert decision is the same when the hidden cards
are permuted).

## Levels (`levels.ts`)

- **beginner**: medium with 35% random choices.
- **medium** (`medium.ts`): one-step simulation. Every main-phase option (`expandOptions` of `legalActions`) is applied
  to a determinized copy, questions answered with their suggestion (`settle`), and the position evaluated. Actions that
  do not attack are played while they improve the position; then the best attack, or the end of the turn. Questions:
  small picks and yes/no are simulated, others take the engine's suggestion.
- **expert** (`ismcts.ts`): ISMCTS at the root of each main-phase decision; questions and the setup are medium's.
  - Candidates (`candidates`): medium's scoring (`scoreMain`, identical copies of a card counted once) gives its own
    choice, the best attack, the end of the turn and the next best actions, up to 5, without those more than 150 below
    the best (about a Prize and a half). A single candidate: no search.
  - Each iteration draws a determinization, picks a candidate by UCB1 (exploration 0.5, a bias toward the better
    one-step values and medium's choice), plays it, then simulates both players with medium's one-step policy
    (questions: their suggestion) until the start of the AI's next turn, so that the opponent's answer counts
    (`playout`, at most 120 decisions). Reward: 1 / 0.5 / 0 for a win / draw / loss, otherwise
    `sigmoid((evaluate − root) / 60)`.
  - The most visited candidate is played (ties: the best average).
  - Budget: a number of iterations (`iterations`, 48 by default: tests, arena, fuzz with 8) or a time per decision
    (`budget`: 550 ms in the browser, 0.15 s with `?fast`, 700 ms on the server), scoring included; below
    2 iterations per candidate in the time, medium's decision is kept. The 0.9 s pause between AI actions absorbs it
    (`npm run ai-smoke`).

## Evaluation (`evaluate.ts`)

Prize race (steeper near the end), board value (HP left, Energy, evolution stage, Tools, damage it can do), a lone
Active Pokémon, Knock Out threats both ways next turn (Weakness included), Special Conditions on the Active, hand and
deck sizes (decking out).

## Speed

Simulations copy the state often: `cloneState` uses a plain JSON copy (several times faster than `structuredClone`),
and the rules from every source are cached by state version (`rawStatics`). An expert game against medium takes about
7 s with 48 iterations.

## Measuring

`npm run arena -- --a medium --b random --games 200 --pool starter [--jobs 10] [--iterations 48]` (seats alternate;
win rate with a 95% interval; `--jobs` splits the same games among processes).

Reference (2026-10-16): medium beats random 92–93% (starter decks and the whole pool), 95% (meta decks); beginner
73%. Expert (48 iterations) beats medium 61.7% ± 3.9 (600 games, meta decks, 9 draws; `--jobs 10`: 12 min).
