# Rules reference (Pokémon TCG, Standard 2026-27)

The engine implements the official rules of the Pokémon Trading Card Game, as printed in the current rulebook (Scarlet &
Violet and Mega Evolution series) and the Play! Pokémon Tournament Rules Handbook. There is no numbered comprehensive
rules document, so this file gives each rule an id (`R-SETUP-3`); tests cite these ids the way Planecircle cites the MTG
Comprehensive Rules. French terms: `docs/glossary.md`.

Status markers: **verify** = an interpretation to confirm against the official texts; **approx** = a known
approximation, also listed in `docs/approximations.md`.

## Format (R-FORMAT)

- R-FORMAT-1: Standard 2026-27 accepts cards with regulation mark **H, I, J** or later, and Basic Energy cards whatever
  their mark. In digital play, a deck uses definitions; a definition is legal if one of its prints has a legal mark,
  and Standard decks show only legal prints.
- R-FORMAT-2: a deck has exactly **60 cards**.
- R-FORMAT-3: at most **4 cards with the same name**, except Basic Energy. Different versions of a card with the same
  name count together (4 "Pikachu" in all).
- R-FORMAT-4: at least **1 Basic Pokémon**.
- R-FORMAT-5: at most **1 ACE SPEC** card (French: HIGH-TECH).
- R-FORMAT-6: the Unlimited format keeps R-FORMAT-2 to 5 and accepts any implemented card.

## Setup (R-SETUP)

- R-SETUP-1: a coin flip; the winner chooses to go first or second. In a best-of-three, the loser of the previous game
  chooses.
- R-SETUP-2: each player shuffles their deck and draws 7 cards.
- R-SETUP-3 (mulligan): a player without a Basic Pokémon reveals their hand, shuffles it into their deck and draws 7
  again, until they have one. Mulligans taken at the same time by both players do not count; for each extra mulligan
  of the opponent, a player may draw 1 extra card (0 to n, their choice).
- R-SETUP-4: each player puts a Basic Pokémon face down as their Active Pokémon, and up to 5 Basic Pokémon face down
  on their Bench.
- R-SETUP-5: each player puts the top 6 cards of their deck face down as their Prize cards. Nobody knows them, their
  owner included.
- R-SETUP-6: both players reveal their Pokémon; the first player starts.
- R-SETUP-7 (approx, equivalent): the extra mulligan draws (R-SETUP-3) happen before placement (R-SETUP-4) rather than
  after the Prizes. The deck is shuffled and unknown, so the cards set aside as Prizes have the same distribution either
  way, and Basic Pokémon drawn this way can still be benched.

## Turn (R-TURN)

- R-TURN-1: the turn starts by drawing a card. A player who cannot draw at the start of their turn loses (R-WIN-3).
- R-TURN-2: then, in any order and as often as allowed:
  - R-TURN-2a: put Basic Pokémon from the hand onto the Bench (maximum 5 Benched Pokémon, R-BENCH);
  - R-TURN-2b: evolve Pokémon (R-EVOLVE);
  - R-TURN-2c: attach **1 Energy card** from the hand to one of their Pokémon, once per turn;
  - R-TURN-2d: play Trainer cards: any number of Items; **1 Supporter** per turn; **1 Stadium** per turn; Pokémon
    Tools (R-TOOL);
  - R-TURN-2e: retreat the Active Pokémon **once per turn** (R-RETREAT);
  - R-TURN-2f: use Abilities, as their text allows.
- R-TURN-3: attack (R-ATTACK); the attack ends the turn. The player may also end the turn without attacking.
- R-TURN-4 (first turn): the player who goes first cannot attack and cannot play a Supporter during their first turn.
- R-TURN-5: after the turn comes the Pokémon Checkup (R-CHECKUP), then the opponent's turn.

## Bench (R-BENCH)

- R-BENCH-1: at most 5 Benched Pokémon; effects may change the limit (a Stadium allowing 8).
- R-BENCH-2: if the limit drops below the number of Benched Pokémon, their owner discards Benched Pokémon (with
  everything attached) until they have the limit.

## Evolution (R-EVOLVE)

- R-EVOLVE-1: an Evolution card from the hand is placed on the Pokémon in play it evolves from (by name).
- R-EVOLVE-2: no player may evolve during their own first turn, nor evolve a Pokémon put into play this turn, nor
  evolve the same Pokémon twice in a turn (Rare Candy and other effects say otherwise).
- R-EVOLVE-3: the evolved Pokémon keeps its damage, attached cards and the turn it came into play; it loses Special
  Conditions and the effects of attacks applied to it.
- R-EVOLVE-4: Mega Evolution Pokémon ex (Mega Evolution series) evolve like other Pokémon; evolving into one does not
  end the turn.

## Retreat (R-RETREAT)

