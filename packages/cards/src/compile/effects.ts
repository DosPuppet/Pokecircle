/**
 * Templates shared by attacks, Abilities and Trainer cards: effects on Pokémon, cards, Energy and the board. `inAttack`
 * says whether "your opponent's Active Pokémon" is the Defending Pokémon.
 */
import type { CardFilter, Effect, EType, PokemonScope } from "@pokecircle/engine";
import { amt, cond, fx, msg, ref, scope, searchToBench } from "@pokecircle/engine";
import { cardFilter, countPhrase, num, pokemonRef, scopePhrase, status, typeSym } from "./phrases";
import { type Built, matchAll, sentence, type Template, tpl } from "./templates";

export interface Ctx {
  inAttack: boolean;
  /** The card's English name ("a card that evolves from this Pokémon"). */
  name?: string;
  /** The attack's cost (number of Energy symbols: "extra Energy … in addition to this attack's cost"). */
  cost?: number;
}

const post = (...effects: Effect[]): Built => ({ post: effects });

/** "1 of your opponent's Benched Pokémon" → a choice stored in `key`. */
export function chooseIn(sc: PokemonScope, key: string, count: { min: number; max: number }): Effect {
  const prompt =
    sc.side === "opp"
      ? sc.where === "bench"
        ? msg("Choose your opponent's Benched Pokémon")
        : msg("Choose your opponent's Pokémon")
      : sc.where === "bench"
        ? msg("Choose your Benched Pokémon")
        : msg("Choose your Pokémon");
  return fx.choosePokemon(sc, key, prompt, { min: count.min, max: count.max });
}

const SEARCH_PROMPT = () => msg("Choose cards from your deck");

/** A deck search can be done; onto the Bench, a free place is needed too (R-TEXT-3). */
function benchDest(dest: string) {
  return /onto your Bench/.test(dest) ? cond.and(cond.deck(), cond.cmp(amt.benchSpace(), ">", 0)) : cond.deck();
}

/** Where found cards go: "put it into your hand", "put them onto your Bench", "attach it to this Pokémon". */
function searchEffects(count: { min: number; max: number }, what: string, dest: string, ctx: Ctx): Effect[] | null {
  const f = cardFilter(what);
  if (!f) return null;
  const filter: CardFilter | undefined = f.filter;
  if (/^put (?:it|them) into your hand$/.test(dest))
    return [
      fx.chooseCards("deck", "found", SEARCH_PROMPT(), {
        ...(filter ? { filter } : {}),
        min: 0,
        max: count.max,
        reveal: !!filter,
      }),
      fx.move("found", "hand"),
      fx.shuffle(),
    ];
  if (/^put (?:it|them) onto your Bench$/.test(dest)) return searchToBench(filter ?? {}, count.max, SEARCH_PROMPT());
  const att = /^attach (?:it|them) to (.+)$/.exec(dest);
  if (att && filter?.category?.[0] === "energy") {
    const target = att[1] as string;
    const to = attachScope(target, ctx);
    if (!to) return null;
    return [
      fx.chooseCards("deck", "found", SEARCH_PROMPT(), { filter, min: 0, max: count.max }),
      fx.attach("found", to),
      fx.shuffle(),
    ];
  }
  return null;
}

/** "this Pokémon", "1 of your Benched Pokémon", "your Pokémon in any way you like", "your Benched Pokémon in any way you like". */
function attachScope(target: string, _ctx: Ctx): PokemonScope | null {
  if (target === "this Pokémon") return scope.self();
  if (/^1 of your Benched Pokémon$/.test(target)) return scope.myBench();
  if (/^1 of your Pokémon$/.test(target)) return scope.mine();
  if (/^your Pokémon in any way you like$/.test(target)) return scope.mine();
  if (/^your Benched Pokémon in any way you like$/.test(target)) return scope.myBench();
  if (/^your Active Pokémon$/.test(target)) return scope.myActive();
  const typed = /^1 of your (Benched )?(\{[A-Z]\}) Pokémon$/.exec(target);
  if (typed) {
    const t = typeSym(typed[2]);
    return t ? scope.of("me", typed[1] ? "bench" : "any", { types: [t] }) : null;
  }
  return null;
}

