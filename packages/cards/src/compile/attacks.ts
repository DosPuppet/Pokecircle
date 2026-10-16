/**
 * Attack texts. The attack's printed damage (`mainDamage`) goes after the "pre" effects (damage modifiers, coin flips
 * deciding them, "this attack does nothing") and before the others (R-ATTACK-3, R-ATTACK-4).
 */
import type { AttackDef, Condition, Effect, EType } from "@pokecircle/engine";
import { amt, cond, fx, msg, ref, scope } from "@pokecircle/engine";
import { COMMON, type Ctx, chooseIn } from "./effects";
import { cardFilter, condPhrase, eachPhrase, num, pokemonFilter, pokemonRef, scopePhrase, typeSym } from "./phrases";
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

/** "Discard the top 6 cards of your deck, and this attack does 100 damage for each Basic {W} Energy card (that) you discarded…" */
function millForDamage(w: string | undefined, n: string | undefined, what: string): Built | null {
  const k = num(w);
  const f = cardFilter(what);
  if (!k || !f) return null;
  return pre(
    { op: "mill", side: "me", n: k, store: "m" },
    fx.chooseCards("discard", "w", msg("Cards discarded in this way"), {
      among: "m",
      ...(f.filter ? { filter: f.filter } : {}),
      min: 0,
      max: k,
      random: true,
    }),
    fx.setDamage(amt.mul(Number(n), amt.count("w"))),
  );
}

/** "Discard up to 2 {M} Energy from this Pokémon. This attack does 120 damage for each card you discarded in this way." */
function discardSelfForDamage(w: string | undefined, what: string | undefined, n: string | undefined): Built | null {
  const k = num(w);
  const m = /^(?:(\{[A-Z]\}) )?Energy(?: cards?)?$/.exec((what ?? "").trim());
  const type = m?.[1] ? typeSym(m[1]) : undefined;
  if (!k || !m || type === null) return null;
  const opts = type ? { types: [type] } : {};
  return pre(
    {
      op: "chooseNumber",
      min: 0,
      max: amt.min(k, amt.energy(ref.self, type ? { type } : {})),
      store: "k",
      prompt: msg("How many Energy do you discard?"),
    },
    fx.discardEnergy(ref.self, amt.v("k"), opts),
    fx.setDamage(amt.mul(Number(n), amt.v("k"))),
  );
}

