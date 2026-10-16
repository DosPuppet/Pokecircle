/** Special Energy texts: what the card provides, and its continuous or triggered effects. */
import type { Condition, Effect, EnergyDef, PokemonScope, StaticRule, TriggerDef } from "@pokecircle/engine";
import { cond, ref, scope } from "@pokecircle/engine";
import { COMMON, type Ctx } from "./effects";
import { condPhrase, num, pokemonFilter, typeSym } from "./phrases";
import { compileStatics } from "./statics";
import { matchAll, normalize, sentence } from "./templates";

const ctx: Ctx = { inAttack: false };

function effects(text: string): { effects: Effect[]; condition?: Condition } | null {
  const m = matchAll(sentence(text), COMMON, ctx);
  if ("unmatched" in m) return null;
  const conds = m.parts.map((p) => p.condition).filter((c): c is Condition => !!c);
  const out: { effects: Effect[]; condition?: Condition } = {
    effects: m.parts.flatMap((p) => [...(p.pre ?? []), ...(p.post ?? [])]),
  };
  if (conds.length) out.condition = conds.length === 1 ? (conds[0] as Condition) : cond.and(...conds);
  return out;
}

export function compileEnergy(text: string | undefined): Partial<EnergyDef> | { unmatched: string } {
  let t = normalize(text ?? "");
  const out: Partial<EnergyDef> = {};
  const statics: StaticRule[] = [];
  const triggers: TriggerDef[] = [];
  const provides = /^As long as this card is attached to a Pokémon, it provides (\{[A-Z]\}) Energy\.\s*/.exec(t);
  if (!provides) return { unmatched: t };
  const type = typeSym(provides[1]);
  if (!type) return { unmatched: t };
  out.provides = [[type]];
  t = t.slice(provides[0].length);
  while (t) {
    let m =
      /^When you attach this card from your hand to (?:a|an) (?:(\{[A-Z]\}) )?Pokémon, (.+?)(?=$| As long as| The | Prevent | If this card)/.exec(
        t,
      );
    if (m) {
      const onType = m[1] ? typeSym(m[1]) : undefined;
      const e = effects(m[2] as string);
      if (!e || onType === null) return { unmatched: t };
      const conds = [onType ? cond.matches(ref.self, { types: [onType] }) : undefined, e.condition].filter(
        (c): c is Condition => !!c,
      );
      const trig: TriggerDef = { on: "attached", effects: e.effects };
      if (conds.length) trig.condition = conds.length === 1 ? (conds[0] as Condition) : cond.and(...conds);
      triggers.push(trig);
      t = t.slice(m[0].length).trim();
      continue;
    }
    m = /^The (\{[A-Z]\}) Pokémon this card is attached to gets \+(\d+) HP\.\s*/.exec(t);
    if (m) {
      const ty = typeSym(m[1]);
      if (!ty) return { unmatched: t };
      statics.push({ s: "hp", scope: { ...scope.self(), filter: { types: [ty] } }, add: Number(m[2]) });
      t = t.slice(m[0].length).trim();
      continue;
    }
    m = /^Prevent all effects of attacks used by your opponent's Pokémon done to the Pokémon this card is attached to\.\s*/.exec(
      t,
    );
    if (m) {
      statics.push({ s: "prevent", scope: scope.self(), what: "effects" });
      t = t.slice(m[0].length).trim();
      continue;
    }
    // "If this card is attached to a Basic Pokémon, this card provides every type of Energy but provides only 1 Energy at
    // a time." (Reversal Energy: "If you have more Prize cards remaining than your opponent, and if …")
    m =
      /^If (?:(.+?), and if )?this card is attached to an? (.+?), this card provides every type of Energy but provides only (\w+) Energy at a time\.\s*/.exec(
        t,
      );
    if (m) {
      const f = pokemonFilter(m[2] as string);
      const n = num(m[3]);
      const k = m[1] ? condPhrase(m[1], false) : undefined;
      if (!f || !n || k === null) return { unmatched: t };
      out.providesIf = { filter: f, provides: Array.from({ length: n }, () => ["*"]), ...(k ? { cond: k } : {}) };
      t = t.slice(m[0].length).trim();
      continue;
    }
    m =
      /^If this card is discarded by an effect of an attack used by the Pokémon this card is attached to, attach this card from your discard pile to that Pokémon after attacking\.\s*/.exec(
        t,
      );
    if (m) {
      out.returnAfterAttack = true;
      t = t.slice(m[0].length).trim();
      continue;
    }
    // A continuous rider: "The {M} Pokémon this card is attached to has no Retreat Cost." (only while it is that type).
    const typed = /the (\{[A-Z]\}) Pokémon this card is attached to/.exec(t);
    const holderType = typed ? typeSym(typed[1]) : undefined;
    const rules = compileStatics(
      t.replace(/the \{[A-Z]\} Pokémon this card is attached to/g, "the Pokémon this card is attached to"),
      "tool",
    );
    if (rules && holderType !== null) {
      for (const r of rules) {
        const held = r as { scope?: PokemonScope };
        if (holderType && held.scope?.self) held.scope = { ...held.scope, filter: { ...held.scope.filter, types: [holderType] } };
      }
      statics.push(...rules);
      t = "";
      continue;
    }
    return { unmatched: t };
  }
  if (statics.length) out.statics = statics;
  if (triggers.length) out.triggers = triggers;
  return out;
}
