/** Control ops: coins, conditions, optional and modal effects, loops, timed effects, ending the turn. */
import { answer, DONE, evalAmount, evalCond, isAsk, playersOf, resolveRef } from "../effects";
import type { OpHandlers } from "../opRegistry";
import { bump, flipCoin, newId, topDef } from "../state";
import { chars, rulesOn } from "../statics";
import { msg } from "../text";
import type { StaticRule, TimedEffect } from "../types";

/** Maximum coins flipped by "flip until you get tails" (an approximation of an unbounded loop, docs/approximations.md). */
export const MAX_FLIPS = 100;

export const HANDLERS: OpHandlers = {
  flip(s, r, e, key) {
    const flipAll = (): [number, number] => {
      let h = 0;
      let t = 0;
      if (e.untilTails) {
        while (h < MAX_FLIPS && flipCoin(s, r.player, r.defId)) h++;
        t = 1;
      } else {
        const n = e.n === undefined ? 1 : evalAmount(s, r, e.n);
        for (let i = 0; i < n; i++) {
          if (flipCoin(s, r.player, r.defId)) h++;
          else t++;
        }
      }
      return [h, t];
    };
    // The coins are flipped once: a question (flip again?) resumes this op.
    const done = key("flipped");
    if (!r.vars[done]) {
      r.vars[done] = flipAll();
    }
    // Backtrack Badge: once during the turn, the attack's coins may be flipped again.
    const again = r.kind === "attack" && r.source && s.pokemon[r.source] ? rulesOn(s, "reflip", r.source)[0] : undefined;
    const used = again ? `reflip:${again.card ?? again.defId}` : "";
    if (again && !s.turnLog.some((x) => x.turn === s.turn.number && x.key === used)) {
      const [h0, t0] = (r.vars[done] ?? [0, 0]).map(Number) as [number, number];
      const a = answer(r, key("reflip"), r.player, {
        type: "yesNo",
        prompt: msg("Heads: {heads}, tails: {tails}. Ignore these results and flip the coins again?", { heads: h0, tails: t0 }),
        intent: "yesNo",
        suggested: [h0 < t0 ? 1 : 0],
        source: again.defId,
      });
      if (isAsk(a)) return { ask: a };
      if (a[0] === 1) {
        s.turnLog.push({ turn: s.turn.number, player: r.player, kind: "abilityUsed", key: used });
        r.vars[done] = flipAll();
      }
    }
    const [heads, tails] = (r.vars[done] ?? [0, 0]).map(Number) as [number, number];
    r.vars.heads = [heads];
    r.vars.tails = [tails];
    if (e.store) {
      r.vars[e.store] = [heads];
      r.vars[`${e.store}:tails`] = [tails];
    }
    return DONE;
  },
  if(s, r, e) {
    return { push: evalCond(s, r, e.cond) ? e.then : (e.else ?? []) };
  },
  may(s, r, e, key) {
    const chooser = playersOf(s, r, e.chooser);
    const a = answer(r, key("may"), chooser, {
      type: "yesNo",
      prompt: e.prompt,
      intent: "yesNo",
      suggested: [1],
      source: r.defId,
    });
    if (isAsk(a)) return { ask: a };
    return { push: a[0] === 1 ? e.then : (e.else ?? []) };
  },
  chooseOne(s, r, e, key) {
    const options = e.options.map((o, i) => ({ o, i })).filter(({ o }) => !o.cond || evalCond(s, r, o.cond));
    if (!options.length) return DONE;
    const ids = options.map(({ i }) => String(i));
    const a = answer(r, key("mode"), r.player, {
      type: "pick",
      options: ids,
      min: 1,
      max: 1,
      prompt: e.prompt,
      intent: "mode",
      suggested: [ids[0] as string],
      labels: Object.fromEntries(options.map(({ o, i }) => [String(i), o.label])),
      source: r.defId,
    });
    if (isAsk(a)) return { ask: a };
    return { push: e.options[Number(a[0])]?.effects ?? [] };
  },
  repeat(s, r, e) {
    const n = Math.min(100, evalAmount(s, r, e.n));
    return n > 0 ? { push: e.effects, repeat: n - 1 } : DONE;
  },
  forEach(_s, r, e) {
    const items = (r.vars[e.key] ?? []).map(String);
    return items.length ? { push: e.effects, each: { key: e.key, as: e.as, items } } : DONE;
  },
  timed(s, r, e) {
    const t = s.turn.number;
    const [fromTurn, untilTurn] =
      e.duration === "thisTurn"
        ? [t, t]
        : e.duration === "opponentsNextTurn"
          ? [t + 1, t + 1]
          : e.duration === "yourNextTurn"
            ? [t + 2, t + 2]
            : [t, t + 1];
    let rule: StaticRule = e.rule;
    let attackEffect = false;
    if (e.target) {
      const ids = resolveRef(s, r, e.target);
      if (!ids.length) return DONE;
      // Bound to these Pokémon: the rule's own scope (self, side, filter) no longer applies.
      if ("scope" in rule && rule.scope) rule = { ...rule, scope: { side: "both", ids } } as StaticRule;
      attackEffect = r.kind === "attack";
    }
    const effect: TimedEffect = { id: newId(s, "t"), player: r.player, rule, fromTurn, untilTurn, defId: r.defId };
    if (attackEffect) effect.attackEffect = true;
    s.effects.push(effect);
    bump(s);
    return DONE;
  },
  lockAttack(s, r, e, key) {
    const target = resolveRef(s, r, e.target)[0];
    if (!target) return DONE;
    const attacks = chars(s, target).attacks.filter((a) => !a.source);
    if (!attacks.length) return DONE;
    const top = topDef(s, target);
    const options = attacks.map((a) => String(a.index));
    const got = answer(r, key("attack"), r.player, {
      type: "pick",
      options,
      min: 1,
      max: 1,
      prompt: e.prompt,
      intent: "mode",
      suggested: [options[0] as string],
      attacks: Object.fromEntries(attacks.map((a) => [String(a.index), { defId: top.id, index: a.index }])),
    });
    if (isAsk(got)) return { ask: got };
    const chosen = attacks.find((a) => String(a.index) === String(got[0]));
    if (!chosen) return DONE;
    return (HANDLERS.timed as NonNullable<OpHandlers["timed"]>)(
      s,
      r,
      {
        op: "timed",
        duration: e.duration,
        rule: { s: "cantAttack", scope: { side: "opp" }, attack: chosen.def.name },
        target: e.target,
      },
      key,
    );
  },
  markUsed(s, r, e) {
    s.turnLog.push({ turn: s.turn.number, player: r.player, kind: "abilityUsed", key: e.key });
    return DONE;
  },
  endTurn(s) {
    s.turn.ending = true;
    return DONE;
  },
};
