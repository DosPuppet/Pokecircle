/**
 * Template matching: a text is a sequence of sentences; each template matches one or more whole sentences at the start
 * of what is left and builds effects. A text compiles only if templates consume all of it.
 *
 * Patterns are written with placeholders: `{n}` a number, `{w}` a number word, `{t}` a type symbol, `{x}` any phrase
 * (checked by the template's builder, which returns null when the phrase is not understood), `{s}` an optional plural
 * "s", `{it}` "it" or "them".
 */
import type { Condition, Effect, EType } from "@pokecircle/engine";

export interface Built {
  /** Before the attack's damage (damage modifiers, coin flips that decide them, "does nothing"). */
  pre?: Effect[];
  /** After the attack's damage (or the effect of an Ability or a Trainer card). */
  post?: Effect[];
  /** "You can use this card only if…", or what makes the effect possible (R-TEXT-3). Ignored for attacks. */
  condition?: Condition;
  /** "You can use this attack only if…": an attack can be used even when its effect has nothing to do. */
  useCondition?: Condition;
  /** The attack's own damage goes to another Pokémon ("…does 50 damage to the new Active Pokémon"). */
  mainOptions?: Extract<Effect, { op: "mainDamage" }>;
  /** No main damage ("This attack does 30 damage to 1 of your opponent's Pokémon" replaces it). */
  noMain?: boolean;
  /** "If you go first, you can use this attack during your first turn." */
  firstTurn?: boolean;
  /** "If this Pokémon has any damage counters on it, this attack can be used for {D}." */
  altCost?: { cost: EType[]; cond: Condition };
}

export interface Template<C> {
  id: string;
  re: RegExp;
  build: (g: string[], ctx: C) => Built | null;
}

const PLACEHOLDERS: Record<string, string> = {
  "{n}": "(\\d+)",
  "{w}": "(a|an|one|two|three|four|five|six|seven|eight|nine|ten|\\d+)",
  "{t}": "(\\{[GRWLPFDMNC]\\})",
  "{x}": "(.+?)",
  "{X}": "(.+)",
  /** An optional plural "s". */
  "{s}": "s?",
  "{it}": "(?:it|them)",
};

/** A template from a pattern with placeholders; it must match whole sentences. */
export function tpl<C>(id: string, pattern: string, build: (g: string[], ctx: C) => Built | null): Template<C> {
  let src = "";
  for (let i = 0; i < pattern.length; ) {
    const ph = Object.keys(PLACEHOLDERS).find((k) => pattern.startsWith(k, i));
    if (ph) {
      src += PLACEHOLDERS[ph];
      i += ph.length;
      continue;
    }
    const ch = pattern[i] as string;
    src += /[.*+?^${}()|[\]\\]/.test(ch) ? `\\${ch}` : ch;
    i++;
  }
  return { id, re: new RegExp(`^${src}(?:\\s+|$)`), build };
}

const ENERGY_SPAN: Record<string, string> = {
  Grass: "G",
  Fire: "R",
  Water: "W",
  Lightning: "L",
  Psychic: "P",
  Fighting: "F",
  Darkness: "D",
  Metal: "M",
  Dragon: "N",
  Colorless: "C",
};

/** Text normalized for matching: one space, straight quotes, no HTML. */
export function normalize(text: string): string {
  return (
    text
      // Reminder texts that add nothing to the rule.
      .replace(/\s*\(Pokémon ex, Pokémon V, etc\. have Rule Boxes\.?\)/g, "")
      .replace(/\s*\(Existing effects are not removed\. Damage is not an effect\.\)/g, "")
      // Weakness and Resistance never apply to Benched Pokémon (R-ATTACK-5): the reminder adds nothing.
      .replace(/\s*\(Don't apply Weakness and Resistance for Benched Pokémon\.\)/g, "")
      // "(This includes new Pokémon that come into play.)": a timed effect on a scope, not on given Pokémon (the default).
      .replace(/\s*\(This includes new Pokémon that come into play\.\)/g, "")
      // Wording variants.
      .replace(/ before this attack does damage,/g, ",")
      .replace(/^If either of them is heads, /, "If any of them are heads, ")
      .replace(/(\. )If either of them is heads, /g, "$1If any of them are heads, ")
      .replace(
        /\b([Pp])lace ((?:\w+|any number of) )?damage counter/g,
        (_, p: string, n: string | undefined) => `${p === "P" ? "Put" : "put"} ${n ?? ""}damage counter`,
      )
      .replace(/^(Look at the (?:top|bottom) \w+ cards of your deck), and you may /, "$1. You may ")
      .replace(/(\. |^)(Look at the (?:top|bottom) \w+ cards of your deck), and you may /g, "$1$2. You may ")
      // TCGdex leaves some HTML: emphasis tags, Energy symbols as spans.
      .replace(/<span class="energy-symbol (\w+)"[^>]*>\w+<\/span>/g, (_, t: string) => `{${ENERGY_SPAN[t] ?? "C"}}`)
      .replace(/<\/?em>/g, "")
      // Some prints (30th Celebration) spell the Energy symbols out: "Basic Fire Energy", "ColorlessColorless less".
      .replace(
        /\b(Grass|Fire|Water|Lightning|Psychic|Fighting|Darkness|Metal|Dragon|Colorless)(?= Energy\b)/g,
        (t: string) => `{${ENERGY_SPAN[t]}}`,
      )
      .replace(/\b((?:Colorless){1,4})(?= (?:less|more)\b)/g, (run: string) => "{C}".repeat(run.length / 9))
      .replace(/[‘’]/g, "'")
      .replace(/[“”]/g, '"')
      .replace(/[–—]/g, "-")
      .replace(/\bPokemon\b/g, "Pokémon")
      .replace(/\s+/g, " ")
      .trim()
  );
}

export interface Match {
  parts: Built[];
  ids: string[];
}

/** Matches a whole text, or returns the part that no template matched. */
export function matchAll<C>(text: string, templates: Template<C>[], ctx: C): Match | { unmatched: string } {
  let rest = normalize(text);
  const parts: Built[] = [];
  const ids: string[] = [];
  while (rest) {
    let found = false;
    for (const t of templates) {
      const m = t.re.exec(rest);
      if (!m) continue;
      const built = t.build(m.slice(1), ctx);
      if (!built) continue;
      parts.push(built);
      ids.push(t.id);
      rest = rest.slice(m[0].length).trim();
      found = true;
      break;
    }
    if (!found) return { unmatched: rest };
  }
  return { parts, ids };
}

/** "If heads, X" style clauses: the inner clause as a sentence (capitalized, with its period). */
export function sentence(clause: string): string {
  const c = clause.trim();
  return `${c.charAt(0).toUpperCase()}${c.slice(1)}${/[.)]$/.test(c) ? "" : "."}`;
}