function typesOf(s: string | undefined): EType[] | undefined | null {
  if (!s) return undefined;
  const t = typeSym(s.trim());
  return t ? [t] : null;
}

export const COMMON: Template<Ctx>[] = [
  // —— the Pokémon itself ——
  tpl("self.toHand", "Put this Pokémon and all attached cards into your hand.", () => post(fx.pokemonTo(ref.self, "hand"))),
  tpl("self.toDeck", "Shuffle this Pokémon and all attached cards into your deck.", () =>
    post(fx.pokemonTo(ref.self, "deck"), fx.shuffle()),
  ),
  tpl("self.energyToHand", "Put an Energy attached to this Pokémon into your hand.", () =>
    post(fx.discardEnergy(ref.self, 1, { to: "hand" })),
  ),
  tpl("draw.thenIf", "Draw {w} cards. If you drew any cards in this way, {x}.", ([n, rest], ctx) => {
    const k = num(n);
    const m = matchAll(sentence(rest as string), COMMON, ctx);
    if (!k || "unmatched" in m) return null;
    return post(
      fx.draw(k, undefined, "drawn"),
      fx.if(
        cond.cmp(amt.v("drawn"), ">", 0),
        m.parts.flatMap((p) => [...(p.pre ?? []), ...(p.post ?? [])]),
      ),
    );
  }),
  tpl("hand.discardDraw", "Discard your hand and draw {w} cards.", ([w]) => {
    const n = num(w);
    return n ? { post: [fx.moveAll("hand", "me", "discard"), fx.draw(n)], condition: cond.deck() } : null;
  }),
  tpl("opp.itemLock", "During your opponent's next turn, they can't play any Item cards from their hand.", () =>
    post(fx.timed("opponentsNextTurn", { s: "cantPlay", side: "opp", kinds: ["item"] })),
  ),
  // —— Special Conditions ——
  tpl("status.now", "{x} is now {x}.", ([who, what], ctx) => {
    const r = pokemonRef(who as string, ctx.inAttack);
    if (!r) return null;
    const list = (what as string).split(/, and | and |, /).map((x) => status(x));
    if (!list.length || list.some((x) => !x)) return null;
    return post(...list.map((c) => fx.condition(r, c as NonNullable<typeof c>)));
  }),
  tpl(
    "status.poisonN",
    "{x} is now Poisoned. Put {w} damage counters instead of 1 on that Pokémon during Pokémon Checkup.",
    ([who, n], ctx) => {
      const r = pokemonRef(who as string, ctx.inAttack);
      const k = num(n);
      return r && k ? post(fx.condition(r, "poisoned", k)) : null;
    },
  ),
  // —— cards ——
  tpl("draw", "Draw {w} card{s}.", ([n]) => {
    const k = num(n);
    return k ? post(fx.draw(k)) : null;
  }),
  tpl("draw.card", "Draw a card.", () => post(fx.draw(1))),
  tpl("draw.mayUntil", "You may draw cards until you have {w} cards in your hand.", ([n]) => {
    const k = num(n);
    return k ? post(fx.may(msg("Draw cards until you have {n} cards in your hand?", { n: k }), [fx.drawUntil(k)])) : null;
  }),
  tpl(
    "evolve.fromDeck",
    "Search your deck for a card that evolves from this Pokémon and put it onto this Pokémon to evolve it. Then, shuffle your deck.",
    (_g, ctx) =>
      ctx.name
        ? post(
            fx.chooseCards("deck", "evo", msg("Choose a card that evolves from this Pokémon"), {
              filter: { category: ["pokemon"], evolvesFrom: ctx.name },
              min: 0,
              max: 1,
            }),
            fx.evolveWith("evo", ref.self),
            fx.shuffle(),
          )
        : null,
  ),
  tpl("search.mayAny", "You may search your deck for a card and put it into your hand. Then, shuffle your deck.", () =>
    post(fx.chooseCards("deck", "found", SEARCH_PROMPT(), { min: 0, max: 1 }), fx.move("found", "hand"), fx.shuffle()),
  ),
  tpl(
    "look.revealToHand",
    "Look at the top {w} cards of your deck. You may reveal {x} you find there and put {it} into your hand. Shuffle the other cards back into your deck.",
    ([w, what]) => {
      const k = num(w);
      const m = /^(any number of|an?) (.+)$/.exec((what as string).trim());
      const f = m ? cardFilter(m[2] as string) : null;
      if (!k || !m || !f?.filter) return null;
      return post(
        fx.chooseCards("deck", "found", msg("Choose the cards to put into your hand"), {
          filter: f.filter,
          top: k,
          min: 0,
          max: m[1] === "any number of" ? k : 1,
          reveal: true,
        }),
        fx.move("found", "hand"),
        fx.shuffle(),
      );
    },
  ),
  tpl("discard.shuffleIn", "Shuffle up to {w} {x} from your discard pile into your deck.", ([w, what]) => {
    const k = num(w);
    const f = cardFilter(what as string);
    if (!k || !f?.filter) return null;
    return post(
      fx.chooseCards("discard", "back", msg("Choose cards from your discard pile"), { filter: f.filter, min: 0, max: k }),
      fx.move("back", "deck"),
      fx.shuffle(),
    );
  }),
  tpl("draw.until", "Draw cards until you have {w} cards in your hand.", ([n]) => {
    const k = num(n);
    return k ? post(fx.drawUntil(k)) : null;
  }),
  tpl("search.reveal", "Search your deck for {x}, reveal {x}, and {x}. Then, shuffle your deck.", ([what, _it, dest], ctx) => {
    const m = /^(a|an|up to \w+|\w+) (.+)$/.exec(what as string);
    const count = m ? countPhrase(m[1] as string) : null;
    if (!m || !count) return null;
    const e = searchEffects(count, m[2] as string, dest as string, ctx);
    return e ? { post: e, condition: benchDest(dest as string) } : null;
  }),
  tpl("search.plain", "Search your deck for {x} and {x}. Then, shuffle your deck.", ([what, dest], ctx) => {
    const m = /^(a|an|up to \w+|\w+) (.+)$/.exec(what as string);
    const count = m ? countPhrase(m[1] as string) : null;
    if (!m || !count) return null;
    const e = searchEffects(count, m[2] as string, dest as string, ctx);
    return e ? { post: e, condition: benchDest(dest as string) } : null;
  }),
  tpl("discardPile.toHand", "Put {x} from your discard pile into your hand.", ([what]) => {
    const m = /^(a|an|up to \w+|\w+) (.+)$/.exec(what as string);
    const count = m ? countPhrase(m[1] as string) : null;
    const f = m ? cardFilter(m[2] as string) : null;
    if (!count || !f) return null;
    return {
      post: [
        fx.chooseCards("discard", "found", msg("Choose cards from your discard pile"), {
          ...(f.filter ? { filter: f.filter } : {}),
          min: count.min === count.max ? count.min : 0,
          max: count.max,
          reveal: true,
        }),
        fx.move("found", "hand"),
      ],
      condition: cond.hasCards("discard", "me", f.filter),
    };
  }),
  tpl("discardPile.attach", "Attach {x} from your discard pile to {x}.", ([what, target], ctx) => {
    const m = /^(a|an|up to \w+|\w+) (.+)$/.exec(what as string);
    const count = m ? countPhrase(m[1] as string) : null;
    const f = m ? cardFilter(m[2] as string) : null;
    const to = attachScope(target as string, ctx);
    if (!count || !f || !to || f.filter?.category?.[0] !== "energy") return null;
    return {
      post: [
        fx.chooseCards("discard", "found", msg("Choose Energy from your discard pile"), {
          filter: f.filter,
          min: count.min === count.max ? count.min : 0,
          max: count.max,
        }),
        fx.attach("found", to),
      ],
      condition: cond.hasCards("discard", "me", f.filter),
    };
  }),
  tpl("mill.opp", "Discard the top {w} card{s} of your opponent's deck.", ([n]) => {
    const k = num(n);
    return k ? post(fx.mill("opp", k)) : null;
  }),
  tpl("mill.me", "Discard the top {w} card{s} of your deck.", ([n]) => {
    const k = num(n);
    return k ? post(fx.mill("me", k)) : null;
  }),
  // —— healing ——
  tpl("heal.self", "Heal {n} damage from this Pokémon.", ([n]) => post(fx.heal(ref.self, Number(n)))),
  tpl("heal.oneCure", "Heal {n} damage from 1 of your Pokémon, and it recovers from all Special Conditions.", ([n]) =>
    post(chooseIn(scope.mine(), "t", { min: 1, max: 1 }), fx.heal(ref.v("t"), Number(n)), fx.cure(ref.v("t"))),
  ),
  tpl("heal.selfAll", "Heal all damage from this Pokémon.", () => post(fx.heal(ref.self, "all"))),
  tpl("heal.each", "Heal {n} damage from each of your Pokémon.", ([n]) => post(fx.heal(ref.all(scope.mine()), Number(n)))),
  tpl("heal.one", "Heal {n} damage from 1 of your {X}.", ([n, what]) => {
    const sc = scopePhrase(`your ${what}`);
    if (!sc) return null;
    const damaged: PokemonScope = { ...sc, filter: { ...sc.filter, damaged: true } };
    return {
      post: [chooseIn(damaged, "healed", { min: 1, max: 1 }), fx.heal(ref.v("healed"), Number(n))],
      condition: cond.exists(damaged),
    };
  }),
  // —— Energy ——
  tpl("energy.discardSelf", "Discard {x} Energy from this Pokémon.", ([what]) => {
    const m = /^(an|a|all|\w+)(?: (\{[A-Z]\}))?$/.exec(what as string);
    if (!m) return null;
    const types = typesOf(m[2]);
    if (types === null) return null;
    const n = m[1] === "all" ? "all" : num(m[1]);
    if (n === null) return null;
    return post(fx.discardEnergy(ref.self, n, types ? { types } : {}));
  }),
  tpl("energy.discardOpp", "Discard {x} Energy from your opponent's Active Pokémon.", ([what], ctx) => {
    const m = /^(an|a|all|\w+)(?: (\{[A-Z]\}))?$/.exec(what as string);
    if (!m) return null;
    const types = typesOf(m[2]);
    if (types === null) return null;
    const n = m[1] === "all" ? "all" : num(m[1]);
    if (n === null) return null;
    return post(fx.discardEnergy(ctx.inAttack ? ref.defending : ref.oppActive, n, types ? { types } : {}));
  }),
  // —— switching ——
  tpl("switch.self", "Switch this Pokémon with 1 of your Benched Pokémon.", () => post(fx.switch("me"))),
  tpl("switch.maySelf", "You may switch this Pokémon with 1 of your Benched Pokémon.", () =>
    post(fx.if(cond.bench("me"), [fx.may(msg("Switch this Pokémon with 1 of your Benched Pokémon?"), [fx.switch("me")])])),
  ),
  tpl("switch.mine", "Switch your Active Pokémon with 1 of your Benched Pokémon.", () => ({
    post: [fx.switch("me")],
    condition: cond.bench("me"),
  })),
  tpl(
    "switch.oppOut",
    "Switch out your opponent's Active Pokémon to the Bench. (Your opponent chooses the new Active Pokémon.)",
    () => ({
      post: [fx.switch("opp", "opp")],
      condition: cond.bench("opp"),
    }),
  ),
  tpl("switch.gust", "Switch in 1 of your opponent's Benched Pokémon to the Active Spot.", () => ({
    post: [fx.switch("opp", "me")],
    condition: cond.bench("opp"),
  })),
  // —— damage counters ——
  tpl("counters.on", "Put {w} damage counter{s} on {X}.", ([n, who], ctx) => {
    const k = num(n);
    if (!k) return null;
    const w = who as string;
    const r = pokemonRef(w, ctx.inAttack);
    if (r) return post(fx.counters(r, k));
    const each = /^each of (.+)$/.exec(w);
    if (each) {
      const sc = scopePhrase(each[1] as string);
      return sc ? post(fx.counters(ref.all(sc), k)) : null;
    }
    const one = /^1 of (.+)$/.exec(w);
    if (one) {
      const sc = scopePhrase(one[1] as string);
      return sc ? post(chooseIn(sc, "t", { min: 1, max: 1 }), fx.counters(ref.v("t"), k)) : null;
    }
    const any = /^(.+?) in any way you like$/.exec(w);
    if (any) {
      const sc = scopePhrase(any[1] as string);
      return sc ? post(fx.spread(sc, k)) : null;
    }
    return null;
  }),
];
