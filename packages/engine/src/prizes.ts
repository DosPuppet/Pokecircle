/** Prize cards for a Knocked Out Pokémon (R-KO-2): 1, 2 for a Pokémon ex, 3 for a Mega Evolution Pokémon ex. */

import { topDef } from "./state";
import { rulesOn } from "./statics";
import type { CardDef, GameState, PokemonId } from "./types";

export function basePrizes(d: Pick<CardDef, "tags">): number {
  if (d.tags.includes("mega")) return 3;
  return d.tags.includes("ruleBox") ? 2 : 1;
}

export function prizesFor(s: GameState, id: PokemonId): number {
  let n = basePrizes(topDef(s, id));
  for (const st of rulesOn(s, "prizes", id)) n += st.rule.delta;
  return Math.max(0, n);
}
