/** Damage, damage counters and healing ops. */
import { type DamageOptions, dealAttackDamage, healDamage, putCounters } from "../damage";
import { answer, DONE, evalAmount, isAsk, resolveRef } from "../effects";
import { emit } from "../events";
import { scopePokemon } from "../match";
import type { OpHandlers } from "../opRegistry";
import { bump, pokemonOf } from "../state";
import { rulesOn } from "../statics";

/** The damage options of an op ("isn't affected by Weakness or Resistance", "…by any effects…"). */
function damageOptions(e: {
  noWR?: boolean;
  noWeakness?: boolean;
  noResistance?: boolean;
  ignoreEffects?: boolean;
}): DamageOptions {
  const opts: DamageOptions = {};
  if (e.noWR) opts.noWR = true;
  if (e.noWeakness) opts.noWeakness = true;
  if (e.noResistance) opts.noResistance = true;
  if (e.ignoreEffects) opts.ignoreEffects = true;
  return opts;
}

export const HANDLERS: OpHandlers = {
  mainDamage(s, r, e) {
    const a = r.attack;
    if (!a || a.fails) return DONE;
    const target = e.to ? resolveRef(s, r, e.to)[0] : a.defending;
    if (target && s.pokemon[target]) {
      const opts = damageOptions(e);
      r.vars.mainDamage = [dealAttackDamage(s, r, target, a.base + a.bonus, opts)];
    }
    return DONE;
  },
  bonusDamage(s, r, e) {
    if (r.attack) r.attack.bonus += evalAmount(s, r, e.amount);
    return DONE;
  },
  lessDamage(s, r, e) {
    if (r.attack) r.attack.bonus -= evalAmount(s, r, e.amount);
    return DONE;
  },
  setDamage(s, r, e) {
    if (r.attack) r.attack.base = evalAmount(s, r, e.amount);
    return DONE;
  },
  attackFails(_s, r) {
    if (r.attack) {
      r.attack.fails = true;
      if (r.source) emit({ type: "attackFails", player: r.player, pokemon: r.source });
    }
    return DONE;
  },
  damage(s, r, e) {
    const n = evalAmount(s, r, e.amount);
    for (const t of resolveRef(s, r, e.to)) {
      if (r.kind === "attack") {
        const opts = damageOptions(e);
        dealAttackDamage(s, r, t, n, opts);
      } else if (n > 0) {
        // Damage that is not from an attack: no Weakness, Resistance or attack modifiers.
        pokemonOf(s, t).damage += n;
        bump(s);
        emit({ type: "damage", target: t, amount: n });
      }
    }
    return DONE;
  },
  counters(s, r, e) {
    const n = evalAmount(s, r, e.n);
    for (const t of resolveRef(s, r, e.to)) putCounters(s, r, t, n);
    return DONE;
  },
  spreadCounters(s, r, e, key) {
    const n = evalAmount(s, r, e.n);
    const among = scopePokemon(s, e.scope, r.player, r.source);
    if (n <= 0 || !among.length) return DONE;
    const a = answer(r, key("divide"), r.player, {
      type: "divide",
      among,
      total: n,
      prompt: e.prompt,
      intent: "counters",
      suggested: among.map((_, i) => (i === 0 ? n : 0)),
      source: r.defId,
    });
    if (isAsk(a)) return { ask: a };
    among.forEach((t, i) => {
      putCounters(s, r, t, Number(a[i] ?? 0));
    });
    return DONE;
  },
  moveCounters(s, r, e) {
    const from = resolveRef(s, r, e.from)[0];
    const to = resolveRef(s, r, e.to)[0];
    if (!from || !to) return DONE;
    if (rulesOn(s, "noMoveCounters", from).length) return DONE;
    const pk = pokemonOf(s, from);
    const n = e.n === "all" ? pk.damage / 10 : Math.min(pk.damage / 10, evalAmount(s, r, e.n));
    if (n <= 0) return DONE;
    pk.damage -= n * 10;
    emit({ type: "heal", target: from, amount: n * 10 });
    putCounters(s, r, to, n);
    return DONE;
  },
  heal(s, r, e) {
    let healed = 0;
    for (const t of resolveRef(s, r, e.target))
      healed += healDamage(s, t, e.amount === "all" ? "all" : evalAmount(s, r, e.amount));
    r.vars.healed = [healed];
    return DONE;
  },
};
