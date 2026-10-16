/** Concrete decisions from the options of `legalActions` (one per target), and valid answers to questions. */
import type { ActionOption, ChoiceRequest, ChoiceValue, Decision, GameState, PlayerId } from "@pocketmate/engine";
import { legalActions } from "@pocketmate/engine";
import { type Rng, shuffled } from "./rng";

/** Every main-phase decision, with each target (retreat: each new Active, with the suggested Energy). */
export function expandOptions(options: ActionOption[]): Decision[] {
  const out: Decision[] = [];
  for (const o of options) {
    switch (o.type) {
      case "playBasic":
        out.push({ type: "playBasic", card: o.card });
        break;
      case "evolve":
        for (const target of o.targets) out.push({ type: "evolve", card: o.card, target });
        break;
      case "attachEnergy":
        for (const target of o.targets) out.push({ type: "attachEnergy", card: o.card, target });
        break;
      case "playTrainer":
        if (o.targets) for (const target of o.targets) out.push({ type: "playTrainer", card: o.card, target });
        else out.push({ type: "playTrainer", card: o.card });
        break;
      case "useAbility":
        out.push({ type: "useAbility", pokemon: o.pokemon, ability: o.ability });
        break;
      case "stadiumAction":
        out.push({ type: "stadiumAction" });
        break;
      case "retreat":
        for (const to of o.to) out.push({ type: "retreat", to, discard: o.suggested });
        break;
      case "attack":
        out.push(o.source ? { type: "attack", index: o.index, source: o.source } : { type: "attack", index: o.index });
        break;
      case "endTurn":
        out.push({ type: "endTurn" });
        break;
    }
  }
  return out;
}

export function mainDecisions(s: GameState, p: PlayerId): Decision[] {
  return expandOptions(legalActions(s, p));
}

/** A random valid answer to a question. */
export function randomAnswer(req: ChoiceRequest, rng: Rng): ChoiceValue[] {
  switch (req.type) {
    case "pick": {
      const n = req.min + Math.floor(rng() * (req.max - req.min + 1));
      return shuffled(rng, req.options).slice(0, n);
    }
    case "number":
      return [req.min + Math.floor(rng() * (req.max - req.min + 1))];
    case "yesNo":
      return [rng() < 0.5 ? 0 : 1];
    case "order":
      return shuffled(rng, req.items);
    case "divide": {
      const out = req.among.map(() => req.minEach ?? 0);
      let left = req.total - out.reduce((a, b) => a + b, 0);
      while (left > 0) {
        const i = Math.floor(rng() * out.length);
        out[i] = (out[i] ?? 0) + 1;
        left--;
      }
      return out;
    }
  }
}

/** A random setup: a random Basic as Active, some others on the Bench. */
export function randomSetup(s: GameState, p: PlayerId, rng: Rng): Decision {
  const hand = s.players[p]?.hand ?? [];
  const basics = shuffled(
    rng,
    hand.filter((c) => {
      const d = s.defs[s.objects[c]?.defId ?? ""];
      return d?.category === "pokemon" && d.stage === "basic";
    }),
  );
  const bench = basics.slice(1, 1 + Math.floor(rng() * Math.min(5, basics.length)));
  return { type: "setup", active: basics[0] as string, bench };
}
