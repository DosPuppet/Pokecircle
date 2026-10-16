/** Special Condition ops. */
import { addCondition, removeCondition } from "../conditions";
import { attackEffectsPrevented } from "../damage";
import { DONE, resolveRef } from "../effects";
import type { OpHandlers } from "../opRegistry";

export const HANDLERS: OpHandlers = {
  condition(s, r, e) {
    for (const t of resolveRef(s, r, e.target)) {
      if (attackEffectsPrevented(s, r, t)) continue;
      addCondition(s, t, e.cond, e.poison);
    }
    return DONE;
  },
  cure(s, r, e) {
    for (const t of resolveRef(s, r, e.target))
      for (const c of e.conds ?? (["asleep", "confused", "paralyzed", "poisoned", "burned"] as const)) removeCondition(s, t, c);
    return DONE;
  },
};
