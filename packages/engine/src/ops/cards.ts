/** Card ops: drawing, choosing cards from a zone, moving them, shuffling. */
import { attachCard, benchCard } from "../board";
import { type Ask, answer, DONE, evalAmount, isAsk, playersOf, resolveRef } from "../effects";
import { emit } from "../events";
import { matchCard, scopePokemon } from "../match";
import type { OpHandlers } from "../opRegistry";
import { defOf, drawCards, moveCard, obj, playerOf, shuffle, shuffleDeck } from "../state";
import { msg } from "../text";
import { queueTriggers } from "../triggers";
import type { CardDest, ChoiceValue, GameState, ObjectId } from "../types";

/** Moves cards to a destination; returns their ids after the move (a card entering the deck gets a new id). */
export function moveTo(s: GameState, cards: ObjectId[], to: CardDest, anyStage = false): ObjectId[] {
  const out: ObjectId[] = [];
  // On top of the deck, the first card ends on top: put them in reverse order.
  const list = to === "deckTop" ? [...cards].reverse() : cards;
  for (const c of list) {
    if (!s.objects[c]) continue;
    switch (to) {
      case "bench": {
        // Only a Basic Pokémon, or a Trainer card played as one (Fossils), can go onto the Bench.
        const d = defOf(s, c);
        if (!(d.category === "pokemon" && (anyStage || d.stage === "basic")) && !d.trainer?.asPokemon) break;
        const pk = benchCard(s, c, false);
        if (pk) out.push(c);
        break;
      }
      case "deckTop":
        out.push(moveCard(s, c, "deck", { top: true }));
        break;
      case "deckBottom":
      case "deck":
        out.push(moveCard(s, c, "deck"));
        break;
      default:
        out.push(moveCard(s, c, to));
    }
  }
  return to === "deckTop" ? out.reverse() : out;
}

