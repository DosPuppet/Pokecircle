/** Ops on Pokémon in play: choosing them, Energy and Tools, switching, evolving, removing, Prize cards. */
import { evolvePokemon, pokemonLeaves, switchActive } from "../board";
import { removeCondition } from "../conditions";
import { attackEffectsPrevented } from "../damage";
import { answer, DONE, evalAmount, isAsk, playersOf, resolveRef } from "../effects";
import { RulesError } from "../errors";
import { emit } from "../events";
import { takePrizes } from "../knockout";
import { scopePokemon } from "../match";
import type { OpHandlers } from "../opRegistry";
import { bump, defOf, moveCard, obj, playerOf, pokemonOf, putOnPokemon, topDef } from "../state";
import { msg } from "../text";
import type { ObjectId } from "../types";

export const HANDLERS: OpHandlers = {
  choosePokemon(s, r, e, key) {
    const options = scopePokemon(s, e.scope, r.player, r.source);
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
      (c) => !e.types || (defOf(s, c).energy?.provides ?? []).some((u) => e.types?.some((x) => u.includes(x))),
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
      moveCard(s, top, "hand");
      for (const c of ["asleep", "confused", "paralyzed", "poisoned", "burned"] as const) removeCondition(s, t, c);
      bump(s);
      emit({ type: "devolve", player: pk.owner, pokemon: t, defId: topDef(s, t).id });
    }
    return DONE;
  },
  takePrizes(s, r, e) {
    takePrizes(s, r.player, evalAmount(s, r, e.n));
    return DONE;
  },
};
