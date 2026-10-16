/** Ops on Pokémon in play: choosing them, Energy and Tools, switching, evolving, removing, Prize cards. */
import { evolvePokemon, pokemonLeaves, switchActive } from "../board";
import { removeCondition } from "../conditions";
import { attackEffectsPrevented } from "../damage";
import { answer, DONE, evalAmount, isAsk, playersOf, resolveRef } from "../effects";
import { RulesError } from "../errors";
import { emit } from "../events";
import { endGame, takePrizes } from "../knockout";
import { matchCard, matchPokemon, scopePokemon } from "../match";
import type { OpHandlers } from "../opRegistry";
import { bump, defOf, moveCard, obj, playerOf, pokemonOf, putOnPokemon, shuffleDeck, topDef } from "../state";
import { chars, rulesOn } from "../statics";
import { msg } from "../text";
import type { EType, GameState, ObjectId, Resolution } from "../types";

export const HANDLERS: OpHandlers = {
  choosePokemon(s, r, e, key) {
    let options = scopePokemon(s, e.scope, r.player, r.source);
    if (e.leastHp && options.length) {
      const left = (id: string) => chars(s, id).hp - pokemonOf(s, id).damage;
      const least = Math.min(...options.map(left));
      options = options.filter((id) => left(id) === least);
    }
    const chooser = playersOf(s, r, e.chooser);
    const max = Math.min(e.max === undefined ? 1 : evalAmount(s, r, e.max), options.length);
    const min = Math.min(e.min === undefined ? 1 : evalAmount(s, r, e.min), max);
    const a = answer(r, key("pk"), chooser, {
      type: "pick",
      options,
      min,
      max,
      prompt: e.prompt,
      intent: "target",
      suggested: options.slice(0, Math.max(min, Math.min(1, max))),
      source: r.defId,
    });
    if (isAsk(a)) return { ask: a };
    r.vars[e.store] = a.map(String);
    return DONE;
  },
  evolveWith(s, r, e) {
    const card = (r.vars[e.card] ?? []).map(String)[0];
    const target = resolveRef(s, r, e.target)[0];
    if (!card || !target || !s.objects[card]) return DONE;
    const d = defOf(s, card);
    const base = topDef(s, target);
    const ok = e.skipStage1 ? d.stage === "stage2" && (d.basicOf ?? []).includes(base.name) : d.evolvesFrom === base.name;
    if (!ok) throw new RulesError(msg("That card cannot evolve this Pokémon"));
    evolvePokemon(s, card, target, obj(s, card).zone === "hand");
    return DONE;
  },
  discardEnergy(s, r, e, key) {
    let total = 0;
    const chooser = playersOf(s, r, e.chooser);
    const discarded: ObjectId[] = [];
    const targets = resolveRef(s, r, e.from);
    for (let i = 0; i < targets.length; i++) {
      const t = targets[i] as string;
      if (attackEffectsPrevented(s, r, t)) continue;
      const pk = pokemonOf(s, t);
      const options = pk.energy.filter((c) => {
        const d = defOf(s, c);
        if (e.special && d.energy?.basic) return false;
        if (e.names && !e.names.includes(d.name)) return false;
        return !e.types || (d.energy?.provides ?? []).some((u) => e.types?.some((x) => u.includes(x) || u.includes("*")));
      });
      const n = e.n === "all" ? options.length : Math.min(evalAmount(s, r, e.n), options.length);
      const a = answer(r, key(`e${i}`), chooser, {
        type: "pick",
        options,
        min: n,
        max: n,
        prompt: msg("Choose Energy to discard"),
        intent: "energy",
        suggested: options.slice(0, n),
        source: r.defId,
      });
      if (isAsk(a)) return { ask: a };
      discarded.push(...a.map(String));
    }
    for (const c of discarded) {
      noteBoomerang(s, r, c);
      moveCard(s, c, e.to === "hand" ? "hand" : e.to === "lostZone" ? "lostZone" : e.to === "deck" ? "deck" : "discard");
      total++;
    }
    if (e.store) r.vars[e.store] = [total];
    return DONE;
  },
  moveEnergy(s, r, e, key) {
    const from = resolveRef(s, r, e.from)[0];
    if (!from) return DONE;
    const chooser = playersOf(s, r, e.chooser);
    const pk = pokemonOf(s, from);
    const options = pk.energy.filter(
      (c) =>
        (!e.basic || !!defOf(s, c).energy?.basic) &&
        (!e.types || (defOf(s, c).energy?.provides ?? []).some((u) => e.types?.some((x) => u.includes(x)))),
    );
    const n = Math.min(evalAmount(s, r, e.n), options.length);
    const targets = scopePokemon(s, e.to, r.player, r.source).filter((x) => x !== from);
    if (!n || !targets.length) return DONE;
    const a = answer(r, key("e"), chooser, {
      type: "pick",
      options,
      min: n,
      max: n,
      prompt: msg("Choose Energy to move"),
      intent: "energy",
      suggested: options.slice(0, n),
      source: r.defId,
    });
    if (isAsk(a)) return { ask: a };
    const b = answer(r, key("to"), chooser, {
      type: "pick",
      options: targets,
      min: 1,
      max: 1,
      prompt: msg("Choose the Pokémon to move the Energy to"),
      intent: "target",
      suggested: [targets[0] as string],
      source: r.defId,
    });
    if (isAsk(b)) return { ask: b };
    for (const c of a.map(String)) {
      putOnPokemon(s, c, String(b[0]), "energy");
      emit({ type: "attach", player: pk.owner, card: c, defId: obj(s, c).defId, pokemon: String(b[0]) });
    }
    return DONE;
  },
  discardTools(s, r, e) {
    for (const t of resolveRef(s, r, e.from)) {
      if (attackEffectsPrevented(s, r, t)) continue;
      for (const c of [...pokemonOf(s, t).tools]) moveCard(s, c, "discard");
    }
    return DONE;
  },
  discardStadium(s) {
    if (s.stadium) moveCard(s, s.stadium, "discard");
    return DONE;
  },
  switch(s, r, e, key) {
    const p = playersOf(s, r, e.side);
    const ps = playerOf(s, p);
    if (!ps.active || !ps.bench.length) return DONE;
    if (e.side === "opp" && attackEffectsPrevented(s, r, ps.active) && e.chooser !== "opp") return DONE;
    let to = e.with ? (r.vars[e.with] ?? []).map(String).find((x) => ps.bench.includes(x)) : undefined;
    if (!to) {
      const chooser = playersOf(s, r, e.chooser ?? "me");
      const a = answer(r, key("to"), chooser, {
        type: "pick",
        options: [...ps.bench],
        min: 1,
        max: 1,
        prompt: p === r.player ? msg("Choose your new Active Pokémon") : msg("Choose the opponent's new Active Pokémon"),
        intent: "target",
        suggested: [ps.bench[0] as string],
        source: r.defId,
      });
      if (isAsk(a)) return { ask: a };
      to = String(a[0]);
    }
    switchActive(s, p, to);
    return DONE;
  },
  pokemonTo(s, r, e) {
    for (const t of resolveRef(s, r, e.target)) {
      if (attackEffectsPrevented(s, r, t)) continue;
      pokemonLeaves(s, t, e.to);
    }
    return DONE;
  },
  devolve(s, r, e) {
    for (const t of resolveRef(s, r, e.target)) {
      const pk = pokemonOf(s, t);
      if (pk.cards.length < 2 || attackEffectsPrevented(s, r, t)) continue;
      const top = pk.cards[pk.cards.length - 1] as ObjectId;
      moveCard(s, top, e.to ?? "hand");
      const keep = rulesOn(s, "keepConfused", t).length > 0;
      for (const c of ["asleep", "confused", "paralyzed", "poisoned", "burned"] as const)
        if (!(keep && c === "confused")) removeCondition(s, t, c);
      bump(s);
      emit({ type: "devolve", player: pk.owner, pokemon: t, defId: topDef(s, t).id });
    }
    return DONE;
  },
  knockOut(s, r, e) {
    for (const t of resolveRef(s, r, e.target)) {
      const pk = pokemonOf(s, t);
      pk.damage = Math.max(pk.damage, chars(s, t).hp);
      bump(s);
    }
    return DONE;
  },
  discardEnergyFrom(s, r, e, key) {
    const options = scopePokemon(s, e.scope, r.player, r.source).flatMap((id) =>
      pokemonOf(s, id).energy.filter((c) => {
        const d = defOf(s, c);
        if (e.basic && !d.energy?.basic) return false;
        return !e.types || (d.energy?.provides ?? []).some((u) => e.types?.some((x) => u.includes(x) || u.includes("*")));
      }),
    );
    const max = Math.min(evalAmount(s, r, e.max), options.length);
    const min = Math.min(evalAmount(s, r, e.min), max);
    const a = answer(r, key("e"), r.player, {
      type: "pick",
      options,
      min,
      max,
      prompt: e.prompt,
      intent: "energy",
      suggested: options.slice(0, min),
      source: r.defId,
    });
    if (isAsk(a)) return { ask: a };
    const to = e.to === "hand" ? "hand" : e.to === "deck" ? "deck" : e.to === "lostZone" ? "lostZone" : "discard";
    for (const c of a.map(String)) {
      noteBoomerang(s, r, c);
      moveCard(s, c, to);
    }
    if (e.store) r.vars[e.store] = [a.length];
    return DONE;
  },
  useAttackOf(s, r, e, key) {
    if (!r.attack) return DONE;
    const cards =
      "cards" in e.from
        ? (r.vars[e.from.cards] ?? []).map(String).filter((c) => s.objects[c])
        : scopePokemon(s, e.from, r.player, r.source).map((id) => pokemonOf(s, id).cards.at(-1) as ObjectId);
    const attacks: Record<string, { defId: string; index: number }> = {};
    for (const c of cards) {
      const d = defOf(s, c);
      if (d.category !== "pokemon" || (e.filter && !matchCard(s, d, e.filter, r.player))) continue;
      (d.attacks ?? []).forEach((a, index) => {
        // An attack that itself copies attacks is not offered (no endless chain of copies).
        if (a.effects?.some((x) => x.op === "useAttackOf")) return;
        attacks[`${c}:${index}`] = { defId: d.id, index };
      });
    }
    const options = Object.keys(attacks);
    if (!options.length) return DONE;
    const a = answer(r, key("atk"), r.player, {
      type: "pick",
      options,
      min: 1,
      max: 1,
      prompt: e.prompt,
      intent: "mode",
      suggested: [options[0] as string],
      attacks,
      source: r.defId,
    });
    if (isAsk(a)) return { ask: a };
    const chosen = attacks[String(a[0])];
    const atk = chosen ? s.defs[chosen.defId]?.attacks?.[chosen.index] : undefined;
    if (!atk) return DONE;
    // The chosen attack becomes this attack: its damage and its effects.
    r.attack.base = atk.damage;
    r.attack.bonus = 0;
    const effects = atk.effects ?? (atk.damage > 0 && !atk.text ? [{ op: "mainDamage" as const }] : []);
    return { push: effects };
  },
  evolveFromHand(s, r, e, key) {
    const hand = e.fromDeck ? playerOf(s, r.player).deck : playerOf(s, r.player).hand;
    const fits = (card: ObjectId, target: string) => {
      const d = defOf(s, card);
      const base = topDef(s, target);
      return e.skipStage1 ? d.stage === "stage2" && (d.basicOf ?? []).includes(base.name) : d.evolvesFrom === base.name;
    };
    const pool = e.target ? resolveRef(s, r, e.target) : scopePokemon(s, e.scope, r.player, r.source);
    const targets = pool.filter((t) => hand.some((c) => fits(c, t)));
    if (!targets.length) return DONE;
    const a = answer(r, key("pk"), r.player, {
      type: "pick",
      options: targets,
      min: 1,
      max: 1,
      prompt: e.prompt,
      intent: "target",
      suggested: [targets[0] as string],
      source: r.defId,
    });
    if (isAsk(a)) return { ask: a };
    const target = String(a[0]);
    const cards = hand.filter((c) => fits(c, target));
    const b = answer(r, key("card"), r.player, {
      type: "pick",
      options: cards,
      min: 1,
      max: 1,
      prompt: msg("Choose the Evolution card"),
      intent: "search",
      suggested: [cards[0] as string],
      source: r.defId,
    });
    if (isAsk(b)) return { ask: b };
    evolvePokemon(s, String(b[0]), target, !e.fromDeck);
    if (e.fromDeck) shuffleDeck(s, r.player);
    return DONE;
  },
  gatherEnergy(s, r, e, key) {
    const to = resolveRef(s, r, e.to)[0];
    if (!to) return DONE;
    const options = scopePokemon(s, e.from, r.player, r.source)
      .filter((id) => id !== to)
      .flatMap((id) => pokemonOf(s, id).energy)
      .filter((c) => !e.types || (defOf(s, c).energy?.provides ?? []).some((u) => u.some((t) => e.types?.includes(t as EType))));
    const max = Math.min(evalAmount(s, r, e.max), options.length);
    const min = Math.min(evalAmount(s, r, e.min), max);
    const a = answer(r, key("e"), r.player, {
      type: "pick",
      options,
      min,
      max,
      prompt: e.prompt,
      intent: "energy",
      suggested: [],
      source: r.defId,
    });
    if (isAsk(a)) return { ask: a };
    for (const c of a.map(String)) {
      putOnPokemon(s, c, to, "energy");
      emit({ type: "attach", player: r.player, card: c, defId: obj(s, c).defId, pokemon: to });
    }
    return DONE;
  },
  replaceCard(s, r, e) {
    const target = resolveRef(s, r, e.target)[0];
    const card = (r.vars[e.card] ?? []).map(String)[0];
    if (!target || !card || !s.objects[card]) return DONE;
    const pk = pokemonOf(s, target);
    const old = pk.cards[pk.cards.length - 1] as ObjectId;
    // The new card takes the old one's place: the old one goes to the discard pile.
    putOnPokemon(s, card, target, "cards");
    moveCard(s, old, "discard");
    return DONE;
  },
  takePrizes(s, r, e) {
    takePrizes(s, playersOf(s, r, e.side), evalAmount(s, r, e.n));
    return DONE;
  },
  winGame(s, r) {
    endGame(s, r.player, "effect");
    return DONE;
  },
  useCardEffects(s, r, e) {
    const card = (r.vars[e.cards] ?? []).map(String)[0];
    const effects = card && s.objects[card] ? (defOf(s, card).trainer?.effects ?? []) : [];
    return effects.length ? { push: effects } : DONE;
  },
};

/** Boomerang Energy: discarded by an effect of its own Pokémon's attack, it comes back after the attack. */
function noteBoomerang(s: GameState, r: Resolution, card: ObjectId): void {
  if (r.kind !== "attack" || !r.source || s.objects[card]?.host !== r.source) return;
  const e = defOf(s, card).energy;
  if (!e?.returnAfterAttack || (e.returnFilter && !matchPokemon(s, r.source, e.returnFilter))) return;
  if (e.returnAfterAttack === "hand") r.vars.toHand = [...(r.vars.toHand ?? []), card];
  else r.vars.boomerang = [...(r.vars.boomerang ?? []), defOf(s, card).id];
}
