/** Special Condition ops. */
import { addCondition, removeCondition } from "../conditions";
import { attackEffectsPrevented } from "../damage";
import { DONE, resolveRef } from "../effects";
import type { OpHandlers } from "../opRegistry";

export const HANDLERS: OpHandlers = {
  condition(s, r, e) {
    for (const t of resolveRef(s, r, e.target)) {
      if (attackEffectsPrevented(s, r, t)) continue;
      // "Put 8 damage counters instead of 3 on that Pokémon for this Special Condition."
      if (addCondition(s, t, e.cond, e.poison) && e.cond === "confused" && e.confusion)
        s.pokemon[t]!.cond.confusion = e.confusion;
    }
    return DONE;
  },
  cure(s, r, e) {
    for (const t of resolveRef(s, r, e.target))
      for (const c of e.conds ?? (["asleep", "confused", "paralyzed", "poisoned", "burned"] as const)) removeCondition(s, t, c);
    return DONE;
  },
};
