/**
 * Phrases of English card text: numbers, types, Pokémon references, amounts ("for each …"), conditions ("if …") and
 * card filters ("Basic {R} Energy card"). Each parser returns null when it does not recognize the whole phrase, so a
 * template using it does not match (the card stays unscripted rather than wrong).
 */
import type {
  Amount,
  CardFilter,
  Condition,
  EType,
  PokemonFilter,
  PokemonRef,
  PokemonScope,
  SpecialCondition,
  Stage,
} from "@pokecircle/engine";
import { amt, cond, ref, scope } from "@pokecircle/engine";

const NUMBERS: Record<string, number> = {
  a: 1,
  an: 1,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
};

export function num(s: string | undefined): number | null {
  if (s === undefined) return null;
  const t = s.trim().toLowerCase();
  if (/^\d+$/.test(t)) return Number(t);
  return NUMBERS[t] ?? null;
}

export const TYPE_OF: Record<string, EType> = { G: "G", R: "R", W: "W", L: "L", P: "P", F: "F", D: "D", M: "M", N: "N", C: "C" };

export function typeSym(s: string | undefined): EType | null {
  const m = /^\{([GRWLPFDMNC])\}$/.exec((s ?? "").trim());
  return m ? (TYPE_OF[m[1] as string] ?? null) : null;
}

