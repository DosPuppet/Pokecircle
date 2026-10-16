/**
 * Game flow: setup (R-SETUP), turns (R-TURN), Pokémon Checkup (R-CHECKUP), and the `advance` loop. After each
 * decision, `advance` runs what can run without a player (resolutions, triggers, Knock Outs, win checks) until a
 * decision is pending or the game is over.
 */
import { attachCard } from "./board";
import { canBeConditioned, clearConditions, removeCondition } from "./conditions";
import { putCounters } from "./damage";
import { evalCond, runResolution, startResolution, staticCtx } from "./effects";
import { emit } from "./events";
import { checkKnockouts, checkWinner, endGame, promote, promotionNeeded } from "./knockout";
import { MAX_FLOW_STEPS, MAX_MULLIGANS } from "./limits";
import {
  bump,
  createPokemon,
  drawCards,
  flipCoin,
  inPlay,
  moveCard,
  obj,
  opponentOf,
  playerOf,
  pokemonOf,
  shuffleDeck,
} from "./state";
import { benchSize, rulesOn } from "./statics";
import { cardRef, msg } from "./text";
import { queueTriggers, triggerDef } from "./triggers";
import type { ChoiceValue, Effect, GameState, ObjectId, PlayerId } from "./types";

const isBasic = (s: GameState, id: ObjectId) => {
  const d = s.defs[obj(s, id).defId];
  return d?.category === "pokemon" && d.stage === "basic";
};

export function hasBasic(s: GameState, p: PlayerId): boolean {
  return playerOf(s, p).hand.some((c) => isBasic(s, c));
}

// —— setup ——

function setupStep(s: GameState): void {
  const st = s.setup;
  const [a, b] = s.playerOrder as [PlayerId, PlayerId];
  switch (st.step) {
    case "coin": {
      // R-SETUP-1: the winner of a coin flip (or the loser of the previous game) chooses.
      if (!st.chooser) st.chooser = flipCoin(s, a) ? a : b;
      st.step = "first";
      s.pending = {
        kind: "choice",
        player: st.chooser,
        purpose: "chooseFirst",
        request: {
          type: "pick",
          options: ["first", "second"],
          min: 1,
          max: 1,
          prompt: msg("Do you want to go first or second?"),
          intent: "mode",
          suggested: ["first"],
          labels: { first: msg("Go first"), second: msg("Go second") },
        },
      };
      return;
    }
    case "first":
      return;
    case "deal": {
      for (const p of s.playerOrder) {
        shuffleDeck(s, p);
        drawCards(s, p, 7);
      }
      // R-SETUP-3: mulligans, at the same time for both players.
      const mulligans: Record<PlayerId, number> = { [a]: 0, [b]: 0 };
      for (let round = 0; ; round++) {
        const lacking = s.playerOrder.filter((p) => !hasBasic(s, p));
        if (!lacking.length) break;
        if (round >= MAX_MULLIGANS) {
          endGame(s, null, "draw");
          return;
        }
        for (const p of lacking) {
          const ps = playerOf(s, p);
          emit({ type: "mulligan", player: p, revealed: ps.hand.map((c) => obj(s, c).defId) });
          for (const c of [...ps.hand]) moveCard(s, c, "deck", { silent: true });
          shuffleDeck(s, p);
          drawCards(s, p, 7);
          mulligans[p] = (mulligans[p] ?? 0) + 1;
        }
      }
      for (const p of s.playerOrder) {
        playerOf(s, p).mulligans = mulligans[p] ?? 0;
        st.extraDraws[p] = Math.max(0, (mulligans[opponentOf(s, p)] ?? 0) - (mulligans[p] ?? 0));
      }
      st.step = "draws";
      return;
    }
    case "draws": {
      const p = s.playerOrder.find((x) => (st.extraDraws[x] ?? 0) > 0);
      if (!p) {
        st.step = "place";
        return;
      }
      const n = st.extraDraws[p] ?? 0;
      s.pending = {
        kind: "choice",
        player: p,
        purpose: "mulliganDraw",
        request: {
          type: "number",
          min: 0,
          max: n,
          prompt: msg("Your opponent took {n} extra mulligan(s): how many extra cards do you draw?", { n }),
          intent: "number",
          suggested: [n],
        },
      };
      return;
    }
    case "place": {
      const order = [s.turn.first, opponentOf(s, s.turn.first)];
      const p = order.find((x) => !st.placed[x]);
      if (p) {
        s.pending = { kind: "setup", player: p };
        return;
      }
      st.step = "prizes";
      return;
    }
    case "prizes": {
      for (const p of s.playerOrder) {
        const ps = playerOf(s, p);
        const placed = st.placed[p];
        if (!placed) continue;
        const active = createPokemon(s, placed.active);
        ps.active = active;
        for (const c of placed.bench) ps.bench.push(createPokemon(s, c));
        for (let i = 0; i < s.prizeCount && ps.deck.length; i++) moveCard(s, ps.deck[0] as ObjectId, "prizes", { silent: true });
      }
      for (const p of s.playerOrder)
        for (const id of inPlay(s, p)) {
          const c = pokemonOf(s, id).cards[0] as ObjectId;
          emit({ type: "playBasic", player: p, card: c, defId: obj(s, c).defId, pokemon: id });
        }
      st.step = "done";
      emit({ type: "setupDone" });
      s.flow = "turnStart";
      s.turn.number = 0;
      s.turn.active = opponentOf(s, s.turn.first);
      bump(s);
      return;
    }
    case "done":
      s.flow = "turnStart";
      return;
  }
}

