/**
 * Hand scripts: card behavior the compiler cannot read, keyed by English name (or `Name@<print id>` when two
 * definitions share a name). A script replaces whole parts of the definition (an attack's effects, an Ability, a
 * Trainer card's effects); what it does not set is still compiled.
 */
import type { CardDef } from "@pokecircle/engine";

export type CardScript = (def: CardDef) => Partial<CardDef>;

const SCRIPTS: Record<string, CardScript> = {};

/** Adds a set of scripts (one module per set or deck). */
export function registerScripts(scripts: Record<string, CardScript>): void {
  for (const [k, v] of Object.entries(scripts)) {
    if (SCRIPTS[k]) throw new Error(`script ${k} registered twice`);
    SCRIPTS[k] = v;
  }
}

export function applyScript(def: CardDef): CardDef {
  const script = SCRIPTS[`${def.name}@${def.print}`] ?? SCRIPTS[def.name];
  return script ? { ...def, ...script(def) } : def;
}

export function scriptNames(): string[] {
  return Object.keys(SCRIPTS);
}
