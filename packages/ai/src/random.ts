/** The random AI (fuzz): any legal decision, attacks and actions favored over ending the turn. */
import type { Agent, Decision } from "@pocketmate/engine";
import { mainDecisions, randomAnswer, randomSetup } from "./options";
import { mulberry32, pickOne } from "./rng";

export function randomAgent(seed: number): Agent {
  const rng = mulberry32(seed);
  return (s, p) => {
    const pending = s.pending;
    if (!pending) throw new Error("nothing to decide");
    if (pending.kind === "setup") return randomSetup(s, p, rng);
    if (pending.kind === "choice") return { type: "choose", values: randomAnswer(pending.request, rng) };
    const all = mainDecisions(s, p);
    const attacks = all.filter((d) => d.type === "attack");
    const others = all.filter((d) => d.type !== "attack" && d.type !== "endTurn");
    // Attack about half the time it can, so that games end by Knock Outs as well as by decking out.
    const r = rng();
    let d: Decision | undefined;
    if (attacks.length && r < 0.5) d = pickOne(rng, attacks);
    else if (others.length && rng() < 0.85) d = pickOne(rng, others);
    else if (attacks.length) d = pickOne(rng, attacks);
    return d ?? { type: "endTurn" };
  };
}
