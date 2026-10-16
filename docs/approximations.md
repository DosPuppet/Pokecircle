# Known approximations

Every approximation of the official rules or of a card's text is listed here when introduced and removed when lifted.

## General

- R-SETUP-7: the extra mulligan draws happen before placement (equivalent distribution, see `docs/rules.md`).

- Safety caps (`engine/src/limits.ts`): a game without a decision for 100,000 flow steps, 50 mulligan rounds, 2,000
  automatic decisions in a turn or 400 turns ends in a draw; "flip until tails" stops at 100 heads.
- Prize cards are taken from the first slots: they are unknown to their owner, so the choice does not matter. Cards
  that let a player look at their Prizes would make it matter (none implemented yet).
- R-KO-4: when both players must promote, the player whose turn it is chooses first, and the choice is shown at once.

- Copying attacks (`useAttackOf`: N's Zoroark ex's Night Joker, Slowking's Seek Inspiration, Mew ex): an attack that
  itself copies attacks is not offered, so copies never chain (a Night Joker copying another Night Joker would loop).

## Cards

- Brock's Scouting: the player chooses "up to 2 Basic Pokémon" or "1 Evolution Pokémon" before searching (the same
  result as choosing while looking at the deck).
- Briar: the extra Prize is taken when the Knocked Out Pokémon was damaged by an attack this turn while a Tera Pokémon is
  the player's Active Pokémon (the attacker is the Active Pokémon in every legal play).
- Festival Lead: the second attack must be the same attack (the text says "an attack it has twice").
- Team Rocket's Energy is never attached to a Pokémon other than a Team Rocket's Pokémon (attaching is refused), so its
  "if attached to anything other than a Team Rocket's Pokémon, discard this card" is not checked afterwards (PLAN-B B1).
- Metang's Metal Maker and other "shuffle the other cards and put them on the bottom of your deck": the cards go to the
  bottom in their order (unknown to both players either way).
- Type-based riders ("The {M} Pokémon this card is attached to…", Special Energy) and Pokémon filters read the printed
  type: a type added by an effect (Scovillain ex's Double Type, Iron Treads' Dual Core) does not count for them; it does
  count for Weakness and Resistance.
- Tremendous Bomb: "isn't a Mega Evolution Pokémon ex" is read when the trigger resolves; if the holder was Knocked
  Out by that damage, it counts as not a Mega Evolution Pokémon ex.
- "N or less Energy attached" (Bastiodon) counts Energy cards, not the Energy they provide.
- Tool Scrapper: a Pokémon is chosen for each Tool; a Pokémon with 2 Tools loses both.
- Adversity Policy, Chesnaught's Needly Armor: what the holder is (its Weakness, its Energy) is read when the trigger
  resolves; if it was Knocked Out by that damage, Adversity Policy does nothing and Needly Armor counts no Energy.
- Great Haul Net: "Choose 1 or both" is a choice between the first, the second or both effects.
- Prize rules limited to the attacker (`by`: Mega Gengar ex, Anthea & Concordia) read the opponent's Active Pokémon as
  the Knocking Out attacker.
- Rotom ex's Multi Adapter: when the Ability goes away, extra Tools are not discarded (only the second Tool's slot is
  no longer offered).
- Cinderace's Explosiveness: a hand with Cinderace and no Basic Pokémon is still a mulligan; the AI never uses it.
- Strange Timepiece: "any number of Evolution cards" is one, then a question for a second.
- Hydreigon ex's Greedy Eater: read as "while this Pokémon is your Active Pokémon, a Basic Pokémon Knocked Out by an
  attack of a Hydreigon ex gives 1 more Prize card".
- Team Rocket's Bother-Bot: the Prize card turned face up is revealed to both players, but it does not stay face up
  (Prize cards are hidden from both players).
- Forretress' Iron Shake-Up: "any amount" is up to 20 moves, one Energy at a time, until the player stops.
- Tyme: the opponent guesses "100 HP or more?" instead of a number.
- Sparkling Crystal: the Energy symbol removed is a {C} if the cost has one, else the last symbol.
- Palafin ex (Hero's Spirit) is never played from the hand; Palafin's Zero to Hero, which puts it into play, is not
  implemented yet.
- Miraidon's C.O.D.E.: Protect ends when no Miraidon is your Active Pokémon (any Miraidon keeps it).
- Kilowattrel's Storm Bolt and Scramble Switch move Energy one card at a time (a question each).
