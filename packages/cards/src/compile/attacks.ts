/**
 * Attack texts. The attack's printed damage (`mainDamage`) goes after the "pre" effects (damage modifiers, coin flips
 * deciding them, "this attack does nothing") and before the others (R-ATTACK-3, R-ATTACK-4).
 */
import type { AttackDef, Effect } from "@pokecircle/engine";
import { amt, cond, fx, ref, scope } from "@pokecircle/engine";
import { COMMON, type Ctx, chooseIn } from "./effects";
import { condPhrase, eachPhrase, num, pokemonRef, scopePhrase } from "./phrases";
import { type Built, matchAll, sentence, type Template, tpl } from "./templates";

const pre = (...effects: Effect[]): Built => ({ pre: effects });
const post = (...effects: Effect[]): Built => ({ post: effects });

/** One clause inside "If heads, …": compiled alone, it must be a single template. */
function clause(text: string, ctx: Ctx): Built | null {
  const m = matchAll(sentence(text), ATTACK_TEMPLATES, ctx);
  if ("unmatched" in m || m.parts.length !== 1) return null;
  return m.parts[0] as Built;
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
  tpl("if.generic", "If {x}, {x}.", ([c, h], ctx) => {
    const k = condPhrase(c as string, ctx.inAttack);
    const a = clause(h as string, ctx);
    return k && a ? guarded(k, a) : null;
  }),
  // —— damage to other Pokémon ——
  tpl("self.damage", "This Pokémon also does {n} damage to itself.", ([n]) => post(fx.damage(ref.self, Number(n)))),
  tpl(
    "also.bench",
    "This attack also does {n} damage to {w} of {X}. (Don't apply Weakness and Resistance for Benched Pokémon.)",
    ([n, w, who]) => {
      const k = num(w);
      const sc = scopePhrase(who as string);
      if (!k || !sc) return null;
      return post(chooseIn(sc, "t", { min: k, max: k }), fx.damage(ref.v("t"), Number(n)));
    },
  ),
  tpl(
    "also.each",
    "This attack also does {n} damage to each of {X}. (Don't apply Weakness and Resistance for Benched Pokémon.)",
    ([n, who]) => {
      const sc = scopePhrase(who as string);
      return sc ? post(fx.damage(ref.all(sc), Number(n))) : null;
    },
  ),
  tpl(
    "does.oneOf",
    "This attack does {n} damage to {w} of {X}. (Don't apply Weakness and Resistance for Benched Pokémon.)",
    ([n, w, who]) => {
      const k = num(w);
      const sc = scopePhrase(who as string);
      if (!k || !sc) return null;
      return { post: [chooseIn(sc, "t", { min: k, max: k }), fx.damage(ref.v("t"), Number(n))], noMain: true };
    },
  ),
  tpl(
    "does.each",
    "This attack does {n} damage to each of {X}. (Don't apply Weakness and Resistance for Benched Pokémon.)",
    ([n, who]) => {
      const sc = scopePhrase(who as string);
      return sc ? { post: [fx.damage(ref.all(sc), Number(n))], noMain: true } : null;
    },
  ),
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
  return { effects: [...preFx, ...main, ...postFx], templates: m.ids };
}