/** The setup decision (R-SETUP-4): an Active Pokémon and up to 5 Benched Pokémon, all Basic, from the hand. */
export function placeSetup(s: GameState, p: PlayerId, active: ObjectId, bench: ObjectId[]): string | null {
  const ps = playerOf(s, p);
  const all = [active, ...bench];
  if (new Set(all).size !== all.length) return msg("A card can be placed only once");
  if (!all.every((c) => ps.hand.includes(c) && isBasic(s, c))) return msg("Only Basic Pokémon from your hand can be placed");
  if (bench.length > 5) return msg("At most 5 Benched Pokémon");
  for (const c of all) {
    const o = obj(s, c);
    ps.hand.splice(ps.hand.indexOf(c), 1);
    o.zone = "resolving";
  }
  s.setup.placed[p] = { active, bench: [...bench] };
  return null;
}

// —— turns ——

function startTurn(s: GameState): void {
  const t = s.turn;
  t.number++;
  t.active = t.number === 1 ? t.first : opponentOf(s, t.active);
  t.energyAttached = false;
  t.supporterPlayed = false;
  t.stadiumPlayed = false;
  t.retreated = false;
  t.attacks = 0;
  delete t.again;
  t.ending = false;
  s.effects = s.effects.filter((e) => e.untilTurn >= t.number);
  s.turnLog = s.turnLog.filter((e) => e.turn >= t.number - 2);
  bump(s);
  emit({ type: "turnStart", player: t.active, turn: t.number });
  // R-TURN-1, R-WIN-3: a player who cannot draw at the start of their turn loses.
  if (!playerOf(s, t.active).deck.length) {
    checkWinner(s, t.active);
    return;
  }
  drawCards(s, t.active, 1);
  s.flow = "main";
}

function endTurn(s: GameState): void {
  emit({ type: "endTurn", player: s.turn.active });
  for (const id of inPlay(s, s.turn.active)) queueTriggers(s, "turnEnd", id);
  s.flow = "checkup";
}

