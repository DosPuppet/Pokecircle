/** The tutorial lessons' opponent (run by the game worker). */
import { type Agent, legalActions } from "@pocketmate/engine";

/** It attacks when it can (first attack offered), otherwise ends its turn; questions: the suggested answer. */
export const lessonAgent: Agent = (s, p) => {
  const pending = s.pending;
  if (pending?.kind === "choice") return { type: "choose", values: pending.request.suggested };
  const attack = legalActions(s, p).find((o) => o.type === "attack");
  if (attack?.type === "attack") return { type: "attack", index: attack.index };
  return { type: "endTurn" };
};
