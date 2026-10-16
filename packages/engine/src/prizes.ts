/** Prize cards for a Knocked Out Pokémon (R-KO-2): 1, 2 for a Pokémon ex, 3 for a Mega Evolution Pokémon ex. */

import { topDef } from "./state";
import { rulesOn } from "./statics";
import type { CardDef, GameState, PokemonId } from "./types";

export function basePrizes(d: Pick<CardDef, "tags">): number {
  if (d.tags.includes("mega")) return 3;
  return d.tags.includes("ruleBox") ? 2 : 1;
}

/**
 * `byAttack`: Knocked Out by damage from an attack (rules that only count then). `apply`: the Prize cards are really
 * taken, a once-per-game rule is then used up (`usedOnce`).
 */
export function prizesFor(s: GameState, id: PokemonId, byAttack = false, apply = false): number {
  let n = basePrizes(topDef(s, id));
  for (const st of rulesOn(s, "prizes", id)) {
    if (st.rule.byAttack && !byAttack) continue;
    if (st.rule.oncePerGame) {
      const key = `${st.owner}:prizes:${st.defId}`;
      if (s.usedOnce.includes(key)) continue;
      if (apply) s.usedOnce.push(key);
    }
    n += st.rule.delta;
  }
  return Math.max(0, n);
}
