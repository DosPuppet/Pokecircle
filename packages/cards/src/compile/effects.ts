/**
 * Templates shared by attacks, Abilities and Trainer cards: effects on Pokémon, cards, Energy and the board. `inAttack`
 * says whether "your opponent's Active Pokémon" is the Defending Pokémon.
 */
import type { CardFilter, Effect, EType, PokemonScope } from "@pokecircle/engine";
import { amt, cond, fx, msg, ref, scope, searchToBench } from "@pokecircle/engine";
import {
  cardFilter,
  condPhrase,
  countPhrase,
  eachPhrase,
  num,
  pokemonFilter,
  pokemonRef,
  scopePhrase,
  status,
  typeSym,
} from "./phrases";
import { compileStatics } from "./statics";
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
  if (/^put (?:it|them) onto your Bench$/.test(dest)) {
    // Item cards played as Pokémon ('Item cards that have "Antique" in their name'): only those can go onto the Bench.
    if (filter?.category?.[0] === "trainer") {
      if (!filter.nameIncludes) return null;
      return [
        fx.chooseCards("deck", "found", SEARCH_PROMPT(), { filter, min: 0, max: amt.min(count.max, amt.benchSpace()) }),
        fx.move("found", "bench"),
        fx.shuffle(),
      ];
    }
    // Pokémon named by the text go onto the Bench whatever their Stage (Charjabug, Lampent, Silcoon).
    const named = !!filter && (!!filter.names || !!filter.anyOf?.every((f) => !!f.names));
    if (named)
      return [
        fx.chooseCards("deck", "found", SEARCH_PROMPT(), {
          filter: { ...filter, category: ["pokemon"] },
          min: 0,
          max: amt.min(count.max, amt.benchSpace()),
        }),
        { op: "move", cards: "found", to: "bench", anyStage: true },
        fx.shuffle(),
      ];
    return searchToBench(filter ?? {}, count.max, SEARCH_PROMPT());
  }
  const att = /^attach (?:it|them) to (.+)$/.exec(dest);
  if (att && filter?.category?.[0] === "energy") {
    const target = att[1] as string;
    const to = attachScope(target, ctx);
    if (!to) return null;
    return [
      fx.chooseCards("deck", "found", SEARCH_PROMPT(), { filter, min: 0, max: count.max }),
      ...attachTo("found", to, single(target), count.max),
      fx.shuffle(),
    ];
  }
  return null;
}

/** "1 of your Pokémon": every card goes to the same Pokémon (not "in any way you like"). */
const single = (target: string) => /^1 of /.test(target);

