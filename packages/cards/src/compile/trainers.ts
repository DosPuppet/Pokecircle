/** Trainer card texts (Items, Supporters, Tools, Stadiums). */
import type { Condition, Effect, StaticRule, TrainerDef } from "@pocketmate/engine";
import { amt, cond, fx, msg, ref, scope } from "@pocketmate/engine";
import { COMMON, type Ctx, chooseIn } from "./effects";
import { num, pokemonFilter } from "./phrases";
import { type Built, matchAll, sentence, type Template, tpl } from "./templates";

const ctx: Ctx = { inAttack: false };
const holder = () => scope.self();
const statics = (...rules: StaticRule[]): Built & { statics: StaticRule[] } => ({ statics: rules });

type TBuilt = Built & { statics?: StaticRule[] };

/** "Flip a coin. If heads, …" where the rest of the text is the clause (several sentences). */
function flipped(text: string): Built | null {
  const m = matchAll(sentence(text), TRAINER_TEMPLATES, ctx);
  if ("unmatched" in m) return null;
  const parts = m.parts as TBuilt[];
  if (parts.some((p) => p.statics?.length)) return null;
  const effects = [...parts.flatMap((p) => p.pre ?? []), ...parts.flatMap((p) => p.post ?? [])];
  const conds = parts.map((p) => p.condition).filter((c): c is Condition => !!c);
  const out: Built = { post: [fx.flip(), fx.if(cond.heads(), effects)] };
  if (conds.length) out.condition = conds.length === 1 ? (conds[0] as Condition) : cond.and(...conds);
  return out;
}

export const TRAINER_TEMPLATES: Template<Ctx>[] = [
  tpl("flip.headsRest", "Flip a coin. If heads, {X}", ([rest]) => flipped(rest as string)),
  tpl("cost.discard", "You can use this card only if you discard {w} other card{s} from your hand.", ([w]) => {
    const n = num(w);
    if (!n) return null;
    return {
      pre: [
        fx.chooseCards("hand", "cost", msg("Choose cards to discard from your hand"), { min: n, max: n, notSource: true }),
        fx.move("cost", "discard"),
      ],
      condition: cond.cmp(amt.cards("hand", "me"), ">=", n + 1),
    };
  }),
  tpl("hand.eachShuffleDraw", "Each player shuffles their hand into their deck and draws {w} cards.", ([w]) => {
    const n = num(w);
    if (!n) return null;
    return {
      post: [
        fx.moveAll("hand", "me", "deck"),
        fx.shuffle("me"),
        fx.moveAll("hand", "opp", "deck"),
        fx.shuffle("opp"),
        fx.draw(n, "me"),
        fx.draw(n, "opp"),
      ],
    };
  }),
  tpl("hand.shuffleDraw", "Shuffle your hand into your deck. Then, draw {w} cards.", ([w]) => {
    const n = num(w);
    return n ? { post: [fx.moveAll("hand", "me", "deck"), fx.shuffle("me"), fx.draw(n)] } : null;
  }),
  tpl("hand.discardDraw", "Discard your hand and draw {w} cards.", ([w]) => {
    const n = num(w);
    return n ? { post: [fx.moveAll("hand", "me", "discard"), fx.draw(n)], condition: cond.deck() } : null;
  }),
  tpl(
    "heal.superPotion",
    "Heal {n} damage from 1 of your Pokémon. If you healed any damage in this way, discard an Energy from that Pokémon.",
    ([n]) => {
      const damaged = scope.mine({ damaged: true });
      return {
        post: [
          chooseIn(damaged, "t", { min: 1, max: 1 }),
          fx.heal(ref.v("t"), Number(n)),
          fx.if(cond.cmp(amt.v("healed"), ">", 0), [fx.discardEnergy(ref.v("t"), 1)]),
        ],
        condition: cond.exists(damaged),
      };
    },
  ),
  // —— Tools ——
  tpl("tool.hp", "The Pokémon this card is attached to gets +{n} HP.", ([n]) =>
    statics({ s: "hp", scope: holder(), add: Number(n) }),
  ),
  tpl("tool.hpFor", "The {x} this card is attached to gets +{n} HP.", ([who, n]) => {
    const f = pokemonFilter(who as string);
    return f ? statics({ s: "hp", scope: { ...holder(), filter: f }, add: Number(n) }) : null;
  }),
  tpl("tool.noRetreat", "The Pokémon this card is attached to has no Retreat Cost.", () =>
    statics({ s: "retreat", scope: holder(), set: 0 }),
  ),
  tpl("tool.retreatLess", "The Retreat Cost of the Pokémon this card is attached to is {C} less.", () =>
    statics({ s: "retreat", scope: holder(), delta: -1 }),
  ),
  tpl(
    "tool.dealt",
    "Attacks used by the Pokémon this card is attached to do {n} more damage to your opponent's Active Pokémon (before applying Weakness and Resistance).",
    ([n]) => statics({ s: "dealt", scope: holder(), add: Number(n), activeOnly: true }),
  ),
  ...COMMON,
];

export interface CompiledTrainer {
  trainer: Partial<TrainerDef>;
  templates: string[];
}

export function compileTrainer(text: string | undefined, kind: TrainerDef["kind"]): CompiledTrainer | { unmatched: string } {
  if (!text) return { unmatched: "" };
  const m = matchAll(text, TRAINER_TEMPLATES, ctx);
  if ("unmatched" in m) return m;
  const parts = m.parts as TBuilt[];
  const effects: Effect[] = [...parts.flatMap((p) => p.pre ?? []), ...parts.flatMap((p) => p.post ?? [])];
  const conds = parts.map((p) => p.condition).filter((c): c is Condition => !!c);
  const rules = parts.flatMap((p) => p.statics ?? []);
  const out: Partial<TrainerDef> = {};
  if (kind === "tool" || kind === "stadium") {
    if (effects.length) return { unmatched: text };
    out.statics = rules;
  } else {
    if (rules.length) return { unmatched: text };
    out.effects = effects;
  }
  if (conds.length) out.condition = conds.length === 1 ? (conds[0] as Condition) : cond.and(...conds);
  return { trainer: out, templates: m.ids };
}