/** "this Pokémon", "your opponent's Active Pokémon", "the Defending Pokémon", "your Active Pokémon". */
export function pokemonRef(s: string, inAttack: boolean): PokemonRef | null {
  const t = s.trim();
  // A Tool's holder is its source Pokémon, like an Ability's.
  if (/^(?:this Pokémon|the Pokémon this card is attached to)$/i.test(t)) return ref.self;
  if (/^(your opponent's Active Pokémon|the Defending Pokémon)$/i.test(t)) return inAttack ? ref.defending : ref.oppActive;
  // "that Pokémon" after an attack's effect on the opponent's Active Pokémon.
  if (inAttack && /^that Pokémon$/i.test(t)) return ref.defending;
  if (/^your Active Pokémon$/i.test(t)) return ref.myActive;
  // A trigger's event: the Pokémon that attacked.
  if (/^the Attacking Pokémon$/i.test(t)) return { ev: "attacker" };
  return null;
}

const STAGES: Record<string, Stage> = { Basic: "basic", "Stage 1": "stage1", "Stage 2": "stage2" };
const STATUS_OF: Record<string, string> = {
  Asleep: "asleep",
  Burned: "burned",
  Confused: "confused",
  Paralyzed: "paralyzed",
  Poisoned: "poisoned",
};
const SYMBOL_NAMES: Record<string, string> = {
  G: "Grass",
  R: "Fire",
  W: "Water",
  L: "Lightning",
  P: "Psychic",
  F: "Fighting",
  D: "Darkness",
  M: "Metal",
};
/** A card name as printed with symbols ("Voltaic {L} Energy") → its English name ("Voltaic Lightning Energy"). */
export function cardName(s: string): string {
  return s.replace(/\{([GRWLPFDM])\}/g, (_, t: string) => SYMBOL_NAMES[t] ?? t);
}

/**
 * A Pokémon description: "Pokémon", "Basic Pokémon", "{G} Pokémon", "Pokémon ex", "Evolution Pokémon", "Stage 2
 * Pokémon", "Pokémon that doesn't have a Rule Box".
 */
export function pokemonFilter(s: string): PokemonFilter | null {
  let t = s.trim();
  const f: PokemonFilter = {};
  // Pokémon V are not in Standard: "Pokémon ex and Pokémon V" are the Pokémon ex.
  t = t.replace(/^(.*Pokémon ex) (?:and|or) Pokémon V$/, "$1");
  const counters = /^(.*?) that (?:has|have) any damage counters on (?:it|them)$/.exec(t);
  if (counters) {
    t = counters[1] as string;
    f.damaged = true;
  }
  const named = /^(.*?) that (?:has|have) "(.+?)" in (?:its|their) names?$/.exec(t);
  if (named) {
    t = named[1] as string;
    f.nameIncludes = named[2] as string;
  }
  const energy = /^(.*?) that (?:has|have) any (\{[A-Z]\} |Special )?Energy attached$/.exec(t);
  if (energy) {
    t = energy[1] as string;
    if (energy[2] === "Special ") f.specialEnergy = true;
    else if (energy[2]) {
      const ty = typeSym(energy[2].trim());
      if (!ty) return null;
      f.energyTypes = [ty];
    } else f.hasEnergy = true;
  }
  const tool = /^(.*?) that (?:has|have) a Pokémon Tool attached$/.exec(t);
  if (tool) {
    t = tool[1] as string;
    f.hasTool = true;
  }
  const fewEnergy = /^(.*?) that (?:has|have) (\w+) or less Energy attached$/.exec(t);
  if (fewEnergy) {
    const n = num(fewEnergy[2]);
    if (n === null) return null;
    t = fewEnergy[1] as string;
    f.maxEnergy = n;
  }
  const st = /^(Asleep|Burned|Confused|Paralyzed|Poisoned) (.*)$/.exec(t);
  if (st) {
    t = st[2] as string;
    f.status = [STATUS_OF[st[1] as string] as SpecialCondition];
  }
  t = t.replace(/^(\{[A-Z]\} )?Mega Evolution (Pokémon ex)$/, "Mega $1$2");
  const mega = /^Mega (.*)$/.exec(t);
  if (mega) {
    t = mega[1] as string;
    f.tags = [...(f.tags ?? []), "mega"];
  }
  const ability = /^(.*?) that (?:has|have) an Ability$/.exec(t);
  if (ability) {
    t = ability[1] as string;
    f.hasAbility = true;
  }
  const withBox = /^(.*?) with a Rule Box$/.exec(t);
  if (withBox) {
    t = withBox[1] as string;
    f.tags = ["ruleBox"];
  }
  const nonType = /^(?:(Basic|Stage 1|Stage 2|Evolution) )?non-(\{[A-Z]\}) (.*)$/.exec(t);
  if (nonType) {
    const ty = typeSym(nonType[2]);
    if (!ty) return null;
    f.not = { types: [ty] };
    t = `${nonType[1] ? `${nonType[1]} ` : ""}${nonType[3]}`;
  }
  const typeList = /^((?:\{[A-Z]\}, )+(?:or )?\{[A-Z]\}|\{[A-Z]\} or \{[A-Z]\}) (Pokémon.*)$/.exec(t);
  if (typeList) {
    const types = (typeList[1] as string).match(/\{[A-Z]\}/g)?.map((x) => typeSym(x));
    if (!types || types.some((x) => !x)) return null;
    f.types = types as EType[];
    t = typeList[2] as string;
  }
  const tag = /^(Ancient|Future|Tera) (.*)$/.exec(t);
  if (tag) {
    f.tags = [...(f.tags ?? []), tag[1] === "Ancient" ? "ancient" : tag[1] === "Future" ? "future" : "tera"];
    t = tag[2] as string;
  }
  const hp = /^(.*?) with (\d+) HP or less$/.exec(t);
  if (hp) {
    t = hp[1] as string;
    f.maxHp = Number(hp[2]);
  }
  const ruleBox = /^(.*?) that (?:doesn't|don't) have a Rule Box$/.exec(t);
  if (ruleBox) {
    t = ruleBox[1] as string;
    f.noTags = ["ruleBox"];
  }
  // A Trainer's Pokémon: "Cynthia's Pokémon", "Basic Team Rocket's Pokémon".
  const owner = /^(?:(Basic|Stage 1|Stage 2|Evolution) )?((?:[A-Z][\w.]*\s)*[A-Z][\w.]*'s) (.*)$/.exec(t);
  if (owner && owner[2] !== "Pokémon's") {
    f.nameIncludes = owner[2] as string;
    t = `${owner[1] ? `${owner[1]} ` : ""}${owner[3]}`;
  }
  let m = /^(?:(Basic|Stage 1|Stage 2|Evolution) )?(?:(\{[A-Z]\}) )?Pokémon(?: (ex))?$/.exec(t);
  if (!m) {
    m = /^(?:(Basic|Stage 1|Stage 2|Evolution) )?(?:(\{[A-Z]\}) )?Pokémon(?: (ex))?s?$/.exec(t);
    if (!m) return null;
  }
  if (m[1] === "Evolution") f.stage = ["stage1", "stage2"];
  else if (m[1]) f.stage = [STAGES[m[1]] as Stage];
  if (m[2]) {
    const ty = typeSym(m[2]);
    if (!ty) return null;
    f.types = [ty];
  }
  if (m[3]) f.tags = [...(f.tags ?? []), "ex"];
  return f;
}

/** "your Benched Pokémon", "your opponent's Benched Pokémon", "your Pokémon", "your opponent's Pokémon". */
export function scopePhrase(s: string): PokemonScope | null {
  const m = /^(your opponent's|your) (Benched |Active )?(.*)$/.exec(s.trim());
  if (!m) return null;
  const side = m[1] === "your" ? "me" : "opp";
  const where = m[2] === "Benched " ? "bench" : m[2] === "Active " ? "active" : "any";
  // A Pokémon description, or a name ("your Benched Rattata").
  const name = m[3] as string;
  const f =
    pokemonFilter(name) ??
    (/^[A-Z][\w'.-]*(?: [A-Z][\w'.-]*)*(?: ex)?$/.test(name) && !/\b(?:Pokémon|Energy|Item|Supporter|Stadium|Tool)\b/.test(name)
      ? { names: [name] }
      : null);
  if (!f) return null;
  return Object.keys(f).length ? scope.of(side, where, f) : scope.of(side, where);
}

/**
 * The counted thing of "for each …": Energy attached, damage counters, Benched Pokémon, Prize cards, heads, cards in a
 * zone.
 */
export function eachPhrase(s: string, inAttack: boolean): Amount | null {
  const t = s.trim().replace(/\s+/g, " ");
  let m: RegExpExecArray | null;
  if (t === "heads") return amt.heads();
  if (t === "Energy attached to all Pokémon") return amt.energy(ref.all(scope.of("both")), { units: true });
  m = /^(?:(Basic) )?(\{[A-Z]\} )?Energy attached to (.+)$/.exec(t);
  if (m) {
    const type = m[2] ? typeSym(m[2].trim()) : undefined;
    if (type === null) return null;
    // "for each Energy" counts the Energy provided (a card providing 2 counts twice); "Basic Energy" counts cards.
    const opts = { ...(type ? { type } : {}), ...(m[1] ? { basic: true } : { units: true }) };
    const on = (m[3] as string) === "it" ? "this Pokémon" : (m[3] as string);
    // "all of your Iono's Pokémon"
    const allOf = /^all of (your opponent's|your) (.+)$/.exec(on);
    if (allOf && allOf[2] !== "Pokémon") {
      const sc = scopePhrase(`${allOf[1]} ${allOf[2]}`);
      return sc ? amt.energy(ref.all(sc), opts) : null;
    }
    if (on === "both Active Pokémon") return amt.add(amt.energy(ref.myActive, opts), amt.energy(ref.oppActive, opts));
    if (/^all of (your opponent's|your) Pokémon$/.test(on)) {
      const side = on.includes("opponent") ? "opp" : "me";
      return amt.energy(ref.all(scope.of(side)), opts);
    }
    const r = pokemonRef(on, inAttack);
    return r ? amt.energy(r, opts) : null;
  }
  m = /^damage counter on (.+)$/.exec(t);
  if (m) {
    const on = m[1] as string;
    const sc = /^all of (.+)$/.exec(on);
    if (sc) {
      const x = scopePhrase(sc[1] as string);
      return x ? amt.counters(ref.all(x)) : null;
    }
    const r = pokemonRef(on, inAttack);
    return r ? amt.counters(r) : null;
  }
  m = /^of (your opponent's|your) Benched Pokémon$/.exec(t);
  if (m) return amt.pokemon(scope.of(m[1] === "your" ? "me" : "opp", "bench"));
  if (t === "Benched Pokémon (both yours and your opponent's)") return amt.pokemon(scope.of("both", "bench"));
  m = /^of (your opponent's|your) Pokémon in play$/.exec(t);
  if (m) return amt.pokemon(scope.of(m[1] === "your" ? "me" : "opp"));
  m = /^(?:(Basic|Evolution) )?(\{[A-Z]\} )?Pokémon (?:you have )?in play$/.exec(t);
  if (m) {
    const f = pokemonFilter(`${m[1] ? `${m[1]} ` : ""}${m[2] ?? ""}Pokémon`);
    return f ? amt.pokemon(scope.of("me", "any", f)) : null;
  }
  m = /^Pokémon Tool attached to (.+)$/.exec(t);
  if (m) {
    const on = m[1] as string;
    const all = /^all of (your opponent's|your) Pokémon$/.exec(on);
    if (all) return { k: "tools", on: ref.all(scope.of(all[1] === "your" ? "me" : "opp")) };
    if (on === "all Pokémon") return { k: "tools", on: ref.all(scope.of("both")) };
    const r = pokemonRef(on, inAttack);
    return r ? { k: "tools", on: r } : null;
  }
  m = /^\{C\} in (.+?)'s Retreat Cost$/.exec(t);
  if (m) {
    const r = pokemonRef(m[1] as string, inAttack);
    return r ? { k: "retreatCost", on: r } : null;
  }
  m = /^Special Condition affecting (.+)$/.exec(t);
  if (m) {
    const r = pokemonRef(m[1] as string, inAttack);
    return r ? { k: "conditions", on: r } : null;
  }
  m = /^type of Basic Energy attached to all of (your opponent's|your) Pokémon$/.exec(t);
  if (m) return { k: "energyTypes", on: ref.all(scope.of(m[1] === "your" ? "me" : "opp")) };
  m = /^of your Pokémon in play that has the (.+?) attack$/.exec(t);
  if (m) return amt.pokemon(scope.of("me", "any", { attackNamed: m[1] as string }));
  m = /^of your (.+?) in play$/.exec(t);
  if (m) {
    const f = pokemonFilter(m[1] as string);
    if (f) return amt.pokemon(scope.of("me", "any", f));
  }
  // "of your Beedrill and Beedrill ex in play"
  m = /^of your ([A-Z][\w'.-]*(?: [A-Z][\w'.-]*)*(?: ex)?) and ([A-Z][\w'.-]*(?: [A-Z][\w'.-]*)*(?: ex)?) in play$/.exec(t);
  if (m && !/Pokémon/.test(`${m[1]}${m[2]}`))
    return amt.pokemon(scope.of("me", "any", { names: [m[1] as string, m[2] as string] }));
  // "of your Benched Pokémon that has any {R} Energy attached", "of your opponent's Mega Evolution Pokémon ex in play"
  m = /^of (your opponent's|your) (Benched |Active )?(.+?)(?: in play)?$/.exec(t);
  if (m) {
    const f = pokemonFilter(m[3] as string);
    if (f) return amt.pokemon(scope.of(m[1] === "your" ? "me" : "opp", m[2] === "Benched " ? "bench" : "any", f));
  }
  // "Stage 2 Pokémon on your Bench"
  m = /^(.+?) on your Bench$/.exec(t);
  if (m) {
    const f = pokemonFilter(m[1] as string);
    if (f) return amt.pokemon(scope.myBench(f));
  }
  if (t === "Prize card your opponent has taken") return amt.prizesTaken("opp");
  if (t === "Prize card your opponent took during their last turn")
    return { k: "turnLog", event: "prizesTaken", side: "opp", previous: true, sum: true };
  if (t === "Prize card you have taken") return amt.prizesTaken("me");
  m = /^card in (your opponent's|your) hand$/.exec(t);
  if (m) return amt.cards("hand", m[1] === "your" ? "me" : "opp");
  m = /^(.+?) in (your opponent's|your) discard pile$/.exec(t);
  if (m) {
    const f = cardFilter((m[1] as string).replace(/ card$/, " card"));
    return f ? amt.cards("discard", m[2] === "your" ? "me" : "opp", f.filter) : null;
  }
  return null;
}

/** "a/an/N/up to N" before a card description. */
export function countPhrase(s: string): { min: number; max: number } | null {
  const t = s.trim().toLowerCase();
  if (t === "any number of") return { min: 0, max: 60 };
  const up = /^up to (\w+)$/.exec(t);
  if (up) {
    const n = num(up[1]);
    return n === null ? null : { min: 0, max: n };
  }
  const n = num(t);
  return n === null ? null : { min: n, max: n };
}

/**
 * A card description: "card(s)", "Pokémon", "Basic Pokémon", "Basic Energy card", "Basic {R} Energy card", "Energy
 * card", "Supporter card", "Item card", "Trainer card", "Pokémon Tool card", "Stadium card", "Evolution Pokémon".
 */
export function cardFilter(s: string): { filter?: CardFilter } | null {
  const combination = /^in any combination of /.test(s.trim());
  const raw = s.trim().replace(/^in any combination of /, "");
  // "a Pokémon or a Basic Energy card"; "in any combination of {G} Pokémon and Stadium cards". A plain "X and Y" is two
  // separate cards (Hilda), not one of either: not a filter.
  if (!combination && / and /.test(raw)) return null;
  const parts = raw.split(/ or an? (?!less|more|fewer)| or (?!less|more|fewer)| and /);
  if (parts.length > 1) {
    const all = parts.map((p) => cardFilter(p.replace(/^an? /, "")));
    if (all.some((x) => !x)) return null;
    const filters = all.map((x) => x?.filter ?? {});
    return { filter: { anyOf: filters } };
  }
  const t = raw.replace(/ cards$/, " card").replace(/^(.*Pokémon(?: ex)?)s$/, "$1");
  let m: RegExpExecArray | null;
  // 'Item cards that have "Antique" in their name'
  m = /^(.+?) cards? that (?:has|have) "(.+?)" in (?:its|their) name$/.exec(raw.trim());
  if (m) {
    const base = cardFilter(`${m[1]} card`);
    return base ? { filter: { ...base.filter, nameIncludes: m[2] as string } } : null;
  }
  if (/^cards?$/.test(t)) return {};
  m = /^(Basic )?(\{[A-Z]\} )?Energy card$/.exec(t);
  if (m) {
    const type = m[2] ? typeSym(m[2].trim()) : undefined;
    if (type === null) return null;
    const f: CardFilter = { category: ["energy"] };
    if (m[1]) f.basicEnergy = true;
    if (type) f.energyTypes = [type];
    return { filter: f };
  }
  m = /^(Supporter|Item|Stadium|Pokémon Tool|Trainer) card$/.exec(t);
  if (m) {
    const kind = m[1];
    if (kind === "Trainer") return { filter: { category: ["trainer"] } };
    const k = kind === "Pokémon Tool" ? "tool" : (kind as string).toLowerCase();
    return { filter: { category: ["trainer"], trainer: [k as "item"] } };
  }
  // "Ancient card", "Future card": Pokémon or Trainer cards with the tag.
  m = /^(Ancient|Future) cards?$/.exec(raw.trim());
  if (m) return { filter: { tags: [m[1] === "Ancient" ? "ancient" : "future"] } };
  // A Special Energy by name: "up to 2 Spiky Energy cards".
  m = /^([A-Z][\w'.-]*(?: [A-Z][\w'.-]*)* Energy) cards?$/.exec(raw.trim());
  if (m && !/^(?:Basic|Special)\b/.test(m[1] as string)) return { filter: { category: ["energy"], names: [m[1] as string] } };
  // A Trainer card by name: "up to 2 Transformation Tome cards".
  m = /^([A-Z][\w'.-]*(?: [A-Z][\w'.-]*)*) cards?$/.exec(raw.trim());
  if (m && !/\b(?:Pokémon|Energy|Item|Supporter|Stadium|Tool|Trainer|Basic|Ancient|Future|Tera|Mega|ACE)\b/.test(m[1] as string))
    return { filter: { names: [m[1] as string] } };
  // A Pokémon by name: "up to 3 Lampent", "a Pikachu", "Maushold and Maushold ex" (any combination).
  if (
    /^[A-Z][\w'.-]*(?: [A-Z][\w'.-]*)*(?: ex)?$/.test(t) &&
    !/\b(?:Pokémon|Energy|card|Item|Supporter|Stadium|Tool|Trainer|Ancient|Future|Tera|Mega|ACE)\b/.test(t)
  )
    return { filter: { names: [t] } };
  const pf = pokemonFilter(t.replace(/ card$/, ""));
  // Only what a card filter can say: anything else ("that has an Ability") would widen the search.
  const CARD_KEYS = ["stage", "types", "tags", "noTags", "maxHp", "nameIncludes"];
  if (pf && Object.keys(pf).some((k) => !CARD_KEYS.includes(k))) return null;
  if (pf) {
    const f: CardFilter = { category: ["pokemon"] };
    if (pf.stage) f.stage = pf.stage;
    if (pf.types) f.types = pf.types;
    if (pf.tags) f.tags = pf.tags;
    if (pf.noTags) f.noTags = pf.noTags;
    if (pf.maxHp !== undefined) f.maxHp = pf.maxHp;
    if (pf.nameIncludes) f.nameIncludes = pf.nameIncludes;
    return { filter: f };
  }
  return null;
}

const STATUS: Record<string, "asleep" | "burned" | "confused" | "paralyzed" | "poisoned"> = {
  Asleep: "asleep",
  Burned: "burned",
  Confused: "confused",
  Paralyzed: "paralyzed",
  Poisoned: "poisoned",
};

export function status(s: string): (typeof STATUS)[string] | null {
  return STATUS[s.trim()] ?? null;
}

/** A condition after "If": "this Pokémon has any damage counters on it", "your opponent's Active Pokémon is a Pokémon ex". */
export function condPhrase(s: string, inAttack: boolean): Condition | null {
  const t = s.trim();
  let m: RegExpExecArray | null;
  // "this Pokémon is on your Bench, and if you have any Mega Evolution Pokémon ex in play"
  m = /^(.+?), and if (.+)$/.exec(t);
  if (m) {
    const a = condPhrase(m[1] as string, inAttack);
    const b = condPhrase(m[2] as string, inAttack);
    if (a && b) return cond.and(a, b);
  }
  m = /^(.+?) evolved from (?:[A-Z][\w'.-]*(?: [A-Z][\w'.-]*)*) during this turn$/.exec(t);
  if (m) {
    const r = pokemonRef(m[1] as string, inAttack);
    if (r) return { c: "didThisTurn", kind: "evolved", ref: r };
  }
  if (/^you have a Stadium in play$/.test(t)) return { c: "stadium", owner: "me" };
  if (/^your opponent has a Stadium in play$/.test(t)) return { c: "stadium", owner: "opp" };
  m = /^(.+?) (?:already )?(?:has|have) (?:any )?damage counters on (?:it|them)$/.exec(t);
  if (m) {
    const r = pokemonRef(m[1] as string, inAttack);
    if (r) return cond.cmp(amt.counters(r), ">", 0);
    const sc = scopePhrase((m[1] as string).replace(/^any of /, ""));
    return sc ? cond.exists({ ...sc, filter: { ...sc.filter, damaged: true } }) : null;
  }
  m = /^(.+?) (?:has|have) no damage counters on (?:it|them)$/.exec(t);
  if (m) {
    const r = pokemonRef(m[1] as string, inAttack);
    return r ? cond.cmp(amt.counters(r), "==", 0) : null;
  }
  m = /^(.+?) is an? (.+?)(?: or (?:a )?Pokémon V)?$/.exec(t);
  if (m) {
    const r = pokemonRef(m[1] as string, inAttack);
    const f = pokemonFilter(m[2] as string);
    if (r && f) return cond.matches(r, f);
  }
  m = /^(.+?) is (Asleep|Burned|Confused|Paralyzed|Poisoned)$/.exec(t);
  if (m) {
    const r = pokemonRef(m[1] as string, inAttack);
    const st = status(m[2] as string);
    return r && st ? cond.hasCondition(r, st) : null;
  }
  m = /^(.+?) is affected by a Special Condition$/.exec(t);
  if (m) {
    const r = pokemonRef(m[1] as string, inAttack);
    return r ? cond.hasCondition(r) : null;
  }
  m = /^(.+?) has (\w+) or more (\{[A-Z]\} )?Energy attached$/.exec(t);
  if (m) {
    const r = pokemonRef(m[1] as string, inAttack);
    const n = num(m[2]);
    const type = m[3] ? typeSym(m[3].trim()) : undefined;
    if (!r || n === null || type === null) return null;
    return cond.cmp(amt.energy(r, { units: true, ...(type ? { type } : {}) }), ">=", n);
  }
  m = /^your opponent has (\w+) or (fewer|more) Prize cards remaining$/.exec(t);
  if (m) {
    const n = num(m[1]);
    return n === null ? null : cond.cmp(amt.prizesLeft("opp"), m[2] === "fewer" ? "<=" : ">=", n);
  }
  m = /^you have (\w+) or (fewer|more) Prize cards remaining$/.exec(t);
  if (m) {
    const n = num(m[1]);
    return n === null ? null : cond.cmp(amt.prizesLeft("me"), m[2] === "fewer" ? "<=" : ">=", n);
  }
  m = /^you have (\w+) or (fewer|more) cards in your hand$/.exec(t);
  if (m) {
    const n = num(m[1]);
    return n === null ? null : cond.cmp(amt.cards("hand", "me"), m[2] === "fewer" ? "<=" : ">=", n);
  }
  if (/^any of your Pokémon were Knocked Out (?:by damage from an attack )?during your opponent's last turn$/.test(t))
    return cond.cmp({ k: "turnLog", event: "knockedOut", side: "me", previous: true }, ">", 0);
  if (/^you played a Supporter card from your hand during this turn$/.test(t))
    return cond.cmp({ k: "turnLog", event: "supporterPlayed", side: "me" }, ">", 0);
  if (/^you go second$/.test(t) || /^you went second$/.test(t)) return cond.not({ c: "wentFirst" });
  if (/^a Stadium is in play$/.test(t)) return { c: "stadium" };
  m = /^your Active Pokémon has the (.+?) Ability$/.exec(t);
  if (m) return cond.matches(ref.myActive, { abilityNamed: m[1] as string });
  if (/^there is no Stadium in play$/.test(t)) return cond.not({ c: "stadium" });
  m = /^(.+?) moved from your Bench to the Active Spot this turn$/.exec(t);
  if (m) {
    const r = pokemonRef(m[1] as string, inAttack);
    return r ? { c: "didThisTurn", kind: "becameActive", ref: r } : null;
  }
  m = /^(.+?) has a Pokémon Tool attached$/.exec(t);
  if (m) {
    const r = pokemonRef(m[1] as string, inAttack);
    return r ? cond.matches(r, { hasTool: true }) : null;
  }
  if (/^you go first$/.test(t) || /^you went first$/.test(t)) return { c: "wentFirst" };
  m = /^(.+?) was healed during this turn$/.exec(t);
  if (m) {
    const r = pokemonRef(m[1] as string, inAttack);
    return r ? { c: "didThisTurn", kind: "healed", ref: r } : null;
  }
  m = /^you have any (.+?) on your Bench$/.exec(t);
  if (m) {
    const f = pokemonFilter(m[1] as string);
    return f ? cond.exists(scope.of("me", "bench", f)) : null;
  }
  m = /^you have ([A-Z][\w'. -]*?) and ([A-Z][\w'. -]*?) in play$/.exec(t);
  if (m)
    return cond.and(cond.exists(scope.mine({ names: [m[1] as string] })), cond.exists(scope.mine({ names: [m[2] as string] })));
  m = /^you have ([A-Z][\w'.-]*(?: [A-Z][\w'.-]*)*(?: ex)?) in play$/.exec(t);
  if (m && !/\b(?:Pokémon|Energy)\b/.test(m[1] as string)) return cond.exists(scope.mine({ names: [m[1] as string] }));
  m = /^you have any (.+?) in play$/.exec(t);
  if (m) {
    const f = pokemonFilter(m[1] as string);
    return f ? cond.exists(scope.of("me", "any", f)) : null;
  }
  if (/^you have more Prize cards remaining than your opponent$/.test(t))
    return cond.cmp(amt.prizesLeft("me"), ">", amt.prizesLeft("opp"));
  if (/^you have fewer Prize cards remaining than your opponent$/.test(t))
    return cond.cmp(amt.prizesLeft("me"), "<", amt.prizesLeft("opp"));
  m = /^(.+?) has any Special Energy attached$/.exec(t);
  if (m) {
    const r = pokemonRef(m[1] as string, inAttack);
    return r ? cond.cmp(amt.energy(r, { special: true }), ">", 0) : null;
  }
  m = /^(.+?) has any (\{[A-Z]\} )?Energy attached$/.exec(t);
  if (m) {
    const r = pokemonRef(m[1] as string, inAttack);
    const type = m[2] ? typeSym(m[2].trim()) : undefined;
    if (!r || type === null) return null;
    return cond.cmp(amt.energy(r, type ? { type } : {}), ">", 0);
  }
  m = /^(.+?) has no Energy attached$/.exec(t);
  if (m) {
    const r = pokemonRef(m[1] as string, inAttack);
    return r ? cond.cmp(amt.energy(r), "==", 0) : null;
  }
  m = /^your opponent has (\w+) or (fewer|more) cards in their hand$/.exec(t);
  if (m) {
    const n = num(m[1]);
    return n === null ? null : cond.cmp(amt.cards("hand", "opp"), m[2] === "fewer" ? "<=" : ">=", n);
  }
  m = /^you (?:don't|do not) have exactly (\w+) cards in your hand$/.exec(t);
  if (m) {
    const n = num(m[1]);
    return n === null ? null : cond.cmp(amt.cards("hand", "me"), "!=", n);
  }
  if (/^this Pokémon and your opponent's Active Pokémon have the same amount of Energy attached$/.test(t))
    return cond.cmp(amt.energy(ref.self), "==", amt.energy(inAttack ? ref.defending : ref.oppActive));
  m = /^(.+?) isn't (Asleep|Burned|Confused|Paralyzed|Poisoned)$/.exec(t);
  if (m) {
    const r = pokemonRef(m[1] as string, inAttack);
    const st = status(m[2] as string);
    return r && st ? cond.not(cond.hasCondition(r, st)) : null;
  }
  m = /^(.+?) isn't affected by a Special Condition$/.exec(t);
  if (m) {
    const r = pokemonRef(m[1] as string, inAttack);
    return r ? cond.not(cond.hasCondition(r)) : null;
  }
  m = /^(.+?) is in the Active Spot$/.exec(t);
  if (m) {
    const r = pokemonRef(m[1] as string, inAttack);
    if (r === ref.self) return { c: "isActive", ref: r };
  }
  m = /^(.+?) is on your Bench$/.exec(t);
  if (m) {
    const r = pokemonRef(m[1] as string, inAttack);
    if (r === ref.self) return cond.not({ c: "isActive", ref: r });
  }
  m = /^you have at least (\w+) other ([A-Z][\w'. -]*?) in play$/.exec(t);
  if (m) {
    const n = num(m[1]);
    return n === null
      ? null
      : cond.cmp(amt.pokemon({ ...scope.of("me", "any", { names: [m[2] as string] }), notSelf: true }), ">=", n);
  }
  m = /^(.+?) has an? ([A-Z][\w'. -]*?) attached$/.exec(t);
  if (m && !/Energy$|Tool$/.test(m[2] as string)) {
    const r = pokemonRef(m[1] as string, inAttack);
    return r ? cond.matches(r, { attachedNamed: m[2] as string }) : null;
  }
  if (/^you have the same number of cards in your hand as your opponent$/.test(t))
    return cond.cmp(amt.cards("hand", "me"), "==", amt.cards("hand", "opp"));
  if (/^you don't have the same number of cards in your hand as your opponent$/.test(t))
    return cond.cmp(amt.cards("hand", "me"), "!=", amt.cards("hand", "opp"));
  // "you played Emma from your hand during this turn", "you played a Supporter card that has "Team Rocket" in its name …"
  m = /^you played (?:an? )?(.+?) from your hand (?:during )?this turn$/.exec(t);
  const played = m
    ? /^[A-Z][\w'.&-]*(?: [A-Z&][\w'.&-]*)*$/.test(m[1] as string) && !/\bcard\b/.test(m[1] as string)
      ? { filter: { names: [m[1] as string] } }
      : cardFilter(m[1] as string)
    : null;
  if (m && played?.filter) {
    const filter = played.filter;
    return cond.cmp(
      amt.add(
        { k: "turnLog", event: "supporterPlayed", side: "me", filter },
        { k: "turnLog", event: "itemPlayed", side: "me", filter },
      ),
      ">",
      0,
    );
  }
  m = /^([A-Z][\w'.&-]*(?: [A-Z&][\w'.&-]*)*) is in your discard pile$/.exec(t);
  if (m) return cond.hasCards("discard", "me", { names: [m[1] as string] });
  m = /^(.+?) has no Retreat Cost$/.exec(t);
  if (m) {
    const r = pokemonRef(m[1] as string, inAttack);
    return r ? cond.cmp({ k: "retreatCost", on: r }, "==", 0) : null;
  }
  m = /^your opponent has exactly (\w+) cards? in their hand$/.exec(t);
  if (m) {
    const n = num(m[1]);
    return n === null ? null : cond.cmp(amt.cards("hand", "opp"), "==", n);
  }
  // "you have at least 4 {R} Energy in play"
  m = /^you have at least (\w+) (\{[A-Z]\} )?Energy in play$/.exec(t);
  if (m) {
    const n = num(m[1]);
    const type = m[2] ? typeSym(m[2].trim()) : undefined;
    if (n === null || type === null) return null;
    return cond.cmp(amt.energy(ref.all(scope.mine()), { units: true, ...(type ? { type } : {}) }), ">=", n);
  }
  // "you don't have 10 or more Basic {F} Energy cards in your discard pile"
  m = /^you (don't )?have (\w+) or more (.+?) in your discard pile$/.exec(t);
  if (m) {
    const n = num(m[2]);
    const f = cardFilter(m[3] as string);
    if (n === null || !f) return null;
    const k = cond.hasCards("discard", "me", f.filter, n);
    return m[1] ? cond.not(k) : k;
  }
  // "any of your Hop's Pokémon were Knocked Out by damage from an attack during your opponent's last turn"
  m = /^any of your (.+?) were Knocked Out by damage from an attack during your opponent's last turn$/.exec(t);
  if (m) {
    const f = cardFilter(m[1] as string);
    return f?.filter
      ? cond.cmp({ k: "turnLog", event: "knockedOut", side: "me", previous: true, filter: f.filter }, ">", 0)
      : null;
  }
  // "this Pokémon used Spiky Rolling during your last turn"
  m = /^this Pokémon used (.+?) during your last turn$/.exec(t);
  if (m) return { c: "didLastTurn", kind: "attacked", ref: ref.self, key: m[1] as string };
  // "this Pokémon is Burned or Poisoned"
  m = /^(.+?) is (Asleep|Burned|Confused|Paralyzed|Poisoned) or (Asleep|Burned|Confused|Paralyzed|Poisoned)$/.exec(t);
  if (m) {
    const r = pokemonRef(m[1] as string, inAttack);
    const a = status(m[2] as string);
    const b = status(m[3] as string);
    return r && a && b ? cond.or(cond.hasCondition(r, a), cond.hasCondition(r, b)) : null;
  }
  m = /^you have (\w+) or (fewer|more) Benched Pokémon$/.exec(t);
  if (m) {
    const n = num(m[1]);
    return n === null ? null : cond.cmp(amt.pokemon(scope.myBench()), m[2] === "fewer" ? "<=" : ">=", n);
  }
  m = /^([A-Z][\w'.-]*(?: [A-Z][\w'.-]*)*) and ([A-Z][\w'.-]*(?: [A-Z][\w'.-]*)*) are on your Bench$/.exec(t);
  if (m)
    return cond.and(
      cond.exists(scope.myBench({ names: [m[1] as string] })),
      cond.exists(scope.myBench({ names: [m[2] as string] })),
    );
  m = /^an? (.+?) is on your Bench$/.exec(t);
  if (m) {
    const f = pokemonFilter(m[1] as string);
    if (f) return cond.exists(scope.myBench(f));
  }
  m = /^([A-Z][\w'.-]*(?: [A-Z][\w'.-]*)*(?: ex)?) is on your Bench$/.exec(t);
  if (m && m[1] !== "This Pokémon") return cond.exists(scope.myBench({ names: [m[1] as string] }));
  m = /^(.+?) has (\{[A-Z]\}) Resistance$/.exec(t);
  if (m) {
    const r = pokemonRef(m[1] as string, inAttack);
    const ty = typeSym(m[2]);
    return r && ty ? cond.matches(r, { resistance: ty }) : null;
  }
  m = /^(.+?) isn't an? (.+)$/.exec(t);
  if (m) {
    const r = pokemonRef(m[1] as string, inAttack);
    const f = pokemonFilter(m[2] as string);
    if (r && f) return cond.not(cond.matches(r, f));
  }
  m = /^there are (\w+) or fewer cards in your deck$/.exec(t);
  if (m) {
    const n = num(m[1]);
    return n === null ? null : cond.cmp(amt.cards("deck", "me"), "<=", n);
  }
  m = /^your opponent has (\w+) or more Benched Pokémon$/.exec(t);
  if (m) {
    const n = num(m[1]);
    return n === null ? null : cond.cmp(amt.pokemon(scope.oppBench()), ">=", n);
  }
  m = /^your opponent has no (.+?) in play$/.exec(t);
  if (m) {
    const f = pokemonFilter(m[1] as string);
    return f ? cond.not(cond.exists(scope.theirs(f))) : null;
  }
  m = /^you don't have ([A-Z][\w'.-]*(?: [A-Z][\w'.-]*)*) and ([A-Z][\w'.-]*(?: [A-Z][\w'.-]*)*) on your Bench$/.exec(t);
  if (m)
    return cond.not(
      cond.and(cond.exists(scope.myBench({ names: [m[1] as string] })), cond.exists(scope.myBench({ names: [m[2] as string] }))),
    );
  if (/^you have no cards in your hand$/.test(t)) return cond.cmp(amt.cards("hand", "me"), "==", 0);
  m = /^(your opponent|you) (?:has|have) exactly (\w+) Prize cards? remaining$/.exec(t);
  if (m) {
    const n = num(m[2]);
    return n === null ? null : cond.cmp(amt.prizesLeft(m[1] === "you" ? "me" : "opp"), "==", n);
  }
  m = /^(.+?) has (\w+) or more damage counters on it$/.exec(t);
  if (m) {
    const r = pokemonRef(m[1] as string, inAttack);
    const n = num(m[2]);
    return r && n !== null ? cond.cmp(amt.counters(r), ">=", n) : null;
  }
  // "this Pokémon has no Voltaic {L} Energy attached", "your Benched Pokémon have any Shadowy {D} Energy attached"
  m =
    /^(.+?) (?:has|have) (no|any) ([A-Z][\w'.-]*(?: [A-Z{][\w'.{}-]*)* (?:Energy|Capsule|Band|Belt|Charm|Cape|Helmet))(?: cards?)? attached$/.exec(
      t,
    );
  if (m && !/^(?:Basic|Special)\b/.test(m[3] as string) && !/^\{[A-Z]\} Energy$/.test(m[3] as string)) {
    const name = cardName(m[3] as string);
    const r = pokemonRef(m[1] as string, inAttack);
    if (r) return m[2] === "no" ? cond.not(cond.matches(r, { attachedNamed: name })) : cond.matches(r, { attachedNamed: name });
    const sc = scopePhrase(m[1] as string);
    if (sc && m[2] === "any") return cond.exists({ ...sc, filter: { ...sc.filter, attachedNamed: name } });
  }
  m = /^(.+?) has full HP$/.exec(t);
  if (m) {
    const r = pokemonRef(m[1] as string, inAttack);
    return r ? cond.cmp(amt.counters(r), "==", 0) : null;
  }
  return null;
}
