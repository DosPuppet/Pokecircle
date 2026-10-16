# Known approximations

Every approximation of the official rules or of a card's text is listed here when introduced and removed when lifted.

## General

- R-SETUP-7: the extra mulligan draws happen before placement (equivalent distribution, see `docs/rules.md`).

- Safety caps (`engine/src/limits.ts`): a game without a decision for 100,000 flow steps, 50 mulligan rounds, 2,000
  automatic decisions in a turn or 400 turns ends in a draw; "flip until tails" stops at 100 heads.
- Prize cards are taken from the first slots: they are unknown to their owner, so the choice does not matter. Cards
  that let a player look at their Prizes would make it matter (none implemented yet).
- R-KO-4: when both players must promote, the player whose turn it is chooses first, and the choice is shown at once.
- Sudden Death (R-WIN-4) ends the game with no winner until PLAN-A P8.

- Copying attacks (`useAttackOf`: N's Zoroark ex's Night Joker, Slowking's Seek Inspiration, Mew ex): an attack that
  itself copies attacks is not offered, so copies never chain (a Night Joker copying another Night Joker would loop).

## Cards

- Brock's Scouting: the player chooses "up to 2 Basic Pokémon" or "1 Evolution Pokémon" before searching (the same
  result as choosing while looking at the deck).
- Briar: the extra Prize is taken when the Knocked Out Pokémon was damaged by an attack this turn while a Tera Pokémon is
  the player's Active Pokémon (the attacker is the Active Pokémon in every legal play).
- Festival Lead: the second attack must be the same attack (the text says "an attack it has twice").
