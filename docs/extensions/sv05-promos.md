# sv05, promos, 30th Celebration (PLAN-B B15)

The last Standard definitions: sv05 (Temporal Forces), the Scarlet & Violet promos (svp), the Mega Evolution promos (mep)
and 30th Celebration. With this lot every Standard definition is implemented (2,103 of 2,103). Hand scripts:
`packages/cards/src/scripts/sv05.ts`. Tests: `packages/cards/test/sv05-promos.test.ts`.

## Data fixes

- "Evolves from" missing in TCGdex (30th Celebration Evolution prints): taken from the other prints of the name when
  they agree, else from `data/evolves-from.json`; `catalog.test.ts` checks every Evolution Pokémon has one. Ten cards
  already implemented could not be evolved into before.
- The matcher reads spelled-out Energy symbols ("Basic Fire Energy", "ColorlessColorless less") as symbols, and
  "Place damage counters" without a number as "Put damage counters".

## Generic additions (rules 18)

- `weakness.mult` and an optional `weakness.type` (Illumise: Weakness ×3).
- `prevolutionAttacks`: evolved Pokémon use the attacks of the cards below them (Relicanth's Memory Dive).
- `noHeal` (Yveltal), checked by `healDamage`.
- `trainerFlip`: a coin flip to use a Trainer card from the hand, tails discards it (Seismitoad's Quaking Fist).
- Duration `whileActive`: until the bound Pokémon leaves the Active Spot (Gouging Fire ex's Blaze Blitz).
- `evolveFromHand.filter` (Salvatore: no Abilities; Pidove: Unfezant or Unfezant ex); card filter `retreat` (printed
  Retreat Cost, Heavy Baton).

## Hand scripts

sv05: Shiftry, Shaymin, Palafin, Raichu, Electivire, Vikavolt, Wugtrio ex, Mr. Mime, Bronzong, Ribombee, Iron Valiant,
Relicanth, Drilbur, Mudsdale, Sandy Shocks, Gengar ex, Sableye, Lickitung, Delcatty, Pidove, Minccino, Cinccino, Drampa,
Hand Trimmer, Heavy Baton, Reboot Pod, Salvatore. svp: Feraligatr, Miraidon, Iron Thorns, Gouging Fire ex, Picnicker,
Pecharunt, Pachirisu, Scrafty. mep: Drifloon, Weavile, Mega Charizard X ex, Celebratory Fanfare, Delphox, Miraidon,
Moltres, Articuno, Zapdos, Greninja ex. 30th: Ditto, Illumise, Vivillon, Moltres, Articuno, Palkia, Greninja ex,
Wishiwashi, Pikachu (4), Zapdos, Morpeko, Espeon, Unown, Gimmighoul, Seismitoad, Scraggy, Yveltal, Gholdengo, Eevee,
Snorlax, Igglybuff, Lugia, Maushold.

## Approximations

- Heavy Baton reads the printed Retreat Cost of the Knocked Out Pokémon.
- Drampa's Raging Cannon: with no Benched Pokémon, no bonus.
- Minccino's Cleaning Up: a Pokémon chosen loses all its Tools (as Tool Scrapper).
- Sableye's Damage Collection and Delcatty's Energy Blender: one counter or Energy at a time (up to 20), until the
  player stops.
- Iron Thorns' Destructo-Press: only the Future cards among the top 5 are revealed to both players.
- Seismitoad's Quaking Fist: a Supporter discarded by the coin still counts as the Supporter of the turn.
