/**
 * What clicking does on the game screen, from the view's legal options: a hand card's options, the targets that glow,
 * and the decision a click on a target makes.
 */
import type { ActionOption, Decision, GameView, ObjectId, PokemonId } from "@pocketmate/engine";
import type { Selection } from "../store";

export function myTurn(view: GameView | null): boolean {
  return !!view && view.pending?.kind === "main" && view.pending.player === view.me;
}

export function optionsForCard(view: GameView, card: ObjectId): ActionOption[] {
  return view.legal.filter((o) => "card" in o && o.card === card);
}

/** Pokémon a click on would act: the targets of the selected card, or the Bench while retreating. */
export function targetsOf(view: GameView, sel: Selection, retreating: boolean): Set<PokemonId> {
  const out = new Set<PokemonId>();
  if (retreating) {
    const r = view.legal.find((o) => o.type === "retreat");
    if (r?.type === "retreat") for (const id of r.to) out.add(id);
    return out;
  }
  if (sel?.kind !== "card") return out;
  for (const o of optionsForCard(view, sel.id)) if ("targets" in o && o.targets) for (const t of o.targets) out.add(t);
  return out;
}

/** The decision of a click on a target Pokémon, or null. */
export function decisionOnTarget(view: GameView, sel: Selection, retreating: boolean, target: PokemonId): Decision | null {
  if (retreating) {
    const r = view.legal.find((o) => o.type === "retreat");
    return r?.type === "retreat" && r.to.includes(target) ? { type: "retreat", to: target, discard: r.suggested } : null;
  }
  if (sel?.kind !== "card") return null;
  for (const o of optionsForCard(view, sel.id)) {
    if (!("targets" in o) || !o.targets?.includes(target)) continue;
    if (o.type === "evolve") return { type: "evolve", card: o.card, target };
    if (o.type === "attachEnergy") return { type: "attachEnergy", card: o.card, target };
    if (o.type === "playTrainer") return { type: "playTrainer", card: o.card, target };
  }
  return null;
}

/** A hand card's option that needs no target (play a Basic, an Item, a Supporter, a Stadium). */
export function directOption(view: GameView, card: ObjectId): Decision | null {
  for (const o of optionsForCard(view, card)) {
    if (o.type === "playBasic") return { type: "playBasic", card };
    if (o.type === "playTrainer" && !o.targets) return { type: "playTrainer", card };
  }
  return null;
}
