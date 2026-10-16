# Meta decks (PLAN-A P6)

Eight Standard archetypes (Limitless TCG, format TEF–30C, lists of the best recent placings, imported on 2026-10-16
with `npx tsx tools/meta-decks.ts <archetype id>:<name>…` into `docs/meta/2026-10-16/`), shipped as precons
(`packages/cards/decks/meta-*.json`):

| Precon | Archetype | Source |
|---|---|---|
| `meta-dragapult` | Dragapult ex | Regional Frankfurt 2026-09-26 |
| `meta-slowking` | Slowking (Seek Inspiration) | Regional Louisville 2026-10-10 |
| `meta-basic-box` | Basic Box (Mega Kangaskhan ex) | Regional Louisville 2026-10-10 |
| `meta-ns-zoroark` | N's Zoroark ex | Regional Louisville 2026-10-10 |
| `meta-alakazam` | Alakazam / Dudunsparce | Regional Louisville 2026-10-10 |
| `meta-festival-lead` | Festival Lead (Dipplin, Thwackey) | Regional Louisville 2026-10-10 |
| `meta-mega-lopunny` | Mega Lopunny ex / Dusknoir | Regional Louisville 2026-10-10 |
| `meta-hydrapple` | Hydrapple ex / Meganium | Regional Louisville 2026-10-10 |

## Mechanics added (rules 2)

- Copied attacks (`useAttackOf`): Night Joker (N's Zoroark ex), Seek Inspiration (Slowking), Memory Helix (Mew ex,
  `borrowAttacks`); an attack that copies is never offered to a copy.
- Attacking twice (`attackTwice`, Festival Lead): after the first attack, only the same attack or the end of the turn.
- Energy provision (`energyAs`, Meganium's Wild Growth); "for each Energy" counts Energy provided, "Energy card" counts
  cards.
- Weakness changes (`weakness`, Lillie's Clefairy ex), attack costs (`attackCostIs`, Kyurem), ACE SPEC locks
  (`cantPlay` with tags, Genesect), same-turn evolution (`evolveSameTurn`, Forest of Vitality), Prize modifiers by attack
  (Briar), damage counter prevention on the Bench (`prevent` `counters`, Battle Cage), self Knock Out (`knockOut`,
  Cursed Blast; `selfKO` Abilities turned off by Psyduck's Damp), Stadium triggers on every Bench (`benched`, Risky
  Ruins), "moved to the Active Spot this turn" (`didThisTurn`), Boomerang Energy (`returnAfterAttack`), Rare Candy
  (`evolveFromHand`), Iron Leaves ex (`gatherEnergy`), Crispin (sequential picks of different names), Ciphermaniac
  (`orderCards`).

## Compiler

- Abilities (`compile/abilities.ts`): activated (once per turn, by name, in the Active Spot, first turn, discard costs,
  "your turn ends"), triggered (benched, evolved, damaged in the Active Spot, Knocked Out, Checkup) and continuous.
- Special Energy (`compile/energies.ts`): what it provides, attach triggers, HP and prevention statics, Boomerang.
- Card descriptions: "X or Y", "in any combination of X and Y", "with N HP or less"; reminder texts stripped.

## Hand scripts

`packages/cards/src/scripts/meta.ts`: 50 cards (Supporters, Items, Tools, Stadiums, Pokémon) whose texts are unique.

## Tests

- `cards/test/meta.test.ts`: 20 card-text tests (Phantom Dive, Battle Cage, Cursed Blast and Damp, Festival Lead,
  Wild Growth with Syrup Storm, Fairy Zone, Memory Helix, Night Joker, Seek Inspiration, Gale Thrust, Itchy Pollen,
  Bellowing Thunder, Rapid Vernier, Rare Candy, Boomerang Energy, Area Zero Underdepths, Risky Ruins, Telepathic Psychic
  Energy, Briar).
- Fuzz on the meta pool: 400 games with strict offers, 200 chaos, 100 with the AI levels; browser games with meta decks.
- Program review: `npx tsx tools/card-program.ts --deck <id>` prints each card's compiled program next to its text;
  every meta card was reviewed (fixes: Hilda's two searches, Energy counted in units, "can't use attacks").

## Second wave (PLAN-B B1, 2026-10-16)

Eight more archetypes from Limitless (16 meta precons in all): Crustle (Mysterious Rock Inn), Mega Excadrill ex,
Dhelmise (Hide 'n' Sneak), Mega Lucario ex (Lucario Hariyama, Solrock/Lunatone), Team Rocket's Honchkrow, Mega
Sharpedo ex (Toxtricity), Cynthia's Garchomp ex, Ogerpon Meganium. Lists in `docs/meta/2026-10-16/`.

- **Templates** (shared, 41 more cards): "isn't affected by Weakness" / "…by Resistance" alone; "at least N extra Energy
  (in addition to this attack's cost)"; "you may draw cards until you have N"; "a card that evolves from this Pokémon"
  from the deck; "you may search your deck for a card"; "look at the top N cards… reveal a Supporter"; "shuffle up to N
  … from your discard pile into your deck"; "heal N from 1 of your Pokémon, and it recovers"; Abilities Hide 'n' Sneak,
  "prevent all damage … by attacks from your opponent's X", "attacks used by your X do N more damage"; a Trainer's
  Pokémon ("Cynthia's Pokémon") in filters.
- **Engine**: `turnLog` amounts filtered by card ("a Supporter that has Team Rocket in its name"); `maxRemainingHp` and
  card `abilityNamed` filters; Energy counted by name; `firstTurnOk` Supporters; `noWeakness` / `noResistance`;
  `lockAttack` (choose one of the opponent's attacks it can't use); Energy `providesIf` (Ignition Energy); once-per-game
  Prize rules (Legacy Energy); a trigger's own card (`thisCard`: Ignition Energy discards itself). Stadiums are always
  playable (their condition is their action's).
- **Scripts** (`scripts/meta2.ts`, 34 cards). Scripts for names shared by several definitions are keyed by print
  (`Name@print`, guarded by a test): four earlier scripts (Alakazam, Slowking, Metagross, Zeraora) were also applied to
  same-name cards of other sets; those fell back to unimplemented and come back in their set's lot.
