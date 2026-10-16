/** Card ops: drawing, choosing cards from a zone, moving them, shuffling. */
import { attachCard, benchCard } from "../board";
import { type Ask, answer, DONE, evalAmount, isAsk, playersOf } from "../effects";
import { RulesError } from "../errors";
import { emit } from "../events";
import { matchCard, scopePokemon } from "../match";
import type { OpHandlers } from "../opRegistry";
import { drawCards, moveCard, obj, playerOf, shuffleDeck } from "../state";
import { msg } from "../text";
import type { CardDest, ChoiceValue, GameState, ObjectId } from "../types";

/** Moves cards to a destination; returns their ids after the move (a card entering the deck gets a new id). */
export function moveTo(s: GameState, cards: ObjectId[], to: CardDest): ObjectId[] {
  const out: ObjectId[] = [];
  for (const c of cards) {
    if (!s.objects[c]) continue;
    switch (to) {
      case "bench": {
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
  return out;
}

export const HANDLERS: OpHandlers = {
  draw(s, r, e) {
    drawCards(s, playersOf(s, r, e.who), evalAmount(s, r, e.n));
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
    if (e.notSource && r.card) zone = zone.filter((c) => c !== r.card);
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
    const a: ChoiceValue[] | Ask =
      hidden && zone.length && !r.answers[key("pick")]
        ? { player: chooser, key: key("pick"), request: req }
        : answer(r, key("pick"), chooser, req);
    if (isAsk(a)) return { ask: a };
    const chosen = a.map(String);
    if (e.distinctNames) {
      const names = chosen.map((c) => s.defs[obj(s, c).defId]?.name);
      if (new Set(names).size !== names.length) throw new RulesError(msg("Choose cards with different names"));
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
    r.vars[e.cards] = moveTo(s, cards, e.to);
    return DONE;
  },
  moveAll(s, r, e) {
    const owner = playersOf(s, r, e.side);
    const cards = playerOf(s, owner)[e.zone].filter((c) => matchCard(s, s.defs[obj(s, c).defId]!, e.filter, r.player));
    moveTo(s, cards, e.to);
    return DONE;
  },
  mill(s, r, e) {
    const p = playersOf(s, r, e.side);
    const cards = playerOf(s, p).deck.slice(0, evalAmount(s, r, e.n));
    moveTo(s, cards, e.to ?? "discard");
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
    const targets = scopePokemon(s, e.to, r.player, r.source);
    if (!targets.length) return DONE;
    const picks: string[] = [];
    for (let i = 0; i < cards.length; i++) {
      const a = answer(r, key(`t${i}`), r.player, {
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
    return DONE;
  },
};