/** Attaches stored cards: to one Pokémon chosen first ("to 1 of your Pokémon"), or each to a Pokémon of the scope. */
function attachTo(cards: string, to: PokemonScope, one: boolean, max: number): Effect[] {
  if (!one || max <= 1) return [fx.attach(cards, to)];
  return [
    fx.if(cond.cmp(amt.count(cards), ">", 0), [
      fx.choosePokemon(to, "attachTo", msg("Choose the Pokémon to attach the cards to")),
      { op: "attach", cards, to, prompt: msg("Choose the Pokémon to attach the card to"), target: ref.v("attachTo") },
    ]),
  ];
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
  tpl("opp.cardLock", "Your opponent can't play any {x} cards from their hand during their next turn.", ([k]) => {
    const kind = ({ Item: "item", Supporter: "supporter", Stadium: "stadium", "Pokémon Tool": "tool" } as const)[k as "Item"];
    return kind ? post(fx.timed("opponentsNextTurn", { s: "cantPlay", side: "opp", kinds: [kind] })) : null;
  }),
  tpl("opp.benchToDeck", "Shuffle 1 of your opponent's Benched Pokémon and all attached cards into their deck.", () => ({
    post: [chooseIn(scope.oppBench(), "t", { min: 1, max: 1 }), fx.pokemonTo(ref.v("t"), "deck"), fx.shuffle("opp")],
    condition: cond.exists(scope.oppBench()),
  })),
  // —— Special Conditions ——
  tpl(
    "status.poisonMore",
    "Your opponent's Active Pokémon is now Poisoned. During Pokémon Checkup, put {w} damage counters on that Pokémon instead of 1.",
    ([w], ctx) => {
      const n = num(w);
      return n ? post(fx.condition(ctx.inAttack ? ref.defending : ref.oppActive, "poisoned", n)) : null;
    },
  ),
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
        ...attachTo("found", to, single(target as string), count.max),
      ],
      condition: cond.hasCards("discard", "me", f.filter),
    };
  }),
  tpl("mill.opp", "Discard the top {w} card{s} of your opponent's deck.", ([n]) => {
    const k = num(n);
    return k ? post(fx.mill("opp", k)) : null;
  }),
  tpl("mill.oppOne", "Discard the top card of your opponent's deck.", () => post(fx.mill("opp", 1))),
  tpl("mill.meOne", "Discard the top card of your deck.", () => post(fx.mill("me", 1))),
  tpl("energy.discardOppSpecial", "Discard a Special Energy from your opponent's Active Pokémon.", (_g, ctx) =>
    post(fx.discardEnergy(ctx.inAttack ? ref.defending : ref.oppActive, 1, { special: true })),
  ),
  tpl("energy.moveToBench", "Move an Energy from this Pokémon to {w} of your Benched Pokémon.", ([w]) => {
    const k = num(w);
    return k === 1 ? post(fx.moveEnergy(ref.self, scope.myBench(), 1)) : null;
  }),
  tpl("energy.moveTypedToBench", "Move a {t} Energy from this Pokémon to 1 of your Benched Pokémon.", ([t]) => {
    const type = typeSym(t);
    return type ? post(fx.moveEnergy(ref.self, scope.myBench(), 1, [type])) : null;
  }),
  tpl("energy.gatherOne", "Move an Energy from 1 of your other Pokémon to this Pokémon.", () => {
    const from = { ...scope.mine({ hasEnergy: true }), notSelf: true };
    return {
      post: [chooseIn(from, "from", { min: 1, max: 1 }), fx.moveEnergy(ref.v("from"), scope.self(), 1)],
      condition: cond.exists(from),
    };
  }),
  tpl("hand.attachToActiveOf", "Attach an Energy card from your hand to your Active {X}.", ([who]) => {
    const f = pokemonFilter(who as string);
    if (!f) return null;
    const filter = { category: ["energy" as const] };
    return {
      post: [
        fx.chooseCards("hand", "e", msg("Choose an Energy card from your hand"), { filter, min: 1, max: 1 }),
        fx.attach("e", scope.myActive()),
      ],
      condition: cond.and(cond.hasCards("hand", "me", filter), cond.matches(ref.myActive, f)),
    };
  }),
  tpl("draw.eachPlayer", "Each player draws {w} card{s}.", ([w]) => {
    const k = num(w);
    return k ? post(fx.draw(k, "me"), fx.draw(k, "opp")) : null;
  }),
  tpl("energy.oppActiveToHand", "Put {w} Energy attached to your opponent's Active Pokémon into their hand.", ([w], ctx) => {
    const k = num(w);
    return k ? post(fx.discardEnergy(ctx.inAttack ? ref.defending : ref.oppActive, k, { to: "hand" })) : null;
  }),
  tpl("counters.onMoved", "Put {w} damage counter{s} on the moved Pokémon.", ([w]) => {
    const k = num(w);
    return k ? post(fx.counters({ ev: "pokemon" }, k)) : null;
  }),
  tpl("status.newActive", "Their new Active Pokémon is now {x}.", ([what]) => {
    const st = status(what as string);
    return st ? post(fx.condition(ref.oppActive, st)) : null;
  }),
  tpl("switch.selfTyped", "Switch this Pokémon with 1 of your Benched {X}.", ([who]) => {
    const sc = scopePhrase(`your Benched ${who}`);
    if (!sc) return null;
    return {
      post: [chooseIn(sc, "w", { min: 1, max: 1 }), { op: "switch", side: "me", with: "w" }],
      condition: cond.exists(sc),
    };
  }),
  tpl(
    "switch.mineThenDraw",
    "Switch your Active Pokémon with 1 of your Benched Pokémon. If you do, draw cards until you have {w} cards in your hand.",
    ([w]) => {
      const k = num(w);
      return k ? { post: [fx.switch("me"), fx.drawUntil(k)], condition: cond.exists(scope.myBench()) } : null;
    },
  ),
  tpl("hand.oppShufflesN", "Your opponent chooses {w} cards from their hand and shuffles those cards into their deck.", ([w]) => {
    const k = num(w);
    return k
      ? post(
          fx.chooseCards("hand", "x", msg("Choose cards to shuffle into your deck"), {
            side: "opp",
            chooser: "opp",
            min: amt.min(k, amt.cards("hand", "opp")),
            max: k,
          }),
          fx.move("x", "deck"),
          fx.shuffle("opp"),
        )
      : null;
  }),
  tpl("hand.attachUpToOne", "Attach up to {w} Basic {t} Energy cards from your hand to 1 of your {X}.", ([w, t, who]) => {
    const k = num(w);
    const type = typeSym(t);
    const sc = scopePhrase(`your ${who}`);
    if (!k || !type || !sc) return null;
    const filter = { category: ["energy" as const], basicEnergy: true, energyTypes: [type] };
    return {
      post: [
        fx.chooseCards("hand", "e", msg("Choose Energy cards from your hand"), { filter, min: 0, max: k }),
        ...attachTo("e", sc, true, k),
      ],
      condition: cond.and(cond.hasCards("hand", "me", filter), cond.exists(sc)),
    };
  }),
  tpl("status.make", "Make your opponent's Active Pokémon {x}.", ([what], ctx) => {
    const st = status(what as string);
    return st ? post(fx.condition(ctx.inAttack ? ref.defending : ref.oppActive, st)) : null;
  }),
  tpl(
    "hand.oppRandomToDeckAnd",
    "Choose a random card from your opponent's hand, and your opponent reveals that card and shuffles it into their deck.",
    () =>
      post(
        fx.chooseCards("hand", "rnd", msg("A random card"), { side: "opp", min: 1, max: 1, random: true, reveal: true }),
        fx.move("rnd", "deck"),
        fx.shuffle("opp"),
      ),
  ),
  tpl("hand.oppRevealDiscard", "Your opponent reveals their hand, and you discard a card you find there.", () =>
    post(
      { op: "revealHand", side: "opp" },
      fx.chooseCards("hand", "x", msg("Choose a card to discard"), {
        side: "opp",
        min: amt.min(1, amt.cards("hand", "opp")),
        max: 1,
      }),
      fx.move("x", "discard"),
    ),
  ),
  tpl("energy.selfTypedToHand", "Put {w} {t} Energy attached to this Pokémon into your hand.", ([w, t]) => {
    const k = num(w);
    const type = typeSym(t);
    return k && type ? post(fx.discardEnergy(ref.self, k, { types: [type], to: "hand" })) : null;
  }),
  tpl("energy.moveBasicTyped", "Move a Basic {t} Energy from 1 of your Pokémon to another of your Pokémon.", ([t]) => {
    const type = typeSym(t);
    if (!type) return null;
    const from = scope.mine({ energyTypes: [type] });
    return {
      post: [
        chooseIn(from, "from", { min: 1, max: 1 }),
        { op: "moveEnergy", from: ref.v("from"), to: scope.mine(), n: 1, types: [type], basic: true },
      ],
      condition: cond.and(cond.exists(from), cond.cmp(amt.pokemon(scope.mine()), ">", 1)),
    };
  }),
  tpl("hand.attachUpToSelf", "Attach up to {w} Basic {t} Energy cards from your hand to this Pokémon.", ([w, t]) => {
    const k = num(w);
    const type = typeSym(t);
    if (!k || !type) return null;
    const filter = { category: ["energy" as const], basicEnergy: true, energyTypes: [type] };
    return {
      post: [
        fx.chooseCards("hand", "e", msg("Choose Energy cards from your hand"), { filter, min: 0, max: k }),
        fx.attach("e", scope.self()),
      ],
      condition: cond.hasCards("hand", "me", filter),
    };
  }),
  tpl(
    "top.attachBasics",
    "Look at the top {w} cards of your deck and attach any number of {x} you find there to your Pokémon in any way you like. Shuffle the other cards back into your deck.",
    ([w, what]) => {
      const k = num(w);
      const f = cardFilter(what as string);
      if (!k || f?.filter?.category?.[0] !== "energy") return null;
      return post(
        fx.chooseCards("deck", "e", msg("Choose Energy cards to attach"), { top: k, filter: f.filter, min: 0, max: k }),
        fx.attach("e", scope.mine()),
        fx.shuffle(),
      );
    },
  ),
  tpl("heal.it", "Heal {n} damage from it.", ([n]) => post(fx.heal(ref.self, Number(n)))),
  tpl("heal.eachOf", "Heal {n} damage from each of your {X}.", ([n, who]) => {
    const sc = scopePhrase(`your ${who}`);
    return sc ? post(fx.heal(ref.all(sc), Number(n))) : null;
  }),
  tpl(
    "search.mayReveal",
    "You may search your deck for {x}, reveal them, and put them into your hand. Then, shuffle your deck.",
    ([what]) => {
      const m = /^(any number of|up to \w+|a|an) (.+)$/.exec(what as string);
      const count = m ? countPhrase(m[1] as string) : null;
      const f = m ? cardFilter(m[2] as string) : null;
      if (!count || !f) return null;
      return post(
        fx.may(msg("Search your deck?"), [
          fx.chooseCards("deck", "found", SEARCH_PROMPT(), {
            ...(f.filter ? { filter: f.filter } : {}),
            min: 0,
            max: count.max,
            reveal: true,
          }),
          fx.move("found", "hand"),
          fx.shuffle(),
        ]),
      );
    },
  ),
  tpl("energy.oppMoveOne", "Move an Energy from 1 of your opponent's Pokémon to another of their Pokémon.", () =>
    post(
      fx.if(cond.cmp(amt.pokemon(scope.theirs()), ">", 1), [
        chooseIn(scope.theirs({ hasEnergy: true }), "from", { min: 1, max: 1 }),
        fx.moveEnergy(ref.v("from"), scope.theirs(), 1),
      ]),
    ),
  ),
  tpl("energy.gatherUpTo", "Move up to {w} Energy from your Benched Pokémon to your Active Pokémon.", ([w]) => {
    const k = num(w);
    return k
      ? {
          post: [
            {
              op: "gatherEnergy",
              from: scope.myBench(),
              to: ref.myActive,
              min: 0,
              max: k,
              prompt: msg("Choose Energy to move to your Active Pokémon"),
            },
          ],
          condition: cond.exists(scope.myBench({ hasEnergy: true })),
        }
      : null;
  }),
  tpl("hand.attachBasicSelf", "Attach a Basic Energy card from your hand to this Pokémon.", () => {
    const filter = { category: ["energy" as const], basicEnergy: true };
    return {
      post: [
        fx.chooseCards("hand", "e", msg("Choose an Energy card from your hand"), { filter, min: 1, max: 1 }),
        fx.attach("e", scope.self()),
      ],
      condition: cond.hasCards("hand", "me", filter),
    };
  }),
  tpl("energy.moveBasicToBench", "Move a Basic Energy from this Pokémon to 1 of your Benched Pokémon.", () =>
    post({ op: "moveEnergy", from: ref.self, to: scope.myBench(), n: 1, basic: true }),
  ),
  tpl("hand.oppShuffleDraw", "Have your opponent shuffle their hand into their deck and draw {w} cards.", ([w]) => {
    const k = num(w);
    return k ? post(fx.moveAll("hand", "opp", "deck"), fx.shuffle("opp"), fx.draw(k, "opp")) : null;
  }),
  tpl("bench.toHand", "Put 1 of your Benched Pokémon and all attached cards into your hand.", () => ({
    post: [chooseIn(scope.myBench(), "t", { min: 1, max: 1 }), fx.pokemonTo(ref.v("t"), "hand")],
    condition: cond.exists(scope.myBench()),
  })),
  tpl(
    "counters.moveAllToOpp",
    "Move all damage counters from 1 of your Benched Pokémon to 1 of your opponent's Pokémon.",
    () => ({
      post: [
        chooseIn(scope.myBench({ damaged: true }), "from", { min: 1, max: 1 }),
        chooseIn(scope.theirs(), "to", { min: 1, max: 1 }),
        { op: "moveCounters", from: ref.v("from"), to: ref.v("to"), n: "all" },
      ],
      condition: cond.exists(scope.myBench({ damaged: true })),
    }),
  ),
  tpl(
    "devolve.oppOne",
    "Devolve 1 of your opponent's evolved Pokémon by putting the highest Stage Evolution card on it into your opponent's hand.",
    () => {
      const evolved = scope.theirs({ stage: ["stage1", "stage2"] });
      return { post: [chooseIn(evolved, "t", { min: 1, max: 1 }), fx.devolve(ref.v("t"))], condition: cond.exists(evolved) };
    },
  ),
  tpl("discardPile.oneToBench", "Put a {x} from your discard pile onto your Bench.", ([what]) => {
    const found = cardFilter(what as string)?.filter;
    if (found?.category?.[0] !== "pokemon") return null;
    const filter = { ...found, stage: ["basic" as const] };
    return {
      post: [
        fx.chooseCards("discard", "found", msg("Choose Basic Pokémon to put onto your Bench"), { filter, min: 0, max: 1 }),
        fx.move("found", "bench"),
      ],
      condition: cond.and(cond.hasCards("discard", "me", filter), cond.cmp(amt.benchSpace(), ">", 0)),
    };
  }),
  tpl(
    "evolve.fromDeckOne",
    "Search your deck for a card that evolves from 1 of your Pokémon and put it onto that Pokémon to evolve it. Then, shuffle your deck.",
    () => ({
      post: [{ op: "evolveFromHand", scope: scope.mine(), fromDeck: true, prompt: msg("Choose the Pokémon to evolve") }],
      condition: cond.deck(),
    }),
  ),
  tpl(
    "evolve.fromDeckEachBench",
    "For each of your Benched Pokémon, search your deck for a card that evolves from that Pokémon and put it onto that Pokémon to evolve it. Then, shuffle your deck.",
    () => ({
      post: [
        fx.choosePokemon(scope.myBench(), "b", msg("Your Benched Pokémon"), {
          min: amt.pokemon(scope.myBench()),
          max: amt.pokemon(scope.myBench()),
        }),
        {
          op: "forEach",
          key: "b",
          as: "p",
          effects: [
            {
              op: "evolveFromHand",
              scope: scope.myBench(),
              target: ref.v("p"),
              fromDeck: true,
              prompt: msg("Choose the Pokémon to evolve"),
            },
          ],
        },
      ],
    }),
  ),
  tpl("energy.moveNToBench", "Move {w} Energy from this Pokémon to 1 of your Benched Pokémon.", ([w]) => {
    const k = num(w);
    if (!k || k < 2) return null;
    return post(fx.moveEnergy(ref.self, scope.myBench(), k));
  }),
  tpl("draw.bottom", "Draw {w} cards from the bottom of your deck.", ([w]) => {
    const k = num(w);
    return k
      ? post(
          fx.chooseCards("deck", "b", msg("The bottom cards of your deck"), { bottom: k, min: 0, max: k, random: true }),
          fx.move("b", "hand"),
        )
      : null;
  }),
  tpl("look.oppTopOrder", "Look at the top {w} cards of your opponent's deck and put them back in any order.", ([w]) => {
    const k = num(w);
    return k
      ? post(
          fx.chooseCards("deck", "top", msg("The top cards of your opponent's deck"), {
            side: "opp",
            top: k,
            min: 0,
            max: k,
            random: true,
          }),
          { op: "orderCards", key: "top", prompt: msg("Put them back in any order (first = top)") },
          fx.move("top", "deckTop"),
        )
      : null;
  }),
  tpl("look.oppPrize", "Look at 1 of your opponent's face-down Prize cards.", () =>
    post({ op: "look", zone: "prizes", side: "opp", top: 1 }),
  ),
  tpl(
    "delayed.discardDefending",
    "At the end of your opponent's next turn, discard the Defending Pokémon and all attached cards.",
    () =>
      post(
        fx.timed(
          "opponentsNextTurn",
          { s: "endOfTurn", scope: scope.self(), effects: [fx.pokemonTo(ref.self, "discard")] },
          ref.defending,
        ),
      ),
  ),
  tpl(
    "delayed.countersDefending",
    "At the end of your opponent's next turn, put {w} damage counters on the Defending Pokémon.",
    ([w]) => {
      const k = num(w);
      return k
        ? post(
            fx.timed(
              "opponentsNextTurn",
              { s: "endOfTurn", scope: scope.self(), effects: [fx.counters(ref.self, k)] },
              ref.defending,
            ),
          )
        : null;
    },
  ),
  tpl("delayed.koDefending", "At the end of your opponent's next turn, the Defending Pokémon will be Knocked Out.", () =>
    post(
      fx.timed(
        "opponentsNextTurn",
        { s: "endOfTurn", scope: scope.self(), effects: [{ op: "knockOut", target: ref.self }] },
        ref.defending,
      ),
    ),
  ),
  tpl("counters.chooseEach", "Choose {w} of your opponent's Pokémon and put {w} damage counters on each of them.", ([w, n]) => {
    const k = num(w);
    const c = num(n);
    return k && c ? post(chooseIn(scope.theirs(), "t", { min: k, max: k }), fx.counters(ref.v("t"), c)) : null;
  }),
  tpl(
    "switch.mayOpp",
    "You may switch out your opponent's Active Pokémon to the Bench. (Your opponent chooses the new Active Pokémon.)",
    () =>
      post(
        fx.if(cond.exists(scope.oppBench()), [
          fx.may(msg("Switch out your opponent's Active Pokémon?"), [fx.switch("opp", "opp")]),
        ]),
      ),
  ),
  tpl("draw.ifMore", "If {x}, draw {w} more cards.", ([c, w], ctx) => {
    const k = condPhrase(c as string, ctx.inAttack);
    const n = num(w);
    return k && n ? post(fx.if(k, [fx.draw(n)])) : null;
  }),
  tpl("stadium.thenDiscard", "Then, discard that Stadium.", () => post(fx.discardStadium())),
  tpl("search.may", "You may search your deck for {x} and {x}. Then, shuffle your deck.", ([what, dest], ctx) => {
    const m = /^(a|an|up to \w+|any number of|\w+) (.+)$/.exec(what as string);
    const count = m ? countPhrase(m[1] as string) : null;
    if (!m || !count) return null;
    const e = searchEffects(count, m[2] as string, dest as string, ctx);
    return e ? post(fx.may(msg("Search your deck?"), e)) : null;
  }),
  tpl(
    "energy.mayMoveOppToBench",
    "You may move an Energy from your opponent's Active Pokémon to {w} of their Benched Pokémon.",
    ([w], ctx) => {
      const k = num(w);
      if (k !== 1) return null;
      return post(
        fx.if(cond.bench("opp"), [
          fx.may(msg("Move an Energy from your opponent's Active Pokémon to their Bench?"), [
            fx.moveEnergy(ctx.inAttack ? ref.defending : ref.oppActive, scope.oppBench(), 1),
          ]),
        ]),
      );
    },
  ),
  tpl("hand.shuffleIn", "Shuffle your hand into your deck.", () => post(fx.moveAll("hand", "me", "deck"), fx.shuffle())),
  tpl("stadium.discard", "Discard a Stadium in play.", () => ({ post: [fx.discardStadium()], condition: { c: "stadium" } })),
  tpl("stadium.mayDiscard", "You may discard a Stadium in play.", () =>
    post(fx.if({ c: "stadium" }, [fx.may(msg("Discard the Stadium in play?"), [fx.discardStadium()])])),
  ),
  tpl("turn.ends", "Your turn ends.", () => post(fx.endTurn())),
  // —— timed continuous effects: "During your opponent's next turn, <a static sentence>." ——
  tpl("timed.statics", "During your {x}next turn, {x}.", ([whose, rest]) => {
    const duration = whose === "opponent's " ? "opponentsNextTurn" : whose === "" ? "yourNextTurn" : null;
    const text = `${(rest as string).charAt(0).toUpperCase()}${(rest as string).slice(1)}.`;
    const rules = duration ? compileStatics(text, "ability") : null;
    if (!duration || !rules || rules.some((r) => r.cond)) return null;
    return post(...rules.map((r) => ("scope" in r && r.scope?.self ? fx.timed(duration, r, ref.self) : fx.timed(duration, r))));
  }),
  tpl("ko.if", "If {x}, it is Knocked Out.", ([c], ctx) => {
    if (!/^your opponent's Active Pokémon\b/.test(c as string)) return null;
    const k = condPhrase(c as string, ctx.inAttack);
    return k ? post(fx.if(k, [{ op: "knockOut", target: ctx.inAttack ? ref.defending : ref.oppActive }])) : null;
  }),
  tpl("heal.oneAll", "Heal all damage from 1 of your {X}.", ([what]) => {
    const sc = scopePhrase(`your ${what}`);
    if (!sc) return null;
    const damaged: PokemonScope = { ...sc, filter: { ...sc.filter, damaged: true } };
    return {
      post: [chooseIn(damaged, "healed", { min: 1, max: 1 }), fx.heal(ref.v("healed"), "all")],
      condition: cond.exists(damaged),
    };
  }),
  tpl("hand.mayDiscardAny", "You may discard any number of cards from your hand.", () =>
    post(
      fx.chooseCards("hand", "d", msg("Choose cards to discard from your hand"), { min: 0, max: 60, notSource: true }),
      fx.move("d", "discard"),
    ),
  ),
  tpl("status.bothActive", "Both Active {x} are now {x}.", ([who, what]) => {
    const f = pokemonFilter(who as string);
    const st = status(what as string);
    return f && st ? post(fx.condition(ref.all(scope.of("both", "active", f)), st)) : null;
  }),
  tpl("draw.forEach", "Draw a card for each {x}.", ([what], ctx) => {
    const a = eachPhrase(what as string, ctx.inAttack);
    return a ? { post: [fx.draw(a)], condition: cond.deck() } : null;
  }),
  tpl("discardPile.toBench", "Put up to {w} {x} from your discard pile onto your Bench.", ([w, what]) => {
    const k = num(w);
    const f = cardFilter(what as string);
    if (!k || !f?.filter || f.filter.category?.[0] !== "pokemon") return null;
    const filter = { ...f.filter, stage: ["basic" as const] };
    return {
      post: [
        fx.chooseCards("discard", "found", msg("Choose Basic Pokémon to put onto your Bench"), {
          filter,
          min: 0,
          max: amt.min(k, amt.benchSpace()),
        }),
        fx.move("found", "bench"),
      ],
      condition: cond.and(cond.hasCards("discard", "me", filter), cond.cmp(amt.benchSpace(), ">", 0)),
    };
  }),
  tpl(
    "counters.moveAllToActive",
    "Move all damage counters from 1 of your {X} to your opponent's Active Pokémon.",
    ([who], ctx) => {
      const sc = scopePhrase(`your ${who}`);
      if (!sc) return null;
      const damaged: PokemonScope = { ...sc, filter: { ...sc.filter, damaged: true } };
      return {
        post: [
          chooseIn(damaged, "from", { min: 1, max: 1 }),
          { op: "moveCounters", from: ref.v("from"), to: ctx.inAttack ? ref.defending : ref.oppActive, n: "all" },
        ],
        condition: cond.exists(damaged),
      };
    },
  ),
  tpl("energy.discardAttacker", "Discard an Energy from the Attacking Pokémon.", () =>
    post(fx.discardEnergy({ ev: "attacker" }, 1)),
  ),
  tpl(
    "opp.poisonedCantRetreat",
    "During your opponent's next turn, their Poisoned Pokémon can't retreat. (This includes newly Poisoned Pokémon.)",
    () => post(fx.timed("opponentsNextTurn", { s: "cantRetreat", scope: scope.theirs({ status: ["poisoned"] }) })),
  ),
  tpl("heal.everyone", "Heal {n} damage from each Pokémon (both yours and your opponent's).", ([n]) =>
    post(fx.heal(ref.all(scope.of("both")), Number(n))),
  ),
  tpl("ko.lowHp", "Knock Out each of your opponent's Pokémon that has {n} HP or less remaining.", ([n]) =>
    post({ op: "knockOut", target: ref.all(scope.theirs({ maxRemainingHp: Number(n) })) }),
  ),
  tpl("energy.benchToActive", "Move a {t} Energy from 1 of your Benched Pokémon to your Active Pokémon.", ([t]) => {
    const type = typeSym(t);
    if (!type) return null;
    const from = scope.myBench({ energyTypes: [type] });
    return {
      post: [chooseIn(from, "from", { min: 1, max: 1 }), fx.moveEnergy(ref.v("from"), scope.myActive(), 1, [type])],
      condition: cond.exists(from),
    };
  }),
  tpl("hand.attachTyped", "Attach a Basic {t} Energy card from your hand to 1 of your {X}.", ([t, who]) => {
    const type = typeSym(t);
    const sc = scopePhrase(`your ${who}`);
    if (!type || !sc) return null;
    const filter = { category: ["energy" as const], basicEnergy: true, energyTypes: [type] };
    return {
      post: [
        fx.chooseCards("hand", "e", msg("Choose an Energy card from your hand"), { filter, min: 1, max: 1 }),
        fx.attach("e", sc),
      ],
      condition: cond.and(cond.hasCards("hand", "me", filter), cond.exists(sc)),
    };
  }),
  tpl("energy.discardOppOne", "Discard an Energy from 1 of your opponent's Pokémon.", () => {
    const sc = scope.theirs({ hasEnergy: true });
    return {
      post: [chooseIn(sc, "t", { min: 1, max: 1 }), fx.discardEnergy(ref.v("t"), 1)],
      condition: cond.exists(sc),
    };
  }),
  // —— the opponent's hand, random cards ——
  tpl("hand.oppReveals", "Your opponent reveals their hand.", () => post({ op: "revealHand", side: "opp" })),
  tpl("hand.oppRandomDiscard", "Discard a random card from your opponent's hand.", () =>
    post(
      fx.chooseCards("hand", "rnd", msg("A random card"), { side: "opp", min: 1, max: 1, random: true, reveal: true }),
      fx.move("rnd", "discard"),
    ),
  ),
  tpl(
    "hand.oppRandomToDeck",
    "Choose a random card from your opponent's hand. Your opponent reveals that card and shuffles it into their deck.",
    () =>
      post(
        fx.chooseCards("hand", "rnd", msg("A random card"), { side: "opp", min: 1, max: 1, random: true, reveal: true }),
        fx.move("rnd", "deck"),
        fx.shuffle("opp"),
      ),
  ),
  tpl("hand.oppDiscards", "Your opponent discards {w} card{s} from their hand.", ([w]) => {
    const k = num(w);
    return k
      ? post(
          fx.chooseCards("hand", "od", msg("Choose cards to discard from your hand"), {
            side: "opp",
            chooser: "opp",
            min: k,
            max: k,
          }),
          fx.move("od", "discard"),
        )
      : null;
  }),
  tpl("hand.discardOne", "Discard a card from your hand.", () => ({
    post: [
      fx.chooseCards("hand", "d", msg("Choose a card to discard"), { min: 1, max: 1, notSource: true }),
      fx.move("d", "discard"),
    ],
  })),
  tpl("cost.discardAnother", "You can use this card only if you discard another card from your hand.", () => ({
    pre: [
      fx.chooseCards("hand", "cost", msg("Choose a card to discard"), { min: 1, max: 1, notSource: true }),
      fx.move("cost", "discard"),
    ],
    condition: cond.hasCards("hand", "me", undefined, 2),
  })),
  tpl("only.secondFirstTurn", "You can use this card only if you go second, and only during your first turn.", () => ({
    condition: cond.and(cond.not({ c: "wentFirst" }), { c: "firstTurn" }),
  })),
  tpl("only.if", "You can use this card only if {x}.", ([c]) => {
    const k = condPhrase(c as string, false);
    return k ? { condition: k } : null;
  }),
  tpl("then.draw", "Then, draw {w} card{s}.", ([w]) => {
    const k = num(w);
    return k ? post(fx.draw(k)) : null;
  }),
  // —— deck top ——
  tpl("top.mayDiscard", "Look at the top card of your deck. You may discard that card.", () =>
    post(
      fx.chooseCards("deck", "top", msg("You may discard the top card of your deck"), { top: 1, min: 0, max: 1 }),
      fx.move("top", "discard"),
    ),
  ),
  tpl(
    "top.pokemonToBench",
    "Look at the top {w} cards of your deck. You may put any number of Pokémon you find there onto your Bench. Shuffle the other cards back into your deck.",
    ([w]) => {
      const k = num(w);
      return k
        ? post(
            fx.chooseCards("deck", "found", msg("Choose Basic Pokémon to put onto your Bench"), {
              top: k,
              filter: { category: ["pokemon"], stage: ["basic"] },
              min: 0,
              max: amt.benchSpace(),
            }),
            fx.move("found", "bench"),
            fx.shuffle(),
          )
        : null;
    },
  ),
  tpl(
    "search.anyBasicsToBench",
    "Search your deck for any number of Basic Pokémon and put them onto your Bench. Then, shuffle your deck.",
    () => ({
      post: searchToBench({ category: ["pokemon"], stage: ["basic"] }, amt.benchSpace() as never, SEARCH_PROMPT()),
      condition: benchDest("onto your Bench"),
    }),
  ),
  tpl(
    "search.mayUpTo",
    "You may search your deck for up to {w} cards and put them into your hand. Then, shuffle your deck.",
    ([w]) => {
      const k = num(w);
      return k
        ? post(fx.chooseCards("deck", "found", SEARCH_PROMPT(), { min: 0, max: k }), fx.move("found", "hand"), fx.shuffle())
        : null;
    },
  ),
  tpl("self.mayShuffleIn", "You may shuffle this Pokémon and all attached cards into your deck.", () =>
    post(
      fx.may(msg("Shuffle this Pokémon and all attached cards into your deck?"), [fx.pokemonTo(ref.self, "deck"), fx.shuffle()]),
    ),
  ),
  tpl(
    "hand.attachBasicsAny",
    "You may attach any number of Basic Energy cards from your hand to your Pokémon in any way you like.",
    () =>
      post(
        fx.chooseCards("hand", "e", msg("Choose Basic Energy cards to attach"), {
          filter: { category: ["energy"], basicEnergy: true },
          min: 0,
          max: 60,
        }),
        fx.attach("e", scope.mine()),
      ),
  ),
  tpl("energy.mayOppToHand", "You may put {w} Energy attached to your opponent's Active Pokémon into their hand.", ([w], ctx) => {
    const k = num(w);
    return k
      ? post(
          fx.may(msg("Put Energy attached to your opponent's Active Pokémon into their hand?"), [
            fx.discardEnergy(ctx.inAttack ? ref.defending : ref.oppActive, k, { to: "hand" }),
          ]),
        )
      : null;
  }),
  tpl("mill.me", "Discard the top {w} card{s} of your deck.", ([n]) => {
    const k = num(n);
    return k ? post(fx.mill("me", k)) : null;
  }),
  // —— healing ——
  tpl("heal.self", "Heal {n} damage from this Pokémon.", ([n]) => post(fx.heal(ref.self, Number(n)))),
  tpl("heal.active", "Heal {n} damage from your Active Pokémon.", ([n]) => post(fx.heal(ref.myActive, Number(n)))),
  tpl("heal.benchAll", "Heal all damage from {w} of your Benched Pokémon.", ([w]) => {
    const k = num(w);
    return k ? post(chooseIn(scope.myBench({ damaged: true }), "h", { min: k, max: k }), fx.heal(ref.v("h"), "all")) : null;
  }),
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
