/**
 * Attack texts. The attack's printed damage (`mainDamage`) goes after the "pre" effects (damage modifiers, coin flips
 * deciding them, "this attack does nothing") and before the others (R-ATTACK-3, R-ATTACK-4).
 */
import type { AttackDef, Condition, Effect } from "@pokecircle/engine";
import { amt, cond, fx, msg, ref, scope } from "@pokecircle/engine";
import { COMMON, type Ctx, chooseIn } from "./effects";
import { condPhrase, eachPhrase, num, pokemonFilter, pokemonRef, scopePhrase } from "./phrases";
import { type Built, matchAll, sentence, type Template, tpl } from "./templates";

const pre = (...effects: Effect[]): Built => ({ pre: effects });
const post = (...effects: Effect[]): Built => ({ post: effects });

/** One clause inside "If heads, …": compiled alone, it must be a single template. */
function clause(text: string, ctx: Ctx): Built | null {
  const m = matchAll(sentence(text), ATTACK_TEMPLATES, ctx);
  if ("unmatched" in m || m.parts.length !== 1) return null;
  return m.parts[0] as Built;
}

/** The damage options of a `mainDamage` (Weakness, Resistance, effects on the Defending Pokémon). */
function withDamageOptions(o: Extract<Effect, { op: "mainDamage" }>) {
  const out: { noWR?: boolean; noWeakness?: boolean; noResistance?: boolean; ignoreEffects?: boolean } = {};
  if (o.noWR) out.noWR = true;
  if (o.noWeakness) out.noWeakness = true;
  if (o.noResistance) out.noResistance = true;
  if (o.ignoreEffects) out.ignoreEffects = true;
  return Object.keys(out).length ? out : null;
}

/** Repeats a clause's effects ("For each heads, …"). */
function repeated(n: Parameters<typeof fx.repeat>[0], b: Built): Built {
  const out: Built = {};
  if (b.pre?.length) out.pre = [fx.repeat(n, b.pre)];
  if (b.post?.length) out.post = [fx.repeat(n, b.post)];
  return out;
}

/** Wraps a clause's effects in a condition; `before` (a flip) goes first. */
function guarded(c: Parameters<typeof fx.if>[0], b: Built, before: Effect[] = []): Built {
  const preIf = b.pre?.length ? [fx.if(c, b.pre)] : [];
  const postIf = b.post?.length ? [fx.if(c, b.post)] : [];
  if (preIf.length) return postIf.length ? { pre: [...before, ...preIf], post: postIf } : { pre: [...before, ...preIf] };
  return { post: [...before, ...postIf] };
}

const own = (who: string) => /^this Pokémon$/.test(who);