/** Pokémon Checkup (R-CHECKUP-1): Poisoned, Burned, Asleep, Paralyzed, for both Active Pokémon. */
function checkup(s: GameState): void {
  emit({ type: "checkup" });
  for (const p of [s.turn.active, opponentOf(s, s.turn.active)]) {
    const id = playerOf(s, p).active;
    if (!id) continue;
    const c = pokemonOf(s, id).cond;
    const more = (k: "poisoned" | "burned") =>
      rulesOn(s, "checkupCounters", id).reduce((n, st) => n + (st.rule.status === k ? st.rule.add : 0), 0);
    if (c.poisoned) putCounters(s, null, id, c.poisoned + more("poisoned"));
    if (c.burned) {
      putCounters(s, null, id, 2 + more("burned"));
      if (flipCoin(s, p)) removeCondition(s, id, "burned");
    }
    if (c.rotating === "asleep" && flipCoin(s, p)) removeCondition(s, id, "asleep");
    if (c.rotating === "paralyzed" && p === s.turn.active && (c.paralyzedTurn ?? 0) < s.turn.number)
      removeCondition(s, id, "paralyzed");
  }
  for (const id of [...inPlay(s, s.turn.active), ...inPlay(s, opponentOf(s, s.turn.active))]) queueTriggers(s, "checkup", id);
  s.flow = "turnStart";
}

// —— resolutions and triggers ——

function finishResolution(s: GameState): void {
  const r = s.resolving;
  s.resolving = null;
  if (!r) return;
  if (r.kind === "trainer" && r.card && s.objects[r.card]?.zone === "resolving") moveCard(s, r.card, "discard");
  if (r.kind === "attack") {
    // Boomerang Energy discarded by this attack's effects: attached again to the attacker.
    const back = (r.vars.boomerang ?? []).map(String);
    if (back.length && r.source && s.pokemon[r.source]) {
      const discard = playerOf(s, r.player).discard;
      for (const defId of back) {
        const c = [...discard].reverse().find((x) => s.objects[x]?.defId === defId);
        if (c) attachCard(s, c, r.source, false);
      }
    }
    // Festival Lead: a Pokémon that may attack twice keeps its turn after its first attack.
    const twice =
      s.turn.attacks === 1 && !!r.source && !!s.pokemon[r.source] && !!r.attack && rulesOn(s, "attackTwice", r.source).length > 0;
    if (twice && r.attack) s.turn.again = { index: r.attack.index, ...(r.attack.source ? { source: r.attack.source } : {}) };
    else s.turn.ending = true;
    if (r.source && s.pokemon[r.source]) queueTriggers(s, "attacked", r.source);
  }
  if (r.event?.endsTurn) s.turn.ending = true;
}

function startTrigger(s: GameState, q: GameState["queue"][number]): void {
  const t = triggerDef(s, q);
  if (!t) return;
  const ctx = { ...staticCtx(q.player, q.source), card: q.card, vars: {}, ...(q.event ? { event: q.event } : {}) };
  if (t.condition && !evalCond(s, ctx, t.condition)) return;
  // Once per turn: an optional trigger counts only when the player accepts it.
  const onceKey =
    t.oncePerTurn || t.onceKey
      ? t.onceKey
        ? `once:${q.player}:${t.onceKey}`
        : `trigger:${q.source ?? q.card}:${q.defId}:${q.trigger}`
      : null;
  if (onceKey && s.turnLog.some((e) => e.turn === s.turn.number && e.key === onceKey)) return;
  const body: Effect[] = onceKey ? [{ op: "markUsed", key: onceKey }, ...t.effects] : t.effects;
  const effects: Effect[] = t.may
    ? [{ op: "may", prompt: msg("Use the effect of {card}?", { card: cardRef(q.defId) }), then: body }]
    : body;
  emit({ type: "ability", player: q.player, pokemon: q.source, defId: q.defId, name: "" });
  startResolution(s, {
    kind: "trigger",
    player: q.player,
    source: q.source && s.pokemon[q.source] ? q.source : null,
    card: q.card,
    defId: q.defId,
    effects,
    // The card the trigger belongs to (an attached Energy or Tool): its effects may move it ("discard this card").
    ...(q.card ? { vars: { thisCard: [q.card] } } : {}),
    ...(q.event ? { event: q.event } : {}),
  });
}

function askPromotion(s: GameState, p: PlayerId): void {
  const bench = playerOf(s, p).bench;
  if (bench.length === 1) {
    promote(s, p, bench[0] as string);
    return;
  }
  s.pending = {
    kind: "choice",
    player: p,
    purpose: "promote",
    request: {
      type: "pick",
      options: [...bench],
      min: 1,
      max: 1,
      prompt: msg("Choose your new Active Pokémon"),
      intent: "promote",
      suggested: [bench[0] as string],
    },
  };
}

