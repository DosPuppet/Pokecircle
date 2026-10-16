/** Trainer card texts (Items, Supporters, Tools, Stadiums). */
import type { CardDef, Condition, Effect, StaticRule, TrainerDef } from "@pokecircle/engine";
import { amt, cond, fx, msg, ref, scope } from "@pokecircle/engine";
import { COMMON, type Ctx, chooseIn } from "./effects";
import { num, pokemonFilter, typeSym } from "./phrases";
import { compileStatics } from "./statics";
import { type Built, matchAll, normalize, sentence, type Template, tpl } from "./templates";

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
  tpl("only.lastCard", "You can use this card only when it is the last card in your hand.", () => ({
    condition: cond.cmp(amt.cards("hand", "me"), "==", 1),
  })),
  tpl("first.supporterOk", "If you go first, you may use this card during your first turn.", () => ({ firstTurn: true })),
  tpl("first.notFirstTurn", "You can't use this card during your first turn.", () => ({
    condition: cond.not({ c: "firstTurn" }),
  })),
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
  tpl("tool.retreatLess2", "The Retreat Cost of the Pokémon this card is attached to is {C}{C} less.", () =>
    statics({ s: "retreat", scope: holder(), delta: -2 }),
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
  /** A Trainer played as a Pokémon (Fossils): its characteristics in play. */
  pokemon?: Pick<CardDef, "hp" | "types" | "stage" | "retreat">;
}

/**
 * "Once during each player's turn, that player may search their deck for … and put them onto their Bench. Then, that
 * player shuffles their deck.": the Stadium's action, read as if "you" played it.
 */
function stadiumAction(text: string): CompiledTrainer | null {
  const m = /^Once during each player's turn, that player may (.+)$/.exec(normalize(text));
  if (!m) return null;
  const body = (m[1] as string)
    .replace(/\bThen, that player shuffles their deck\./g, "Then, shuffle your deck.")
    .replace(/\btheir (deck|Bench|hand|discard pile|Active Pokémon|Pokémon)\b/g, "your $1");
  const c = matchAll(sentence(body), TRAINER_TEMPLATES, ctx);
  if ("unmatched" in c) return null;
  const parts = c.parts as TBuilt[];
  if (parts.some((p) => p.statics?.length)) return null;
  const effects = [...parts.flatMap((p) => p.pre ?? []), ...parts.flatMap((p) => p.post ?? [])];
  const conds = parts.map((p) => p.condition).filter((k): k is Condition => !!k);
  const trainer: Partial<TrainerDef> = { stadiumAction: true, effects };
  if (conds.length) trainer.condition = conds.length === 1 ? (conds[0] as Condition) : cond.and(...conds);
  return { trainer, templates: ["stadium.action", ...c.ids] };
}

/** "Play this card as if it were a 60-HP Basic {C} Pokémon. This card can't be affected by any Special Conditions…" */
function asPokemon(text: string): CompiledTrainer | null {
  const m =
    /^Play this card as if it were an? (\d+)-HP Basic (\{[A-Z]\}) Pokémon\. This card can't be affected by any Special Conditions and can't retreat\. At any time during your turn, you may discard this card from play\.$/.exec(
      normalize(text),
    );
  const type = m && typeSym(m[2]);
  if (!m || !type) return null;
  return {
    trainer: {
      asPokemon: true,
      discardFromPlay: true,
      statics: [
        { s: "noConditions", scope: holder() },
        { s: "cantRetreat", scope: holder() },
      ],
    },
    templates: ["trainer.asPokemon"],
    pokemon: { hp: Number(m[1]), types: [type], stage: "basic", retreat: 0 },
  };
}

export function compileTrainer(text: string | undefined, kind: TrainerDef["kind"]): CompiledTrainer | { unmatched: string } {
  if (!text) return { unmatched: "" };
  // ACE SPEC: "This card can't be put into your hand or deck from the discard pile."
  const ace = /\s*This card can't be put into your hand or deck from the discard pile\.\s*$/;
  if (ace.test(normalize(text))) {
    const c = compileTrainer(normalize(text).replace(ace, ""), kind);
    return "unmatched" in c ? c : { ...c, trainer: { ...c.trainer, noRecovery: true } };
  }
  if (kind === "item") {
    const fossil = asPokemon(text);
    if (fossil) return fossil;
  }
  if (kind === "tool" || kind === "stadium") {
    const rules = compileStatics(text, kind);
    if (rules) return { trainer: { statics: rules }, templates: ["statics"] };
  }
  if (kind === "stadium") {
    const action = stadiumAction(text);
    if (action) return action;
  }
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
  if (parts.some((p) => p.firstTurn)) {
    if (kind !== "supporter") return { unmatched: text };
    out.firstTurnOk = true;
  }
  return { trainer: out, templates: m.ids };
}