export const ATTACK_TEMPLATES: Template<Ctx>[] = [
  // —— damage modifiers ——
  tpl("dmg.moreEach", "This attack does {n} more damage for each {x}.", ([n, what], ctx) => {
    const a = eachPhrase(what as string, ctx.inAttack);
    return a ? pre(fx.bonus(amt.mul(Number(n), a))) : null;
  }),
  tpl("dmg.each", "This attack does {n} damage for each {x}.", ([n, what], ctx) => {
    const a = eachPhrase(what as string, ctx.inAttack);
    return a ? pre(fx.setDamage(amt.mul(Number(n), a))) : null;
  }),
  tpl("dmg.lessEach", "This attack does {n} less damage for each {x}.", ([n, what], ctx) => {
    const a = eachPhrase(what as string, ctx.inAttack);
    return a ? pre(fx.less(amt.mul(Number(n), a))) : null;
  }),
  tpl("dmg.more", "This attack does {n} more damage.", ([n]) => pre(fx.bonus(Number(n)))),
  tpl("dmg.if", "If {x}, this attack does {n} more damage.", ([c, n], ctx) => {
    const k = condPhrase(c as string, ctx.inAttack);
    return k ? pre(fx.if(k, [fx.bonus(Number(n))])) : null;
  }),
  tpl("dmg.ifLess", "If {x}, this attack does {n} less damage.", ([c, n], ctx) => {
    const k = condPhrase(c as string, ctx.inAttack);
    return k ? pre(fx.if(k, [fx.less(Number(n))])) : null;
  }),
  tpl("dmg.ifNothing", "If {x}, this attack does nothing.", ([c], ctx) => {
    const k = condPhrase(c as string, ctx.inAttack);
    return k ? pre(fx.if(k, [fx.fails()])) : null;
  }),
  tpl("dmg.noWR", "This attack's damage isn't affected by Weakness or Resistance.", () => ({
    mainOptions: { op: "mainDamage", noWR: true },
  })),
  tpl("dmg.noR", "This attack's damage isn't affected by Resistance.", () => ({
    mainOptions: { op: "mainDamage", noResistance: true },
  })),
  tpl("dmg.noW", "This attack's damage isn't affected by Weakness.", () => ({
    mainOptions: { op: "mainDamage", noWeakness: true },
  })),
  tpl(
    "dmg.extraEnergy",
    "If this Pokémon has at least {w} extra Energy attached (in addition to this attack's cost), this attack does {n} more damage.",
    ([w, n], ctx) => {
      const k = num(w);
      if (!k || ctx.cost === undefined) return null;
      return pre(fx.if(cond.cmp(amt.energy(ref.self, { units: true }), ">=", ctx.cost + k), [fx.bonus(Number(n))]));
    },
  ),
  tpl("dmg.noEffects", "This attack's damage isn't affected by any effects on your opponent's Active Pokémon.", () => ({
    mainOptions: { op: "mainDamage", ignoreEffects: true },
  })),
  tpl(
    "dmg.noWREffects",
    "This attack's damage isn't affected by Weakness or Resistance, or by any effects on your opponent's Active Pokémon.",
    () => ({
      mainOptions: { op: "mainDamage", noWR: true, ignoreEffects: true },
    }),
  ),
  // —— coins ——
  tpl("flip.nothing", "Flip a coin. If tails, this attack does nothing.", () =>
    pre(fx.flip(), fx.if(cond.tails(), [fx.fails()])),
  ),
  tpl("flip.coinsEach", "Flip {w} coins. This attack does {n} damage for each heads.", ([w, n]) => {
    const k = num(w);
    return k ? pre(fx.flip(k), fx.setDamage(amt.mul(Number(n), amt.heads()))) : null;
  }),
  tpl("flip.coinsMore", "Flip {w} coins. This attack does {n} more damage for each heads.", ([w, n]) => {
    const k = num(w);
    return k ? pre(fx.flip(k), fx.bonus(amt.mul(Number(n), amt.heads()))) : null;
  }),
  tpl("flip.untilEach", "Flip a coin until you get tails. This attack does {n} damage for each heads.", ([n]) =>
    pre(fx.flipUntilTails(), fx.setDamage(amt.mul(Number(n), amt.heads()))),
  ),
  tpl("flip.untilMore", "Flip a coin until you get tails. This attack does {n} more damage for each heads.", ([n]) =>
    pre(fx.flipUntilTails(), fx.bonus(amt.mul(Number(n), amt.heads()))),
  ),
  tpl("flip.bothTailsNothing", "Flip 2 coins. If both of them are tails, this attack does nothing.", () =>
    pre(fx.flip(2), fx.if(cond.cmp(amt.heads(), "==", 0), [fx.fails()])),
  ),
  tpl("flip.headsElse", "Flip a coin. If heads, {x}. If tails, {x}.", ([h, t], ctx) => {
    const a = clause(h as string, ctx);
    const b = clause(t as string, ctx);
    if (!a || !b) return null;
    const ga = guarded(cond.heads(), a, [fx.flip()]);
    const gb = guarded(cond.tails(), b);
    return { pre: [...(ga.pre ?? []), ...(gb.pre ?? [])], post: [...(ga.post ?? []), ...(gb.post ?? [])] };
  }),
  tpl("flip.heads", "Flip a coin. If heads, {x}.", ([h], ctx) => {
    const a = clause(h as string, ctx);
    return a ? guarded(cond.heads(), a, [fx.flip()]) : null;
  }),
  tpl("flip.tails", "Flip a coin. If tails, {x}.", ([h], ctx) => {
    const a = clause(h as string, ctx);
    return a ? guarded(cond.tails(), a, [fx.flip()]) : null;
  }),
  tpl("flip.coinsIfAll", "Flip {w} coins. If all of them are heads, {x}.", ([w, h], ctx) => {
    const k = num(w);
    const a = clause(h as string, ctx);
    return k && a ? guarded(cond.cmp(amt.heads(), "==", k), a, [fx.flip(k)]) : null;
  }),
  // —— coins as sentences of their own (the next sentences refer to the heads) ——
  tpl("flip.one", "Flip a coin.", () => pre(fx.flip())),
  tpl("flip.n", "Flip {w} coins.", ([w]) => {
    const k = num(w);
    return k ? pre(fx.flip(k)) : null;
  }),
  tpl("flip.until", "Flip a coin until you get tails.", () => pre(fx.flipUntilTails())),
  tpl("flip.forEach", "Flip a coin for each {x}.", ([what], ctx) => {
    const a = eachPhrase(what as string, ctx.inAttack);
    return a ? pre(fx.flip(a)) : null;
  }),
  tpl("heads.each", "For each heads, {x}.", ([c], ctx) => {
    const a = clause(c as string, ctx);
    return a ? repeated(amt.heads(), a) : null;
  }),
  tpl("tails.each", "For each tails, {x}.", ([c], ctx) => {
    const a = clause(c as string, ctx);
    return a ? repeated({ k: "tails" }, a) : null;
  }),
  tpl("heads.if", "If heads, {x}.", ([c], ctx) => {
    const a = clause(c as string, ctx);
    return a ? guarded(cond.heads(), a) : null;
  }),
  tpl("tails.if", "If tails, {x}.", ([c], ctx) => {
    const a = clause(c as string, ctx);
    return a ? guarded(cond.tails(), a) : null;
  }),
  tpl("heads.both", "If both of them are heads, {x}.", ([c], ctx) => {
    const a = clause(c as string, ctx);
    return a ? guarded(cond.cmp(amt.heads(), ">=", 2), a) : null;
  }),
  tpl("tails.both", "If both of them are tails, {x}.", ([c], ctx) => {
    const a = clause(c as string, ctx);
    return a ? guarded(cond.cmp(amt.heads(), "==", 0), a) : null;
  }),
  tpl("heads.all", "If all of them are heads, {x}.", ([c], ctx) => {
    const a = clause(c as string, ctx);
    return a ? guarded(cond.cmp({ k: "tails" }, "==", 0), a) : null;
  }),
  tpl("heads.any", "If any of them are heads, {x}.", ([c], ctx) => {
    const a = clause(c as string, ctx);
    return a ? guarded(cond.cmp(amt.heads(), ">", 0), a) : null;
  }),
  tpl("may.more", "You may do {n} more damage. If you do, {x}.", ([n, c], ctx) => {
    const a = clause(c as string, ctx);
    if (!a) return null;
    const did = cond.v("moreDamage");
    return {
      pre: [
        fx.may(msg("Do {n} more damage?", { n: Number(n) }), [fx.set("moreDamage", 1), fx.bonus(Number(n))]),
        ...(a.pre?.length ? [fx.if(did, a.pre)] : []),
      ],
      ...(a.post?.length ? { post: [fx.if(did, a.post)] } : {}),
    };
  }),
  tpl("if.generic", "If {x}, {x}.", ([c, h], ctx) => {
    const k = condPhrase(c as string, ctx.inAttack);
    const a = clause(h as string, ctx);
    return k && a ? guarded(k, a) : null;
  }),
  // —— damage to other Pokémon ——
  tpl("self.damage", "This Pokémon also does {n} damage to itself.", ([n]) => post(fx.damage(ref.self, Number(n)))),
  tpl("self.damageNoAlso", "This Pokémon does {n} damage to itself.", ([n]) => post(fx.damage(ref.self, Number(n)))),
  tpl("tools.before", "Before doing damage, discard all Pokémon Tools from your opponent's Active Pokémon.", () =>
    pre(fx.discardTools(ref.defending)),
  ),
  tpl("counters.untilHp", "Put damage counters on your opponent's Active Pokémon until its remaining HP is {n}.", ([n]) =>
    post(
      fx.counters(ref.defending, {
        k: "max",
        of: [0, { k: "div", a: amt.sub({ k: "remainingHp", on: ref.defending }, Number(n)), b: 10 }],
      }),
    ),
  ),
  tpl("heal.asDealt", "Heal from this Pokémon the same amount of damage you did to your opponent's Active Pokémon.", () =>
    post(fx.heal(ref.self, amt.v("mainDamage"))),
  ),
  tpl(
    "dmg.revenge",
    "If this Pokémon was damaged by an attack during your opponent's last turn, this attack does that much more damage.",
    () => pre(fx.bonus({ k: "damageTaken", on: ref.self })),
  ),
  tpl("first.ifFirst", "If you go first, you can use this attack during your first turn.", () => ({ firstTurn: true })),
  tpl("first.onlySecond", "You can use this attack only if you go second, and only during your first turn.", () => ({
    condition: cond.and(cond.not({ c: "wentFirst" }), { c: "firstTurn" }),
  })),
  tpl("also.eachBench", "This attack also does {n} damage to each Benched Pokémon (both yours and your opponent's).", ([n]) =>
    post(fx.damage(ref.all(scope.of("both", "bench")), Number(n))),
  ),
  tpl("does.perEnergy", "This attack does {n} damage to {w} of {X} for each Energy attached to this Pokémon.", ([n, w, who]) => {
    const k = num(w);
    const sc = scopePhrase(who as string);
    if (!k || !sc) return null;
    // The chosen Pokémon take N damage for each Energy (not one Pokémon for each Energy).
    return {
      post: [
        chooseIn(sc, "t", { min: k, max: k }),
        fx.damage(ref.v("t"), amt.mul(Number(n), amt.energy(ref.self, { units: true }))),
      ],
      noMain: true,
    };
  }),
  tpl(
    "does.discardThen",
    "Discard {x} Energy from this Pokémon, and this attack does {n} damage to {w} of {x}.",
    ([what, n, w, who]) => {
      const k = num(w);
      const sc = scopePhrase(who as string);
      const count = what === "all" ? "all" : num(what as string);
      if (!k || !sc || count === null) return null;
      return {
        post: [fx.discardEnergy(ref.self, count), chooseIn(sc, "t", { min: k, max: k }), fx.damage(ref.v("t"), Number(n))],
        noMain: true,
      };
    },
  ),
  tpl("does.oneOfPlain", "This attack does {n} damage to {w} of {x}.", ([n, w, who]) => {
    const k = num(w);
    const sc = scopePhrase(who as string);
    if (!k || !sc) return null;
    return { post: [chooseIn(sc, "t", { min: k, max: k }), fx.damage(ref.v("t"), Number(n))], noMain: true };
  }),
  tpl("also.bench", "This attack also does {n} damage to {w} of {x}.", ([n, w, who]) => {
    const k = num(w);
    const sc = scopePhrase(who as string);
    if (!k || !sc) return null;
    return post(chooseIn(sc, "t", { min: k, max: k }), fx.damage(ref.v("t"), Number(n)));
  }),
  tpl("also.each", "This attack also does {n} damage to each of {x}.", ([n, who]) => {
    const sc = scopePhrase(who as string);
    return sc ? post(fx.damage(ref.all(sc), Number(n))) : null;
  }),
  tpl("does.oneOf", "This attack does {n} damage to {w} of {x}.", ([n, w, who]) => {
    const k = num(w);
    const sc = scopePhrase(who as string);
    if (!k || !sc) return null;
    return { post: [chooseIn(sc, "t", { min: k, max: k }), fx.damage(ref.v("t"), Number(n))], noMain: true };
  }),
  tpl("does.each", "This attack does {n} damage to each of {x}.", ([n, who]) => {
    const sc = scopePhrase(who as string);
    return sc ? { post: [fx.damage(ref.all(sc), Number(n))], noMain: true } : null;
  }),
  tpl("does.newActive", "This attack does {n} damage to the new Active Pokémon.", ([n]) => ({
    post: [fx.damage(ref.oppActive, Number(n))],
    noMain: true,
  })),
  // —— timed effects ——
  tpl("next.cantAttack", "During your next turn, this Pokémon can't attack.", () =>
    post(fx.timed("yourNextTurn", { s: "cantAttack", scope: scope.self() }, ref.self)),
  ),
  tpl("next.cantUseAttacks", "During your next turn, this Pokémon can't use attacks.", () =>
    post(fx.timed("yourNextTurn", { s: "cantAttack", scope: scope.self() }, ref.self)),
  ),
  tpl("next.cantUse", "During your next turn, this Pokémon can't use {x}.", ([name]) =>
    name === "attacks"
      ? null
      : post(fx.timed("yourNextTurn", { s: "cantAttack", scope: scope.self(), attack: name as string }, ref.self)),
  ),
  tpl("opp.cantRetreat", "During your opponent's next turn, {x} can't retreat.", ([who], ctx) => {
    const r = pokemonRef(who as string, ctx.inAttack);
    return r && !own(who as string)
      ? post(fx.timed("opponentsNextTurn", { s: "cantRetreat", scope: scope.oppActive() }, r))
      : null;
  }),
  tpl("opp.cantUseAttacks", "During your opponent's next turn, {x} can't use attacks.", ([who], ctx) => {
    const r = pokemonRef(who as string, ctx.inAttack);
    return r && !own(who as string)
      ? post(fx.timed("opponentsNextTurn", { s: "cantAttack", scope: scope.oppActive() }, r))
      : null;
  }),
  tpl(
    "opp.attackFlip",
    "During your opponent's next turn, if the Defending Pokémon tries to use an attack, your opponent flips a coin. If tails, that attack doesn't happen.",
    () => post(fx.timed("opponentsNextTurn", { s: "attackFlip", scope: scope.oppActive() }, ref.defending)),
  ),
  tpl(
    "opp.preventFrom",
    "During your opponent's next turn, prevent all damage done to this Pokémon by attacks from {x}.",
    ([x]) => {
      const f = pokemonFilter(x as string);
      return f
        ? post(fx.timed("opponentsNextTurn", { s: "prevent", scope: scope.self(), what: "damage", from: f }, ref.self))
        : null;
    },
  ),
  tpl(
    "opp.preventUpTo",
    "During your opponent's next turn, prevent all damage done to this Pokémon by attacks if that damage is {n} or less.",
    ([n]) =>
      post(fx.timed("opponentsNextTurn", { s: "prevent", scope: scope.self(), what: "damage", maxDamage: Number(n) }, ref.self)),
  ),
  tpl(
    "next.moreDamage",
    "During your next turn, attacks used by this Pokémon do {n} more damage to your opponent's Active Pokémon (before applying Weakness and Resistance).",
    ([n]) => post(fx.timed("yourNextTurn", { s: "dealt", scope: scope.self(), add: Number(n), activeOnly: true }, ref.self)),
  ),
  tpl(
    "next.defendingTakesMore",
    "During your next turn, the Defending Pokémon takes {n} more damage from attacks (after applying Weakness and Resistance).",
    ([n]) => post(fx.timed("yourNextTurn", { s: "taken", scope: scope.oppActive(), add: Number(n) }, ref.defending)),
  ),
  tpl("next.cantRetreat", "During your next turn, this Pokémon can't retreat.", () =>
    post(fx.timed("yourNextTurn", { s: "cantRetreat", scope: scope.self() }, ref.self)),
  ),
  tpl("opp.cantAttack", "During your opponent's next turn, {x} can't attack.", ([who], ctx) => {
    const r = pokemonRef(who as string, ctx.inAttack);
    return r && !own(who as string)
      ? post(fx.timed("opponentsNextTurn", { s: "cantAttack", scope: scope.oppActive() }, r))
      : null;
  }),
  tpl(
    "opp.lessDamage",
    "During your opponent's next turn, this Pokémon takes {n} less damage from attacks (after applying Weakness and Resistance).",
    ([n]) => post(fx.timed("opponentsNextTurn", { s: "taken", scope: scope.self(), add: -Number(n) }, ref.self)),
  ),
  tpl(
    "opp.preventAll",
    "During your opponent's next turn, prevent all damage from and effects of attacks done to this Pokémon.",
    () => post(fx.timed("opponentsNextTurn", { s: "prevent", scope: scope.self(), what: "all" }, ref.self)),
  ),
  tpl("opp.preventDamage", "During your opponent's next turn, prevent all damage done to this Pokémon by attacks.", () =>
    post(fx.timed("opponentsNextTurn", { s: "prevent", scope: scope.self(), what: "damage" }, ref.self)),
  ),
  tpl(
    "opp.defendingLess",
    "During your opponent's next turn, attacks used by the Defending Pokémon do {n} less damage (before applying Weakness and Resistance).",
    ([n]) => post(fx.timed("opponentsNextTurn", { s: "dealt", scope: scope.oppActive(), add: -Number(n) }, ref.defending)),
  ),
  // —— misc ——
  ...COMMON,
];

