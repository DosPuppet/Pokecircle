/**
 * The card compiler: English card text → effect DSL, at load time. A definition is `implemented` when every paragraph
 * (attack, Ability, Trainer or Energy text) is compiled or scripted; what is not is listed in `missing`.
 */
import type { AbilityDef, CardDef } from "@pocketmate/engine";
import { compileAttack } from "./attacks";
import { compileTrainer } from "./trainers";

export interface CompileReport {
  /** Templates used, per definition. */
  templates: Record<string, string[]>;
  /** Unmatched text, per definition. */
  unmatched: Record<string, string[]>;
}

function note(report: CompileReport | undefined, id: string, text: string): void {
  if (report) report.unmatched[id] = [...(report.unmatched[id] ?? []), text];
}

export function compileDef(def: CardDef, report?: CompileReport): CardDef {
  const missing: string[] = [];
  const used: string[] = [];
  const out: CardDef = { ...def };
  if (def.category === "pokemon") {
    out.attacks = (def.attacks ?? []).map((a) => {
      if (a.effects) return a;
      const c = compileAttack(a);
      if ("unmatched" in c) {
        missing.push(a.text ?? a.name);
        note(report, def.id, c.unmatched);
        return a;
      }
      used.push(...c.templates);
      return { ...a, effects: c.effects };
    });
    out.abilities = (def.abilities ?? []).map((ab): AbilityDef => {
      if (ab.activated || ab.statics || ab.triggers) return ab;
      missing.push(ab.text);
      note(report, def.id, ab.text);
      return ab;
    });
    if (!out.abilities.length) delete out.abilities;
  } else if (def.category === "trainer" && def.trainer) {
    if (!def.trainer.effects && !def.trainer.statics) {
      const c = compileTrainer(def.text.en.text, def.trainer.kind);
      if ("unmatched" in c) {
        missing.push(def.text.en.text ?? def.name);
        note(report, def.id, c.unmatched);
      } else {
        out.trainer = { ...def.trainer, ...c.trainer };
        used.push(...c.templates);
      }
    }
  } else if (def.category === "energy" && def.energy && !def.energy.basic) {
    if (!def.energy.provides.length) {
      missing.push(def.text.en.text ?? def.name);
      note(report, def.id, def.text.en.text ?? "");
    }
  }
  out.implemented = missing.length === 0;
  if (missing.length) out.missing = missing;
  else delete out.missing;
  if (report && used.length) report.templates[def.id] = used;
  return out;
}