export const HANDLERS: OpHandlers = {
  draw(s, r, e) {
    const drawn = drawCards(s, playersOf(s, r, e.who), evalAmount(s, r, e.n));
    if (e.store) r.vars[e.store] = [drawn.length];
    return DONE;
  },
  drawUntil(s, r, e) {
    const p = playersOf(s, r, e.who);
    const n = evalAmount(s, r, e.n) - playerOf(s, p).hand.length;
    if (n > 0) drawCards(s, p, n);
    return DONE;
  },
  chooseCards(s, r, e, key) {
    const owner = playersOf(s, r, e.side);
    const chooser = playersOf(s, r, e.chooser);
    let zone = [...playerOf(s, owner)[e.zone]];
    if (e.top !== undefined) zone = zone.slice(0, evalAmount(s, r, e.top));
    if (e.bottom !== undefined) zone = zone.slice(-Math.max(1, evalAmount(s, r, e.bottom)));
    if (e.notSource && r.card) zone = zone.filter((c) => c !== r.card);
    // "This card can't be put into your hand or deck from the discard pile." (taking from the discard pile)
    if (e.zone === "discard" && !e.among) zone = zone.filter((c) => !s.defs[obj(s, c).defId]?.trainer?.noRecovery);
    if (e.among) {
      const allowed = new Set((r.vars[e.among] ?? []).map(String));
      zone = zone.filter((c) => allowed.has(c));
    }
    const options = zone.filter((c) => matchCard(s, s.defs[obj(s, c).defId]!, e.filter, r.player));
    const max = Math.min(evalAmount(s, r, e.max), options.length);
    const min = Math.min(e.min === undefined ? 0 : evalAmount(s, r, e.min), max);
    // A search shows the whole zone looked at to the chooser (R-TEXT-2), even when nothing matches.
    const hidden = e.zone === "deck" || e.zone === "prizes" || (e.zone === "hand" && chooser !== owner);
    const cards = Object.fromEntries(zone.map((c) => [c, obj(s, c).defId]));
    const suggested = e.zone === "hand" ? options.slice(0, min) : options.slice(0, max);
    const req = {
      type: "pick" as const,
      options,
      min,
      max,
      prompt: e.prompt,
      intent: e.zone === "hand" ? ("discard" as const) : ("search" as const),
      suggested,
      cards,
      source: r.defId,
    };
    // Looking through a hidden zone is a question even without a choice, so that the chooser sees it.
    let chosen: string[];
    if (e.random) {
      const pool = [...options];
      shuffle(s, pool);
      chosen = pool.slice(0, max);
    } else if (e.distinctNames) {
      // One card at a time, each among the names not chosen yet: every offered answer is valid.
      chosen = [];
      for (let k = 0; k < max; k++) {
        const names = new Set(chosen.map((c) => s.defs[obj(s, c).defId]?.name));
        const left = options.filter((c) => !chosen.includes(c) && !names.has(s.defs[obj(s, c).defId]?.name));
        if (!left.length) break;
        const a = answer(r, key(`pick${k}`), chooser, {
          ...req,
          options: left,
          min: k < min ? 1 : 0,
          max: 1,
          suggested: left.slice(0, 1),
        });
        if (isAsk(a)) return { ask: a };
        if (!a.length) break;
        chosen.push(String(a[0]));
      }
    } else {
      const a: ChoiceValue[] | Ask =
        hidden && zone.length && !r.answers[key("pick")]
          ? { player: chooser, key: key("pick"), request: req }
          : answer(r, key("pick"), chooser, req);
      if (isAsk(a)) return { ask: a };
      chosen = a.map(String);
    }
    r.vars[e.store] = chosen;
    if (e.reveal && chosen.length)
      emit({ type: "reveal", player: owner, cards: chosen, defIds: chosen.map((c) => obj(s, c).defId) });
    return DONE;
  },
  chooseNumber(s, r, e, key) {
    const min = evalAmount(s, r, e.min);
    const max = Math.max(min, evalAmount(s, r, e.max));
    const a = answer(r, key("n"), r.player, {
      type: "number",
      min,
      max,
      prompt: e.prompt,
      intent: "number",
      suggested: [max],
      source: r.defId,
    });
    if (isAsk(a)) return { ask: a };
    r.vars[e.store] = [Number(a[0])];
    return DONE;
  },
  set(s, r, e) {
    r.vars[e.key] = [evalAmount(s, r, e.amount)];
    return DONE;
  },
  move(s, r, e) {
    const cards = (r.vars[e.cards] ?? []).map(String);
    r.vars[e.cards] = moveTo(s, cards, e.to, !!e.anyStage);
    return DONE;
  },
  moveAll(s, r, e) {
    const owner = playersOf(s, r, e.side);
    const cards = playerOf(s, owner)[e.zone].filter((c) => matchCard(s, s.defs[obj(s, c).defId]!, e.filter, r.player));
    // A hand put into a deck goes in a random order (it is shuffled first).
    if (e.to === "deckBottom" || e.to === "deckTop") shuffle(s, cards);
    moveTo(s, cards, e.to);
    if (e.store) r.vars[e.store] = [cards.length];
    return DONE;
  },
  revealHand(s, r, e) {
    const p = playersOf(s, r, e.side);
    const hand = playerOf(s, p).hand;
    if (hand.length) emit({ type: "reveal", player: p, cards: [...hand], defIds: hand.map((c) => obj(s, c).defId) });
    return DONE;
  },
  mill(s, r, e) {
    const p = playersOf(s, r, e.side);
    const cards = playerOf(s, p).deck.slice(0, evalAmount(s, r, e.n));
    const moved = moveTo(s, cards, e.to ?? "discard");
    // "If this Pokémon is discarded from your deck by an effect of … your opponent" (Ferrothorn).
    if (p !== r.player && (e.to ?? "discard") === "discard")
      for (const c of moved) queueTriggers(s, "discardedFromDeck", null, { card: c, attacker: r.player });
    if (e.store) r.vars[e.store] = moved;
    return DONE;
  },
  orderCards(s, r, e, key) {
    const items = (r.vars[e.key] ?? []).map(String).filter((c) => s.objects[c]);
    const a = answer(r, key("order"), r.player, {
      type: "order",
      items,
      prompt: e.prompt,
      intent: "order",
      suggested: items,
      cards: Object.fromEntries(items.map((c) => [c, obj(s, c).defId])),
      source: r.defId,
    });
    if (isAsk(a)) return { ask: a };
    r.vars[e.key] = a.map(String);
    return DONE;
  },
  varMinus(_s, r, e) {
    const minus = new Set((r.vars[e.minus] ?? []).map(String));
    r.vars[e.key] = (r.vars[e.key] ?? []).filter((x) => !minus.has(String(x)));
    return DONE;
  },
  shuffleDeck(s, r, e) {
    shuffleDeck(s, playersOf(s, r, e.who));
    return DONE;
  },
  look(s, r, e, key) {
    const owner = playersOf(s, r, e.side);
    let zone = [...playerOf(s, owner)[e.zone]];
    if (e.top !== undefined) zone = zone.slice(0, evalAmount(s, r, e.top));
    if (!zone.length || r.answers[key("look")]) return DONE;
    return {
      ask: {
        player: r.player,
        key: key("look"),
        request: {
          type: "pick",
          options: [],
          min: 0,
          max: 0,
          prompt: msg("You look at these cards"),
          intent: "look",
          suggested: [],
          cards: Object.fromEntries(zone.map((c) => [c, obj(s, c).defId])),
          source: r.defId,
        },
      },
    };
  },
  attach(s, r, e, key) {
    const cards = (r.vars[e.cards] ?? []).map(String).filter((c) => s.objects[c]);
    const fixed = e.target ? resolveRef(s, r, e.target)[0] : undefined;
    const targets = fixed ? [fixed] : scopePokemon(s, e.to, r.player, r.source);
    if (!targets.length) return DONE;
    const picks: string[] = [];
    for (let i = 0; i < cards.length; i++) {
      const a = answer(r, key(`t${i}`), playersOf(s, r, e.chooser), {
        type: "pick",
        options: targets,
        min: 1,
        max: 1,
        prompt: e.prompt,
        intent: "attach",
        suggested: [targets[0] as string],
        cards: { [cards[i] as string]: obj(s, cards[i] as string).defId },
        source: r.defId,
      });
      if (isAsk(a)) return { ask: a };
      picks.push(String(a[0]));
    }
    cards.forEach((c, i) => {
      const fromHand = obj(s, c).zone === "hand";
      attachCard(s, c, picks[i] as string, fromHand);
    });
    if (e.store) r.vars[e.store] = [...new Set([...(r.vars[e.store] ?? []).map(String), ...picks])];
    return DONE;
  },
};