export interface CompiledAttack {
  effects: Effect[];
  templates: string[];
  /** "You can use this attack only if…". */
  condition?: Condition;
  firstTurn?: boolean;
}

/** Compiles an attack's text; null when a part of it is not understood (it then needs a script). */
export function compileAttack(a: AttackDef, name?: string): CompiledAttack | { unmatched: string } {
  const hasDamage = a.damage > 0 || !!a.suffix;
  if (!a.text) return { effects: hasDamage ? [fx.main()] : [], templates: [] };
  const m = matchAll(a.text, ATTACK_TEMPLATES, { inAttack: true, cost: a.cost.length, ...(name ? { name } : {}) });
  if ("unmatched" in m) return m;
  const preFx = m.parts.flatMap((p) => p.pre ?? []);
  const postFx = m.parts.flatMap((p) => p.post ?? []);
  const options = m.parts.find((p) => p.mainOptions)?.mainOptions;
  const noMain = m.parts.some((p) => p.noMain);
  const main: Effect[] = hasDamage && !noMain ? [options ?? fx.main()] : [];
  // "This attack does 60 damage to each of your opponent's Pokémon ex. This attack's damage isn't affected by Weakness
  // or Resistance.": without main damage, the options go to the attack's damage ops.
  const flags = options ? withDamageOptions(options) : null;
  const apply = (e: Effect): Effect => (flags && noMain && e.op === "damage" ? { ...e, ...flags } : e);
  const out: CompiledAttack = { effects: [...preFx.map(apply), ...main, ...postFx.map(apply)], templates: m.ids };
  const conds = m.parts.flatMap((p) => (p.condition ? [p.condition] : []));
  if (conds.length) out.condition = conds.length === 1 ? (conds[0] as Condition) : cond.and(...conds);
  if (m.parts.some((p) => p.firstTurn)) out.firstTurn = true;
  return out;
}
