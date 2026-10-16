/**
 * Safety caps of the engine. A cap reached is an approximation, listed in docs/approximations.md.
 */

/** Steps of the game flow (`advance`) without a decision: beyond, the game is a draw. */
export const MAX_FLOW_STEPS = 100_000;
/** Mulligan rounds: beyond (a deck without Basic Pokémon), the game is a draw. */
export const MAX_MULLIGANS = 50;
/** Consecutive automatic decisions (AI, autopilot) in a turn: beyond, the game is a draw (`GameHost`). */
export const MAX_AUTOMATIC_DECISIONS = 2_000;
/** Turns: beyond, the game is a draw (decks never run out only if cards return to them). */
export const MAX_TURNS = 400;
