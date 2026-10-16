/**
 * Continuous effects as sentences: one grammar for the static texts of Abilities, Pokémon Tools and Stadiums
 * ("As long as this Pokémon is in the Active Spot, your opponent's Active Pokémon has no Abilities."). A sentence is
 * an optional condition ("As long as …, ", "If …, ") and a predicate on a subject (a scope). Every sentence must be
 * understood, or the text is left to the other templates.
 */
import type { Amount, Condition, PokemonFilter, PokemonScope, SpecialCondition, StaticRule } from "@pokecircle/engine";
import { amt, cond, scope } from "@pokecircle/engine";
import { condPhrase, eachPhrase, num, pokemonFilter, scopePhrase, status, typeSym } from "./phrases";
import { normalize, sentence } from "./templates";

export type StaticSource = "ability" | "tool" | "stadium";

const SELF = /^(?:this Pokémon|it|the Pokémon this card is attached to|that Pokémon)$/i;

/** The Pokémon a sentence is about. */
export function subject(p: string, src: StaticSource): PokemonScope | null {
  const t = p.trim().replace(/^(?:all|each) of /i, "");
  if (SELF.test(t)) return src === "stadium" ? null : scope.self();
  // "the Stage 2 Pokémon this card is attached to"
  let m = /^the (.+?) this card is attached to$/i.exec(t);
  if (m && src === "tool") {
    const f = filterOrName(m[1] as string);
    return f ? { ...scope.self(), filter: f } : null;
  }
  if (/^both Active Pokémon$/i.test(t)) return scope.of("both", "active");
  // "{M} Pokémon (both yours and your opponent's)", "Each Basic Pokémon in play (both yours and your opponent's)"
  m = /^(?:each |all )?(Benched |Active )?(.+?)(?: in play)? \(both yours and your opponent's\)$/i.exec(t);
  if (m) {
    const f = filterOrName(m[2] as string);
    if (!f) return null;
    const where = m[1] === "Benched " ? "bench" : m[1] === "Active " ? "active" : "any";
    return Object.keys(f).length ? scope.of("both", where, f) : scope.of("both", where);
  }
  m = /^(your opponent's|your) (Benched |Active )?(.+?)(?: in play)?$/i.exec(t);
  if (m) {
    const side = m[1]?.toLowerCase() === "your" ? "me" : "opp";
    const where = m[2] === "Benched " ? "bench" : m[2] === "Active " ? "active" : "any";
    const f = filterOrName(m[3] as string);
    if (!f) return null;
    return Object.keys(f).length ? scope.of(side, where, f) : scope.of(side, where);
  }
  return scopePhrase(t);
}

/** A Pokémon description, or a Pokémon name ("each Psyduck", "N's Pokémon"). */
function filterOrName(p: string): PokemonFilter | null {
  const t = p.trim();
  const f = pokemonFilter(t);
  if (f) return f;
  if (/^[A-Z][\w'.-]*(?: [A-Z][\w'.-]*)*(?: ex)?$/.test(t) && !/Pokémon|Energy|card/.test(t)) return { names: [t] };
  return null;
}

/** "{C}{C}" → 2. */
function colorless(p: string): number | null {
  const m = /^((?:\{C\})+)$/.exec(p.trim());
  return m ? (m[1] as string).length / 3 : null;
}

type Pred = { re: RegExp; build: (g: string[], src: StaticSource) => StaticRule[] | null };

const P = (re: RegExp, build: Pred["build"]): Pred => ({ re, build });

const PREDICATES: Pred[] = [
  // —— damage taken ——
  P(
    /^(.+?) takes? (\d+) (less|more) damage from attacks(?: from (?:(?:your|the) opponent's )?(.+?))? \(after applying Weakness and Resistance\)\.$/,
    ([who, n, way, from], src) => {
      const sc = subject(who as string, src);
      if (!sc) return null;
      const f = from ? pokemonFilter(from) : undefined;
      if (f === null) return null;
      const rule: StaticRule = { s: "taken", scope: sc, add: way === "less" ? -Number(n) : Number(n) };
      if (f && Object.keys(f).length) rule.from = f;
      return [rule];
    },
  ),
  // —— damage dealt ——
  P(
    /^(?:Attacks used by (.+?)|the attacks (it|this Pokémon) uses) do (\d+) more damage to (?:your|the) opponent's Active (.+?)(?: for each (.+?))? \(before applying Weakness and Resistance\)\.$/,
    ([who, it, n, vs, each], src) => {
      const whoText = (who ?? it) as string;
      // "your Future Pokémon, except any Iron Crown ex"
      const except = /^(.+?), except any (.+)$/.exec(whoText);
      const sc = subject(except ? (except[1] as string) : whoText, src);
      if (!sc) return null;
      if (except) sc.filter = { ...sc.filter, not: { names: [except[2] as string] } };
      const v = pokemonFilter(vs as string);
      if (!v) return null;
      const per = each ? eachPhrase(each, false) : undefined;
      if (per === null) return null;
      const rule: StaticRule = { s: "dealt", scope: sc, add: per ? amt.mul(Number(n), per) : Number(n), activeOnly: true };
      if (Object.keys(v).length) rule.vs = v;
      return [rule];
    },
  ),
  P(/^Attacks used by (.+?) do (\d+) less damage \(before applying Weakness and Resistance\)\.$/, ([who, n], src) => {
    const sc = subject(who as string, src);
    return sc ? [{ s: "dealt", scope: sc, add: -Number(n) }] : null;
  }),
  P(/^Ignore all \{C\} Energy in the costs of attacks used by (.+?)\.$/, ([who], src) => {
    const sc = subject(who as string, src);
    return sc ? [{ s: "attackCost", scope: sc, less: 20 }] : null;
  }),
  P(/^Damage counters on (.+?) can't be moved to other Pokémon\.$/, ([who], src) => {
    const sc = subject(who as string, src);
    return sc ? [{ s: "noMoveCounters", scope: sc }] : null;
  }),
  P(
    /^When your opponent's Active Pokémon retreats, your opponent flips a coin\. If tails, Energy for its Retreat Cost is not discarded, and they don't switch Pokémon\.$/,
    () => [{ s: "retreatFlip", scope: scope.oppActive() }],
  ),
  P(/^If any damage is done to (.+?) by attacks, flip a coin\. If heads, prevent that damage\.$/, ([who], src) => {
    const sc = subject(who as string, src);
    return sc ? [{ s: "prevent", scope: sc, what: "damage", flip: true }] : null;
  }),
  // —— Retreat Cost ——
  P(/^(.+?)'s? Retreat Cost is ((?:\{C\})+) (less|more)\.$/, ([who, c, way], src) => {
    const sc = subject(who as string, src);
    const n = colorless(c as string);
    return sc && n ? [{ s: "retreat", scope: sc, delta: way === "less" ? -n : n }] : null;
  }),
  P(/^The Retreat Cost of (.+?) is ((?:\{C\})+) (less|more)\.$/, ([who, c, way], src) => {
    const sc = subject(who as string, src);
    const n = colorless(c as string);
    return sc && n ? [{ s: "retreat", scope: sc, delta: way === "less" ? -n : n }] : null;
  }),
  P(/^(.+?) (?:has|have) no Retreat Cost\.$/, ([who], src) => {
    const t = who as string;
    // "All of your Pokémon that have {M} Energy attached"
    const energy = /^(.+?) that (?:has|have) (\{[A-Z]\}) Energy attached$/.exec(t);
    const sc = subject(energy ? (energy[1] as string) : t, src);
    if (!sc) return null;
    if (energy) {
      const type = typeSym(energy[2]);
      if (!type) return null;
      return [{ s: "retreat", scope: { ...sc, filter: { ...sc.filter, energyTypes: [type] } }, set: 0 }];
    }
    return [{ s: "retreat", scope: sc, set: 0 }];
  }),
  // —— HP ——
  P(/^(.+?) gets? \+(\d+) HP(?: for each (.+?))?\.$/, ([who, n, each], src) => {
    const sc = subject(who as string, src);
    if (!sc) return null;
    let add: Amount = Number(n);
    if (each) {
      const a = eachPhrase(each, false);
      if (!a) return null;
      add = amt.mul(Number(n), a);
    }
    return [{ s: "hp", scope: sc, add }];
  }),
  // —— Abilities ——
  P(/^(.+?) (?:has|have) no Abilities(?:, except for (.+?))?\.$/, ([who, except], src) => {
    const sc = subject(who as string, src);
    if (!sc) return null;
    if (except) {
      const f = pokemonFilter(except);
      const not: PokemonFilter = f && Object.keys(f).length ? f : { abilityNamed: except };
      sc.filter = { ...sc.filter, not };
    }
    return [{ s: "noAbilities", scope: sc }];
  }),
  // —— cards that can't be played ——
  P(/^Your opponent can't play any (Item|Stadium|Supporter|Pokémon Tool) cards from their hand\.$/, ([k]) => {
    const kind = k === "Item" ? "item" : k === "Stadium" ? "stadium" : k === "Supporter" ? "supporter" : "tool";
    return [{ s: "cantPlay", side: "opp", kinds: [kind] }];
  }),
  // —— attack costs ——
  P(/^Attacks used by (.+?) cost ((?:\{C\})+) less(?: for each (.+?))?\.$/, ([who, c, each], src) => {
    const sc = subject(who as string, src);
    const n = colorless(c as string);
    if (!sc || !n) return null;
    let less: Amount = n;
    if (each) {
      const a = eachPhrase(each, false);
      if (!a) return null;
      less = n === 1 ? a : amt.mul(n, a);
    }
    return [{ s: "attackCost", scope: sc, less }];
  }),
  // —— Special Conditions ——
  P(/^(.+?) can't be (Asleep|Burned|Confused|Paralyzed|Poisoned)\.$/, ([who, c], src) => {
    const sc = subject(who as string, src);
    const st = status(c as string) as SpecialCondition | null;
    return sc && st ? [{ s: "noConditions", scope: sc, only: [st] }] : null;
  }),
  P(/^(.+?) recovers from all Special Conditions and can't be affected by any Special Conditions\.$/, ([who], src) => {
    const sc = subject(who as string, src);
    return sc ? [{ s: "noConditions", scope: sc }] : null;
  }),
  P(/^(.+?) can't be affected by any Special Conditions\.$/, ([who], src) => {
    const sc = subject(who as string, src);
    return sc ? [{ s: "noConditions", scope: sc }] : null;
  }),
  // —— types ——
  P(/^(.+?) is (\{[A-Z]\}) and (\{[A-Z]\}) type\.$/, ([who, a, b], src) => {
    const sc = subject(who as string, src);
    const ta = typeSym(a);
    const tb = typeSym(b);
    return sc && ta && tb
      ? [
          { s: "addType", scope: sc, type: ta },
          { s: "addType", scope: sc, type: tb },
        ]
      : null;
  }),
  // —— prevention ——
  P(
    /^Prevent all damage (?:from attacks )?done to (.+?) by (?:attacks from )?(?:(?:your|the) opponent's )?(.+?)(?: if that damage is (\d+) or more)?\.$/,
    ([who, from, min], src) => {
      const sc = subject(who as string, src);
      const f = pokemonFilter(from as string);
      if (!sc || !f) return null;
      const rule: StaticRule = { s: "prevent", scope: sc, what: "damage" };
      if (Object.keys(f).length) rule.from = f;
      if (min) rule.minDamage = Number(min);
      return [rule];
    },
  ),
  P(/^Prevent all damage from and effects of attacks from (?:your|the) opponent's (.+?) done to (.+?)\.$/, ([from, who], src) => {
    const sc = subject(who as string, src);
    const f = pokemonFilter(from as string);
    if (!sc || !f) return null;
    const rule: StaticRule = { s: "prevent", scope: sc, what: "all" };
    if (Object.keys(f).length) rule.from = f;
    return [rule];
  }),
  P(/^Prevent all effects of your opponent's Pokémon's Abilities done to (.+?)\.$/, ([who], src) => {
    const sc = subject(who as string, src);
    return sc ? [{ s: "shielded", scope: sc, from: "abilities" }] : null;
  }),
  P(/^(.+?) can evolve during your first turn or the turn you play it\.$/, ([who], src) => {
    const sc = subject(who as string, src);
    return sc ? [{ s: "evolveSameTurn", scope: sc, firstTurn: true }] : null;
  }),
  // —— Pokémon Checkup ——
  P(/^During Pokémon Checkup, put (\w+) more damage counters? on (.+?)\.$/, ([n, who], src) => {
    const k = Number(n) || ({ a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5 } as Record<string, number>)[n as string];
    // "your opponent's Poisoned Pokémon", "each Poisoned non-{D} Pokémon (both yours and your opponent's)"
    const m = /^(.*?)\b(Poisoned|Burned) (.+)$/.exec(who as string);
    if (!k || !m) return null;
    const sc = subject(`${m[1]}${m[3]}`, src);
    if (!sc) return null;
    return [{ s: "checkupCounters", scope: sc, status: m[2] === "Poisoned" ? "poisoned" : "burned", add: k }];
  }),
  // Berries: "If the Pokémon this card is attached to is damaged by an attack from your opponent's {R} Pokémon, it takes
  // 60 less damage (after applying Weakness and Resistance), and discard this card."
  P(
    /^If (.+?) is damaged by an attack from your opponent's (.+?), it takes (\d+) less damage \(after applying Weakness and Resistance\), and discard this card\.$/,
    ([who, from, n], src) => {
      const sc = src === "tool" ? subject(who as string, src) : null;
      const f = pokemonFilter(from as string);
      if (!sc || !f) return null;
      const rule: StaticRule = { s: "taken", scope: sc, add: -Number(n), consume: true };
      if (Object.keys(f).length) rule.from = f;
      return [rule];
    },
  ),
  // —— survival ——
  P(
    /^If (.+?) has full HP and would be Knocked Out by damage from an attack( from your opponent's Pokémon)?, it is not Knocked Out, and its remaining HP becomes (\d+)\.$/,
    ([who, opp, hp], src) => {
      const sc = subject(who as string, src);
      if (!sc) return null;
      const rule: StaticRule = { s: "survive", scope: sc, hp: Number(hp), fullHp: true };
      if (opp) rule.byOpponent = true;
      return [rule];
    },
  ),
  P(
    /^If (.+?) would be Knocked Out by damage from an attack, flip a coin\. If heads, (?:it|this Pokémon) is not Knocked Out, and its remaining HP becomes (\d+)\.$/,
    ([who, hp], src) => {
      const sc = subject(who as string, src);
      return sc ? [{ s: "survive", scope: sc, hp: Number(hp), flip: true }] : null;
    },
  ),
  P(
    /^If (.+?) is damaged by an attack(?: from your opponent's Pokémon)? \(even if .+? is Knocked Out\), put (\w+) damage counters? on the Attacking Pokémon\.$/,
    ([who, n], src) => {
      const sc = subject(who as string, src);
      const k = num(n as string);
      return sc && k ? [{ s: "retaliate", scope: sc, counters: k }] : null;
    },
  ),
];

/** "As long as …, X." / "If …, X.": the condition (none for "this Pokémon is in play") and the rest as a sentence. */
function conditioned(t: string): { cond?: Condition; rest: string } | null {
  const m = /^(?:As long as|If) (.+?), (.+)$/.exec(t);
  if (!m) return null;
  const rest = sentence(m[2] as string);
  if (/^this Pokémon is in play$/.test(m[1] as string)) return { rest };
  const k = condPhrase(m[1] as string, false);
  return k ? { cond: k, rest } : null;
}

function predicate(t: string, src: StaticSource): StaticRule[] | null {
  for (const p of PREDICATES) {
    const m = p.re.exec(t);
    if (!m) continue;
    const rules = p.build(m.slice(1), src);
    if (rules) return rules;
  }
  return null;
}

/** One sentence: its rules, or null. */
function staticSentence(t: string, src: StaticSource): StaticRule[] | null {
  const direct = predicate(t, src);
  if (direct) return direct;
  const c = conditioned(t);
  if (!c) return null;
  // "it gets +100 HP, and the attacks it uses do 100 more damage …": two predicates under one condition.
  const parts = c.rest.split(/, and (?=the attacks|its |it )/);
  const out: StaticRule[] = [];
  for (const part of parts) {
    const body = part.replace(/\.$/, "");
    const rules = predicate(`${body.charAt(0).toUpperCase()}${body.slice(1)}.`, src);
    if (!rules) return null;
    out.push(...rules);
  }
  const k = c.cond;
  if (!k) return out;
  return out.map((r) => ({ ...r, cond: r.cond ? cond.and(r.cond, k) : k }) as StaticRule);
}

/** The rules of a whole static text, or null when a sentence is not understood. */
export function compileStatics(text: string, src: StaticSource): StaticRule[] | null {
  let t = normalize(text);
  // "The effect of <name> doesn't stack." at the end: every rule of the text.
  const stack = /\s*The effect of (.+?) doesn't stack\.$/.exec(t);
  if (stack) t = t.slice(0, stack.index);
  const mark = (rules: StaticRule[] | null) => {
    if (rules && stack) for (const r of rules) r.noStack = stack[1] as string;
    return rules;
  };
  // A predicate spanning several sentences ("…, flip a coin. If heads, …").
  const whole = predicate(t, src);
  if (whole) return mark(whole);
  const sentences = t.split(/(?<=[.)])\s+(?=[A-Z])/);
  const rules: StaticRule[] = [];
  for (const s of sentences) {
    const stack = /^The effect of (.+?) doesn't stack\.$/.exec(s);
    if (stack) {
      if (!rules.length) return null;
      for (const r of rules) r.noStack = stack[1] as string;
      continue;
    }
    const r = staticSentence(s, src);
    if (!r) return null;
    rules.push(...r);
  }
  return rules.length ? mark(rules) : null;
}