- R-RETREAT-1: discard Energy from the Active Pokémon equal to its Retreat Cost, then switch it with a Benched Pokémon.
- R-RETREAT-2: an Asleep or Paralyzed Pokémon cannot retreat.
- R-RETREAT-3: going to the Bench removes Special Conditions and the effects of attacks.
- R-RETREAT-4: switching by an effect (Switch) is not a retreat and does not count toward R-TURN-2e.

## Pokémon Tools (R-TOOL)

- R-TOOL-1: a Pokémon Tool is attached to one of the player's Pokémon; at most 1 Tool per Pokémon unless an effect says
  otherwise.
- R-TOOL-2: a Tool stays attached when the Pokémon evolves.

## Stadiums (R-STADIUM)

- R-STADIUM-1: one Stadium in play, shared by both players. Playing a new one discards the previous one (to its owner's
  discard pile).
- R-STADIUM-2: a Stadium with the same name as the one in play cannot be played.

## Attack (R-ATTACK)

- R-ATTACK-1: the Active Pokémon must have the Energy its attack costs attached (Colorless is paid by any type).
- R-ATTACK-2: a Confused Pokémon flips a coin when it attacks; on tails, its owner puts 3 damage counters on it and the
  attack does nothing (the turn ends).
- R-ATTACK-3: the attack's choices are made, then its damage and effects are done in the order of its text; "Defending
  Pokémon" is the opponent's Active Pokémon when the attack is used.
- R-ATTACK-4 (damage order): base damage (with its `+`, `×` or `-` text), then effects on the attacking Pokémon, then
  **Weakness** (×2), then **Resistance** (−30), then effects on the Defending Pokémon. Weakness and Resistance apply to
  the Active Pokémon only. If the damage is 0 or less before Weakness, the attack does no damage.
- R-ATTACK-5: damage to Benched Pokémon does not apply Weakness or Resistance.
- R-ATTACK-6: "put N damage counters" is not damage: Weakness, Resistance and damage modifiers do not apply, but
  effects that prevent the effects of attacks do.
- R-ATTACK-7: Knock Outs are checked once the attack is complete (R-KO).

## Special Conditions and Pokémon Checkup (R-COND, R-CHECKUP)

- R-COND-1: Asleep, Confused and Paralyzed rotate the card: a new one replaces the previous one. Burned and Poisoned use
  markers and can be combined with the others.
- R-COND-2: an Asleep or Paralyzed Pokémon cannot attack or retreat.
- R-COND-3: Special Conditions are removed when the Pokémon goes to the Bench or evolves.
- R-CHECKUP-1 (order): Poisoned (1 damage counter, or as many as the effect says), then Burned (2 damage counters, then
  its owner flips a coin: heads, it is no longer Burned), then Asleep (a flip: heads, it wakes up), then Paralyzed (it
  recovers if its owner has just finished the turn after it was Paralyzed).
- R-CHECKUP-2: then the effects that happen during the Pokémon Checkup, then Knock Outs.

## Knock Out and Prizes (R-KO)

- R-KO-1: a Pokémon with damage greater than or equal to its HP is Knocked Out; it and all attached cards go to the
  discard pile.
- R-KO-2: the opponent of its owner takes 1 Prize card; **2 for a Pokémon ex**, **3 for a Mega Evolution Pokémon ex**,
  with effects that change it.
- R-KO-3: Pokémon Knocked Out at the same time are handled together; each player takes their Prizes.
- R-KO-4: a player without an Active Pokémon chooses a new one from their Bench. When both must, the player whose turn
  it is chooses first (verify).

## Winning (R-WIN)

- R-WIN-1: taking your last Prize card.
- R-WIN-2: the opponent has no Pokémon in play.
- R-WIN-3: the opponent cannot draw at the start of their turn.
- R-WIN-4: if both players win at the same time, the player who meets more win conditions wins; otherwise
  Sudden Death: a new game with 1 Prize card each, set up as usual (coin flip, mulligans; Play! Pokémon Tournament
  Rules). It may happen again.

## Pokémon with a Rule Box (R-RULEBOX)

- R-RULEBOX-1: Pokémon ex (R-KO-2: 2 Prizes), Mega Evolution Pokémon ex (3 Prizes).
- R-RULEBOX-2 (Tera): while it is on the Bench, prevent all damage done to it by attacks (both players').
- R-RULEBOX-3: effects that refer to "Pokémon with a Rule Box" include them; ACE SPEC Trainers are not Pokémon.

## Card text conventions (R-TEXT)

- R-TEXT-1: "once during your turn" is per Pokémon in play, unless the text says otherwise.
- R-TEXT-2: "search your deck" lets the player look at the whole deck; they may fail to find cards ("up to"), then they
  shuffle the deck.
- R-TEXT-3: a Trainer card cannot be played if its effect cannot be done at all (searching an empty deck, switching
  without a Benched Pokémon); a card's printed condition ("You can use this card only if…") is checked before it is
  played.
- R-TEXT-4: the effects of attacks applied to a Pokémon end when it leaves the Active Spot or evolves.
- R-TEXT-5: coin flips are random and shown to both players.