/** "Discard up to 2 Energy cards from your hand, and this attack does 60 (more) damage for each card you discarded…" */
function discardForDamage(w: string | undefined, what: string | undefined, n: string | undefined, more: boolean): Built | null {
  const k = num(w);
  const f = cardFilter(what as string);
  if (!k || !f) return null;
  const total = amt.mul(Number(n), amt.count("d"));
  return pre(
    fx.chooseCards("hand", "d", msg("Choose cards to discard from your hand"), {
      ...(f.filter ? { filter: f.filter } : {}),
      min: 0,
      max: k,
    }),
    fx.move("d", "discard"),
    more ? fx.bonus(total) : fx.setDamage(total),
  );
}

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
  tpl("first.notIfSecond", "If you go second, you can't use this attack during your first turn.", () => ({
    useCondition: cond.not(cond.and(cond.not({ c: "wentFirst" }), { c: "firstTurn" })),
  })),
  tpl("first.onlySecond", "You can use this attack only if you go second, and only during your first turn.", () => ({
    useCondition: cond.and(cond.not({ c: "wentFirst" }), { c: "firstTurn" }),
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
    "does.perTypedEnergy",
    "This attack does {n} damage to {w} of {X} for each {t} Energy attached to this Pokémon.",
    ([n, w, who, t]) => {
      const k = num(w);
      const sc = scopePhrase(who as string);
      const type = typeSym(t);
      if (!k || !sc || !type) return null;
      return {
        post: [
          chooseIn(sc, "t", { min: k, max: k }),
          fx.damage(ref.v("t"), amt.mul(Number(n), amt.energy(ref.self, { units: true, type }))),
        ],
        noMain: true,
      };
    },
  ),
  tpl(
    "dmg.oppHandEach",
    "Your opponent reveals their hand, and this attack does {n} damage for each {x} you find there.",
    ([n, what]) => {
      const f = cardFilter(what as string);
      if (!f) return null;
      return pre({ op: "revealHand", side: "opp" }, fx.setDamage(amt.mul(Number(n), amt.cards("hand", "opp", f.filter))));
    },
  ),
  tpl("does.eachOfN", "This attack does {n} damage to each of {w} of {X}.", ([n, w, who]) => {
    const k = num(w);
    const sc = scopePhrase(who as string);
    if (!k || !sc) return null;
    return { post: [chooseIn(sc, "t", { min: k, max: k }), fx.damage(ref.v("t"), Number(n))], noMain: true };
  }),
  tpl(
    "discardThen.paralyze",
    "Discard {w} Energy from this Pokémon, and your opponent's Active Pokémon is now Paralyzed.",
    ([w]) => {
      const k = num(w);
      return k ? post(fx.discardEnergy(ref.self, k), fx.condition(ref.defending, "paralyzed")) : null;
    },
  ),
  tpl(
    "may.discardParalyze",
    "You may discard {w} {t} Energy from this Pokémon and make your opponent's Active Pokémon Paralyzed.",
    ([w, t]) => {
      const k = num(w);
      const type = typeSym(t);
      if (!k || !type) return null;
      return post(
        fx.if(cond.cmp(amt.energy(ref.self, { type }), ">=", k), [
          fx.may(msg("Discard Energy to make the opponent's Active Pokémon Paralyzed?"), [
            fx.discardEnergy(ref.self, k, { types: [type] }),
            fx.condition(ref.defending, "paralyzed"),
          ]),
        ]),
      );
    },
  ),
  tpl(
    "discardAll.counters",
    "Discard all Energy from this Pokémon and put {w} damage counters on 1 of your opponent's Pokémon.",
    ([w]) => {
      const k = num(w);
      return k
        ? {
            post: [
              fx.discardEnergy(ref.self, "all"),
              chooseIn(scope.theirs(), "t", { min: 1, max: 1 }),
              fx.counters(ref.v("t"), k),
            ],
          }
        : null;
    },
  ),
  tpl("ko.oneOf", "Knock Out 1 of your opponent's Pokémon.", () => ({
    post: [chooseIn(scope.theirs(), "t", { min: 1, max: 1 }), { op: "knockOut", target: ref.v("t") }],
  })),
  tpl(
    "next.attackMore",
    "During your next turn, this Pokémon's {x} attack does {n} more damage (before applying Weakness and Resistance).",
    ([name, n]) =>
      post(
        fx.timed(
          "yourNextTurn",
          { s: "dealt", scope: scope.self(), add: Number(n), activeOnly: true, attack: name as string },
          ref.self,
        ),
      ),
  ),
  tpl(
    "discardThen.alsoBench",
    "Discard {x} Energy from this Pokémon, and this attack also does {n} damage to 1 of your opponent's Benched Pokémon.",
    ([w, n]) => {
      const k = w === "all" ? "all" : num(w);
      return k
        ? post(
            fx.discardEnergy(ref.self, k),
            fx.if(cond.exists(scope.oppBench()), [
              chooseIn(scope.oppBench(), "t", { min: 1, max: 1 }),
              fx.damage(ref.v("t"), Number(n)),
            ]),
          )
        : null;
    },
  ),
  tpl(
    "dmg.discardSelfEach",
    "Discard up to {w} {X} from this Pokémon. This attack does {n} damage for each card you discarded in this way.",
    ([w, what, n]) => discardSelfForDamage(w, what, n),
  ),
  tpl(
    "dmg.discardSelfEachAnd",
    "Discard up to {w} {X} from this Pokémon, and this attack does {n} damage for each card you discarded in this way.",
    ([w, what, n]) => discardSelfForDamage(w, what, n),
  ),
  tpl(
    "cost.discardHandOrNothing",
    "Discard {w} {x} from your hand. If you can't discard {w} cards in this way, this attack does nothing.",
    ([w, what, w2]) => {
      const k = num(w);
      const f = cardFilter(what as string);
      if (!k || num(w2) !== k || !f) return null;
      return pre(
        fx.if(
          cond.hasCards("hand", "me", f.filter, k),
          [
            fx.chooseCards("hand", "d", msg("Choose cards to discard from your hand"), {
              ...(f.filter ? { filter: f.filter } : {}),
              min: k,
              max: k,
            }),
            fx.move("d", "discard"),
          ],
          [{ op: "attackFails" }],
        ),
      );
    },
  ),
  tpl(
    "may.selfDamageParalyze",
    "You may have this Pokémon also do {n} damage to itself and make your opponent's Active Pokémon Paralyzed.",
    ([n]) =>
      post(
        fx.may(msg("Do damage to this Pokémon to make the opponent's Active Pokémon Paralyzed?"), [
          fx.damage(ref.self, Number(n)),
          fx.condition(ref.defending, "paralyzed"),
        ]),
      ),
  ),
  tpl(
    "discardThen.eachOfN",
    "Discard {w} Energy from this Pokémon, and this attack does {n} damage to each of {w} of {X}.",
    ([w, n, w2, who]) => {
      const k = num(w);
      const j = num(w2);
      const sc = scopePhrase(who as string);
      if (!k || !j || !sc) return null;
      return {
        post: [fx.discardEnergy(ref.self, k), chooseIn(sc, "t", { min: j, max: j }), fx.damage(ref.v("t"), Number(n))],
        noMain: true,
      };
    },
  ),
  tpl(
    "dmg.millEach",
    "Discard the top {w} cards of your deck, and this attack does {n} damage for each {x} you discarded in this way.",
    ([w, n, what]) => millForDamage(w, n, (what as string).replace(/ that$/, "")),
  ),
  tpl(
    "dmg.discardAnyFromPokemon",
    "Discard any amount of {t} Energy from among your Pokémon, and this attack does {n} damage for each card you discarded in this way.",
    ([t, n]) => {
      const type = typeSym(t);
      if (!type) return null;
      return pre(
        {
          op: "discardEnergyFrom",
          scope: scope.mine(),
          min: 0,
          max: 60,
          types: [type],
          store: "d",
          prompt: msg("Choose Energy to discard"),
        },
        fx.setDamage(amt.mul(Number(n), amt.v("d"))),
      );
    },
  ),
  tpl("may.costForMore", "You may {x} and have this attack do {n} more damage.", ([action, n]) => {
    const a = action as string;
    const e =
      a === "discard all Energy from this Pokémon"
        ? fx.discardEnergy(ref.self, "all")
        : a === "shuffle all Energy attached to this Pokémon into your deck"
          ? fx.discardEnergy(ref.self, "all", { to: "deck" })
          : a === "put all Energy attached to this Pokémon into your hand"
            ? fx.discardEnergy(ref.self, "all", { to: "hand" })
            : null;
    if (!e) return null;
    const shuffle = a.includes("into your deck") ? [fx.shuffle()] : [];
    return pre(
      fx.if(cond.cmp(amt.energy(ref.self), ">", 0), [fx.may(msg("Do more damage?"), [e, ...shuffle, fx.bonus(Number(n))])]),
    );
  }),
  tpl("dmg.baseIs", "If {x}, this attack's base damage is {n}.", ([c, n], ctx) => {
    const k = condPhrase(c as string, ctx.inAttack);
    return k ? pre(fx.if(k, [fx.setDamage(Number(n))])) : null;
  }),
  tpl(
    "ko.ifSelfAttack",
    "If your opponent's Pokémon is Knocked Out by damage from this attack, during your opponent's next turn, prevent all damage from and effects of attacks done to this Pokémon.",
    () =>
      post(
        fx.if(cond.matches(ref.defending, { maxRemainingHp: 0 }), [
          fx.timed("opponentsNextTurn", { s: "prevent", scope: scope.self(), what: "all" }, ref.self),
        ]),
      ),
  ),
  tpl(
    "ko.exactCounters",
    "If your opponent's Active Pokémon has exactly {w} damage counters on it, that Pokémon is Knocked Out.",
    ([w]) => {
      const k = num(w);
      return k ? post(fx.if(cond.cmp(amt.counters(ref.defending), "==", k), [{ op: "knockOut", target: ref.defending }])) : null;
    },
  ),
  tpl("cost.alt", "If {x}, this attack can be used for {X}.", ([c, cost], ctx) => {
    const k = condPhrase(c as string, ctx.inAttack);
    const types = (cost as string).match(/\{[A-Z]\}/g)?.map((x) => typeSym(x));
    if (!k || !types || types.some((x) => !x) || types.join("").length === 0 || (cost as string).replace(/\{[A-Z]\}/g, "") !== "")
      return null;
    return { altCost: { cost: types as EType[], cond: k } };
  }),
  tpl(
    "first.prizeRange",
    "If your opponent doesn't have exactly {w} or {w} Prize cards remaining, this attack does nothing.",
    ([a, b]) => {
      const x = num(a);
      const y = num(b);
      if (x === null || y === null) return null;
      const left = amt.prizesLeft("opp");
      return pre(fx.if(cond.and(cond.cmp(left, "!=", x), cond.cmp(left, "!=", y)), [{ op: "attackFails" }]));
    },
  ),
  tpl(
    "dmg.discardFromHand",
    "Discard up to {w} {x} from your hand, and this attack does {n} damage for each card you discarded in this way.",
    ([w, what, n]) => discardForDamage(w, what, n, false),
  ),
  tpl(
    "dmg.mayDiscardFromHand",
    "You may discard up to {w} {x} from your hand, and this attack does {n} more damage for each card you discarded in this way.",
    ([w, what, n]) => discardForDamage(w, what, n, true),
  ),
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
    "opp.attackFlip2",
    "During your opponent's next turn, if the Defending Pokémon tries to use an attack, your opponent flips 2 coins. If either of them is tails, that attack doesn't happen.",
    () => post(fx.timed("opponentsNextTurn", { s: "attackFlip", scope: scope.oppActive(), coins: 2 }, ref.defending)),
  ),
  tpl(
    "opp.cantAttach",
    "During your opponent's next turn, Energy can't be attached from your opponent's hand to the Defending Pokémon.",
    () => post(fx.timed("opponentsNextTurn", { s: "cantAttach", scope: scope.oppActive() }, ref.defending)),
  ),
  tpl(
    "opp.lockAttack",
    "Choose 1 of your opponent's Active Pokémon's attacks. During your opponent's next turn, that Pokémon can't use that attack.",
    () =>
      post({
        op: "lockAttack",
        target: ref.defending,
        duration: "opponentsNextTurn",
        prompt: msg("Choose an attack of your opponent's Active Pokémon"),
      }),
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
  altCost?: { cost: EType[]; cond: Condition };
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
  // Only explicit restrictions: what makes an effect possible ("search your deck") never stops the attack.
  const conds = m.parts.flatMap((p) => (p.useCondition ? [p.useCondition] : []));
  if (conds.length) out.condition = conds.length === 1 ? (conds[0] as Condition) : cond.and(...conds);
  if (m.parts.some((p) => p.firstTurn)) out.firstTurn = true;
  const alt = m.parts.find((p) => p.altCost)?.altCost;
  if (alt) out.altCost = alt;
  return out;
}