/** Pokémon that cannot be affected by Special Conditions recover from them (Festival Grounds). */
function cureProtected(s: GameState): void {
  for (const id of [...inPlay(s, s.playerOrder[0] as PlayerId), ...inPlay(s, s.playerOrder[1] as PlayerId)]) {
    const c = pokemonOf(s, id).cond;
    if (c.rotating || c.poisoned || c.burned)
      for (const k of ["asleep", "confused", "paralyzed", "poisoned", "burned"] as const)
        if (!canBeConditioned(s, id, k)) removeCondition(s, id, k);
  }
}

/** R-BENCH-2: a player with more Benched Pokémon than allowed discards some (asked to the owner). */
function benchOverflow(s: GameState): PlayerId | null {
  return s.playerOrder.find((p) => playerOf(s, p).bench.length > benchSize(s, p)) ?? null;
}

/** Runs the game until a decision is pending or the game is over. */
export function advance(s: GameState): void {
  for (let guard = 0; guard < MAX_FLOW_STEPS; guard++) {
    if (s.over || s.pending) return;
    if (s.resolving) {
      if (!runResolution(s)) return;
      finishResolution(s);
      continue;
    }
    if (s.queue.length) {
      startTrigger(s, s.queue.shift() as GameState["queue"][number]);
      continue;
    }
    if (s.flow !== "setup") {
      cureProtected(s);
      if (checkKnockouts(s)) continue;
      // Sudden Death: the new game's setup goes on.
      if (checkWinner(s) && s.over) return;
      const p = promotionNeeded(s);
      if (p) {
        askPromotion(s, p);
        continue;
      }
      const over = benchOverflow(s);
      if (over) {
        const ps = playerOf(s, over);
        const n = ps.bench.length - benchSize(s, over);
        s.pending = {
          kind: "choice",
          player: over,
          purpose: "benchOverflow",
          request: {
            type: "pick",
            options: [...ps.bench],
            min: n,
            max: n,
            prompt: msg("Discard {n} Benched Pokémon (Bench limit)", { n }),
            intent: "discard",
            suggested: ps.bench.slice(-n),
          },
        };
        return;
      }
    }
    switch (s.flow) {
      case "setup":
        setupStep(s);
        continue;
      case "turnStart":
        startTurn(s);
        continue;
      case "main":
        if (s.turn.ending) {
          s.flow = "turnEnd";
          continue;
        }
        s.pending = { kind: "main", player: s.turn.active };
        return;
      case "turnEnd":
        endTurn(s);
        continue;
      case "checkup":
        checkup(s);
        continue;
      case "over":
        return;
    }
  }
  endGame(s, null, "draw");
}

/** Applies the answer to a question that is not part of an effect (setup, promotion, Bench limit). */
export function answerFlowChoice(s: GameState, p: PlayerId, purpose: string, values: ChoiceValue[]): void {
  switch (purpose) {
    case "chooseFirst":
      s.turn.first = values[0] === "first" ? p : opponentOf(s, p);
      emit({ type: "firstPlayer", player: s.turn.first, chooser: p });
      s.setup.step = "deal";
      return;
    case "mulliganDraw":
      drawCards(s, p, Number(values[0] ?? 0));
      s.setup.extraDraws[p] = 0;
      return;
    case "promote":
      promote(s, p, String(values[0]));
      return;
    case "benchOverflow": {
      for (const id of values.map(String)) {
        const cards = [...pokemonOf(s, id).cards, ...pokemonOf(s, id).energy, ...pokemonOf(s, id).tools];
        clearConditions(s, id);
        const ps = playerOf(s, p);
        ps.bench = ps.bench.filter((x) => x !== id);
        delete s.pokemon[id];
        for (const c of cards) moveCard(s, c, "discard");
      }
      bump(s);
      return;
    }
  }
}
