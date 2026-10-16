/**
 * Ability texts: activated ("Once during your turn, you may …"), triggered ("When you play this Pokémon from your hand
 * onto your Bench …") and continuous ("Your Basic Pokémon in play have no Retreat Cost.").
 */
import type { AbilityDef, Condition, Effect, StaticRule, TriggerDef } from "@pokecircle/engine";
import { amt, cond, fx, msg, ref, scope } from "@pokecircle/engine";
import { COMMON, type Ctx, chooseIn } from "./effects";
import { cardFilter, condPhrase, num, scopePhrase, typeSym } from "./phrases";
import { compileStatics } from "./statics";
import { matchAll, normalize, sentence, type Template, tpl } from "./templates";

const ctx: Ctx = { inAttack: false };

/** Effect sentences an Ability can do (besides the common ones). */
const ABILITY_EFFECTS: Template<Ctx>[] = [
  tpl(
    "ab.attachHandSelf",
    "Attach a Basic {t} Energy card from your hand to this Pokémon. If you attached Energy to a Pokémon in this way, {x}.",
    ([t, rest]) => {
      const type = typeSym(t);
      const then = clause(rest as string);
      if (!type || !then) return null;
      const filter = { category: ["energy" as const], basicEnergy: true, energyTypes: [type] };
      return {
        post: [
          fx.chooseCards("hand", "e", msg("Choose an Energy card from your hand"), { filter, min: 1, max: 1 }),
          fx.attach("e", scope.self(), msg("Choose the Pokémon to attach the card to"), "to"),
          fx.if(cond.cmp(amt.count("e"), ">", 0), then),
        ],
        condition: cond.hasCards("hand", "me", filter),
      };
    },
  ),
  tpl(
    "ab.attachHandOne",
    "Attach a Basic {t} Energy card from your hand to 1 of your Pokémon. If you attached Energy to a Pokémon in this way, {x}.",
    ([t, rest]) => {
      const type = typeSym(t);
      const then = clause((rest as string).replace("that Pokémon", "the chosen Pokémon"));
      if (!type || !then) return null;
      const filter = { category: ["energy" as const], basicEnergy: true, energyTypes: [type] };
      return {
        post: [
          fx.chooseCards("hand", "e", msg("Choose an Energy card from your hand"), { filter, min: 1, max: 1 }),
          fx.attach("e", scope.mine(), msg("Choose the Pokémon to attach the card to"), "attachedTo"),
          fx.if(cond.cmp(amt.count("e"), ">", 0), then),
        ],
        condition: cond.hasCards("hand", "me", filter),
      };
    },
  ),
  tpl("ab.healChosen", "Heal {n} damage from the chosen Pokémon.", ([n]) => ({
    post: [fx.heal(ref.v("attachedTo"), Number(n))],
  })),
  tpl(
    "ab.countersKO",
    "Put {w} damage counters on 1 of your opponent's Pokémon. If you use this Ability, this Pokémon is Knocked Out.",
    ([w]) => {
      const n = num(w);
      return n
        ? {
            post: [
              chooseIn(scope.theirs(), "t", { min: 1, max: 1 }),
              fx.counters(ref.v("t"), n),
              { op: "knockOut", target: ref.self },
            ],
          }
        : null;
    },
  ),
  tpl("ab.flipHeads", "Flip a coin. If heads, {x}.", ([h]) => {
    const then = clause(h as string);
    return then ? { post: [fx.flip(), fx.if(cond.heads(), then)] } : null;
  }),
  tpl("ab.discardStadium", "Discard a Stadium in play.", () => ({ post: [fx.discardStadium()], condition: { c: "stadium" } })),
  tpl("ab.switchIt", "Switch it with your Active Pokémon.", () => ({
    post: [fx.choosePokemon(scope.self(), "selfId", msg("This Pokémon")), { op: "switch", side: "me", with: "selfId" }],
  })),
  // This Benched Pokémon becomes the Active one (not a Benched Pokémon of the player's choice).
  tpl("ab.switchSelf", "Switch this Pokémon with your Active Pokémon.", () => ({
    post: [fx.choosePokemon(scope.self(), "selfId", msg("This Pokémon")), { op: "switch", side: "me", with: "selfId" }],
  })),
  ...COMMON,
];

function clause(text: string): Effect[] | null {
  const m = matchAll(sentence(text), ABILITY_EFFECTS, ctx);
  if ("unmatched" in m) return null;
  return m.parts.flatMap((p) => [...(p.pre ?? []), ...(p.post ?? [])]);
}

/** The effects (and their playability condition) of the effect part of an Ability. */
function body(text: string): { effects: Effect[]; condition?: Condition } | null {
  const m = matchAll(text, ABILITY_EFFECTS, ctx);
  if ("unmatched" in m) return null;
  const effects = m.parts.flatMap((p) => [...(p.pre ?? []), ...(p.post ?? [])]);
  const conds = m.parts.map((p) => p.condition).filter((c): c is Condition => !!c);
  return conds.length ? { effects, condition: conds.length === 1 ? (conds[0] as Condition) : cond.and(...conds) } : { effects };
}

/** Limits written at the end of an Ability ("You can't use more than 1 X Ability each turn."). */
function limits(text: string): { text: string; byName: boolean; endsTurn: boolean; onceKey?: string } {
  let t = text;
  let byName = false;
  let endsTurn = false;
  let onceKey: string | undefined;
  const name = /\s*You can't use more than 1 (.+?) Ability (?:each turn|during your turn)\.$/.exec(t);
  if (name) {
    byName = true;
    t = t.slice(0, name.index);
  }
  const group = /\s*You can't use more than 1 Ability that has "(.+?)" in its name each turn\.$/.exec(t);
  if (group) {
    onceKey = group[1] as string;
    t = t.slice(0, group.index);
  }
  const ends = /\s*If you use this Ability, your turn ends\.$/.exec(t);
  if (ends) {
    endsTurn = true;
    t = t.slice(0, ends.index);
  }
  return { text: t.trim(), byName, endsTurn, ...(onceKey ? { onceKey } : {}) };
}

type AbilityParts = Pick<AbilityDef, "activated" | "statics" | "triggers">;

const STATIC_TEMPLATES: Template<Ctx & { rules?: StaticRule[] }>[] = [
  tpl(
    "st.noEffects",
    "Prevent all effects of attacks used by your opponent's Pokémon done to this Pokémon. (Damage is not an effect.)",
    (_g, c) => {
      c.rules = [{ s: "prevent", scope: scope.self(), what: "effects" }];
      return {};
    },
  ),
  tpl(
    "st.benchShieldSelf",
    "As long as this Pokémon is on your Bench, prevent all damage from and effects of attacks from your opponent's Pokémon done to this Pokémon.",
    (_g, c) => {
      c.rules = [{ s: "prevent", scope: scope.self(), what: "all", cond: cond.not({ c: "isActive", ref: ref.self }) }];
      return {};
    },
  ),
  tpl(
    "st.activeIntimidate",
    "As long as this Pokémon is in the Active Spot, attacks used by your opponent's Active Pokémon do {n} less damage (before applying Weakness and Resistance).",
    ([n], c) => {
      c.rules = [{ s: "dealt", scope: scope.oppActive(), add: -Number(n), cond: { c: "isActive", ref: ref.self } }];
      return {};
    },
  ),
  tpl("st.noEnergyFreeRetreat", "If this Pokémon has no Energy attached, it has no Retreat Cost.", (_g, c) => {
    c.rules = [{ s: "retreat", scope: scope.self(), set: 0, cond: cond.cmp(amt.energy(ref.self), "==", 0) }];
    return {};
  }),
  tpl(
    "st.dampAll",
    "Pokémon in play (both yours and your opponent's) lose all Abilities that require those Pokémon to be Knocked Out.",
    (_g, c) => {
      c.rules = [{ s: "noAbilities", scope: scope.of("both", "any", { selfKOAbility: true }) }];
      return {};
    },
  ),
  tpl(
    "st.hideNSneak",
    "Prevent all effects of your opponent's Pokémon's attacks and Abilities done to this Pokémon. (Damage is not an effect.)",
    (_g, c) => {
      c.rules = [
        { s: "prevent", scope: scope.self(), what: "effects" },
        { s: "shielded", scope: scope.self(), from: "abilities" },
      ];
      return {};
    },
  ),
  tpl("st.preventFrom", "Prevent all damage done to this Pokémon by attacks from your opponent's {X}.", ([x], c) => {
    const sc = scopePhrase(`your opponent's ${x}`);
    if (!sc?.filter) return null;
    c.rules = [{ s: "prevent", scope: scope.self(), what: "damage", from: sc.filter }];
    return {};
  }),
  tpl(
    "st.dealtYour",
    "Attacks used by your {X} do {n} more damage to your opponent's Active Pokémon (before applying Weakness and Resistance).",
    ([x, n], c) => {
      const sc = scopePhrase(`your ${x}`);
      if (!sc) return null;
      c.rules = [{ s: "dealt", scope: sc, add: Number(n), activeOnly: true }];
      return {};
    },
  ),
  tpl("st.noRetreatBasics", "Your Basic Pokémon in play have no Retreat Cost.", (_g, c) => {
    c.rules = [{ s: "retreat", scope: scope.mine({ stage: ["basic"] }), set: 0 }];
    return {};
  }),
  tpl("st.noRetreatSelf", "This Pokémon has no Retreat Cost.", (_g, c) => {
    c.rules = [{ s: "retreat", scope: scope.self(), set: 0 }];
    return {};
  }),
  tpl("st.takesLess", "This Pokémon takes {n} less damage from attacks (after applying Weakness and Resistance).", ([n], c) => {
    c.rules = [{ s: "taken", scope: scope.self(), add: -Number(n) }];
    return {};
  }),
  tpl(
    "st.benchShield",
    "Prevent all damage from and effects of attacks from your opponent's Pokémon done to your Benched Pokémon.",
    (_g, c) => {
      c.rules = [{ s: "prevent", scope: scope.myBench(), what: "all" }];
      return {};
    },
  ),
  tpl(
    "st.benchNoRuleBox",
    "Prevent all damage done to your Benched Pokémon that don't have a Rule Box by attacks from your opponent's Pokémon.",
    (_g, c) => {
      c.rules = [{ s: "prevent", scope: scope.myBench({ noTags: ["ruleBox"] }), what: "damage" }];
      return {};
    },
  ),
  tpl(
    "st.damp",
    "Pokémon in play (both yours and your opponent's) lose any Ability that requires the Pokémon using it to Knock Out itself.",
    (_g, c) => {
      c.rules = [{ s: "noAbilities", scope: scope.of("both", "any", { selfKOAbility: true }) }];
      return {};
    },
  ),
  tpl(
    "st.weakness",
    "The Weakness of each of your opponent's {t} Pokémon in play is now {t}. (Apply Weakness as ×2.)",
    ([a, b], c) => {
      const from = typeSym(a);
      const to = typeSym(b);
      if (!from || !to) return null;
      c.rules = [{ s: "weakness", scope: scope.theirs({ types: [from] }), type: to }];
      return {};
    },
  ),
  tpl(
    "st.energyAs",
    "Each Basic {t} Energy attached to all of your Pokémon provides {t}{t} Energy. The effect of {x} doesn't stack.",
    ([a, b, c2], c) => {
      const t = typeSym(a);
      if (!t || typeSym(b) !== t || typeSym(c2) !== t) return null;
      c.rules = [{ s: "energyAs", scope: scope.mine(), basic: t, provides: [[t], [t]] }];
      return {};
    },
  ),
  tpl(
    "st.festivalLead",
    "If Festival Grounds is in play, this Pokémon may use an attack it has twice. If the first attack Knocks Out your opponent's Active Pokémon, you may attack again after your opponent chooses a new Active Pokémon.",
    (_g, c) => {
      c.rules = [{ s: "attackTwice", scope: scope.self(), cond: { c: "stadium", names: ["Festival Grounds"] } }];
      return {};
    },
  ),
  tpl(
    "st.memoryHelix",
    "This Pokémon can use the attacks of any of your Benched Pokémon. (You still need the necessary Energy to use each attack.)",
    (_g, c) => {
      c.rules = [{ s: "borrowAttacks", scope: scope.self(), from: scope.myBench() }];
      return {};
    },
  ),
  tpl(
    "st.aceNullifier",
    "If this Pokémon has a Pokémon Tool attached, your opponent can't play any ACE SPEC cards from their hand.",
    (_g, c) => {
      c.rules = [
        {
          s: "cantPlay",
          side: "opp",
          kinds: ["item", "supporter", "stadium", "tool"],
          tags: ["aceSpec"],
          cond: cond.matches(ref.self, { hasTool: true }),
        },
      ];
      return {};
    },
  ),
  tpl(
    "st.costIfOppDiscard",
    'If your opponent has any cards in their discard pile that have "{x}" in the name, this Pokémon can use the {x} attack for {t}.',
    ([word, attack, t], c) => {
      const type = typeSym(t);
      if (!type) return null;
      c.rules = [
        {
          s: "attackCostIs",
          scope: scope.self(),
          attack: attack as string,
          cost: [type],
          cond: cond.hasCards("discard", "opp", { nameIncludes: word as string }),
        },
      ];
      return {};
    },
  ),
  tpl("st.costIfTera", "If you have any Tera Pokémon in play, this Pokémon can use the {x} attack for {t}.", ([attack, t], c) => {
    const type = typeSym(t);
    if (!type) return null;
    c.rules = [
      {
        s: "attackCostIs",
        scope: scope.self(),
        attack: attack as string,
        cost: [type],
        cond: cond.exists(scope.mine({ tags: ["tera"] })),
      },
    ];
    return {};
  }),
];

function trigger(on: TriggerDef["on"], effects: Effect[], opts: Partial<TriggerDef> = {}): AbilityParts {
  return { triggers: [{ on, effects, ...opts }] };
}

/** Compiles an Ability; `{ unmatched }` when a part is not understood. */
export function compileAbility(text: string): AbilityParts | { unmatched: string } {
  const t = normalize(text);
  // Continuous Abilities.
  const holder: Ctx & { rules?: StaticRule[] } = { inAttack: false };
  for (const st of STATIC_TEMPLATES) {
    const m = st.re.exec(t);
    if (m && m[0].trim().length === t.length && st.build(m.slice(1), holder) && holder.rules) return { statics: holder.rules };
  }
  const rules = compileStatics(t, "ability");
  if (rules) return { statics: rules };
  const lim = limits(t);
  let rest = lim.text;
  // Triggered Abilities.
  const trig: [RegExp, TriggerDef["on"], Partial<TriggerDef>][] = [
    [
      /^When you play this Pokémon from your hand onto your Bench during your turn, you may (.+)$/,
      "playedToBench",
      { may: true },
    ],
    [
      /^Once during your turn, when you play this Pokémon from your hand onto your Bench, you may use this Ability\. (.+)$/,
      "playedToBench",
      { may: true, oncePerTurn: true },
    ],
    [
      /^When you play this Pokémon from your hand to evolve 1 of your Pokémon during your turn, you may (.+)$/,
      "evolved",
      { may: true },
    ],
    [
      /^Once during your turn, when you play this Pokémon from your hand to evolve 1 of your Pokémon, you may use this Ability\. (.+)$/,
      "evolved",
      { may: true, oncePerTurn: true },
    ],
    [
      /^If this Pokémon is in the Active Spot and is damaged by an attack from your opponent's Pokémon \(even if this Pokémon is Knocked Out\), (.+)$/,
      "damagedByAttack",
      { byOpponentAttack: true },
    ],
    [
      /^If this Pokémon is Knocked Out by damage from an attack from your opponent's Pokémon, (.+)$/,
      "knockedOut",
      { byOpponentAttack: true },
    ],
    [
      /^If this Pokémon is in the Active Spot and is Knocked Out by damage from an attack from your opponent's Pokémon, (.+)$/,
      "knockedOut",
      { byOpponentAttack: true, condition: { c: "var", key: "ev:wasActive" } },
    ],
    [
      /^During Pokémon Checkup, if this Pokémon is in the Active Spot, (.+)$/,
      "checkup",
      { condition: { c: "isActive", ref: ref.self } },
    ],
    [/^During Pokémon Checkup, (.+)$/, "checkup", {}],
    [
      /^Once during your turn, when this Pokémon moves from your Bench to the Active Spot, you may (.+)$/,
      "becameActive",
      { may: true, oncePerTurn: true, condition: { c: "myTurn" } },
    ],

    [/^Whenever your opponent's Active Pokémon moves to the Bench during their turn, (.+)$/, "oppToBench", {}],
    [
      /^As long as this Pokémon is in the Active Spot, whenever your opponent's Active Pokémon moves to the Bench during their turn, (.+)$/,
      "oppToBench",
      { condition: { c: "isActive", ref: ref.self } },
    ],
    [
      /^Once during your turn, when this Pokémon moves from the Active Spot to your Bench, you may use this Ability\. (.+)$/,
      "movedToBench",
      { may: true, oncePerTurn: true, condition: { c: "myTurn" } },
    ],
  ];
  for (const [re, on, opts] of trig) {
    const m = re.exec(rest);
    if (!m) continue;
    // The Pokémon of the event: "that Pokémon" (it moved to the Bench), "their new Active Pokémon".
    const text = on === "oppToBench" ? (m[1] as string).replace(/\bthat Pokémon\b/g, "the moved Pokémon") : (m[1] as string);
    const b = body(sentence(text));
    if (!b) return { unmatched: m[1] as string };
    const extra: Partial<TriggerDef> = { ...opts };
    if (lim.onceKey) extra.onceKey = lim.onceKey;
    if (lim.byName) extra.onceKey = `name:${t}`;
    // "(even if this Pokémon is Knocked Out)": where it was when it was damaged.
    if (on === "damagedByAttack") extra.condition = { c: "var", key: "ev:wasActive" };
    if (b.condition) extra.condition = extra.condition ? cond.and(extra.condition, b.condition) : b.condition;
    return trigger(on, b.effects, extra);
  }
  // Activated Abilities.
  let where: "active" | "bench" | undefined;
  let condition: Condition | undefined;
  const limit: { once: "turn" | "none" } = { once: "turn" };
  const pre: Effect[] = [];
  // "You must discard 2 cards (a Basic {R} Energy card) from your hand in order to use this Ability."
  const cost = /^You must discard (a|an|\w+) (.+?) from your hand in order to use this Ability\. /.exec(rest);
  const costFilter = cost ? cardFilter(cost[2] as string) : null;
  if (cost && costFilter) {
    const n = num(cost[1]) ?? 1;
    pre.push(
      fx.chooseCards("hand", "cost", msg("Choose cards to discard from your hand"), {
        ...(costFilter.filter ? { filter: costFilter.filter } : {}),
        min: n,
        max: n,
      }),
      fx.move("cost", "discard"),
    );
    condition = cond.hasCards("hand", "me", costFilter.filter, n);
    rest = rest.slice(cost[0].length);
  }
  // "You must discard a Basic {L} Energy from this Pokémon in order to use this Ability."
  const selfCost =
    /^You must discard (a|an|\w+) (Basic )?(\{[A-Z]\} )?Energy from this Pokémon in order to use this Ability\. /.exec(rest);
  if (selfCost) {
    const n = num(selfCost[1]) ?? 1;
    const type = selfCost[3] ? typeSym(selfCost[3].trim()) : undefined;
    if (type === null) return { unmatched: rest };
    const opts = { ...(type ? { type } : {}), ...(selfCost[2] ? { basic: true } : {}) };
    pre.push(fx.discardEnergy(ref.self, n, { ...(type ? { types: [type] } : {}) }));
    condition = cond.cmp(amt.energy(ref.self, opts), ">=", n);
    rest = rest.slice(selfCost[0].length);
  }
  const forms: [RegExp, (g: string[]) => boolean][] = [
    [
      /^Once during your turn, if this Pokémon is in the Active Spot, you may use this Ability\. (.+)$/,
      ([x]) => {
        where = "active";
        rest = sentence(x as string);
        return true;
      },
    ],
    [
      /^Once during your turn, if this Pokémon is on your Bench, you may use this Ability\. (.+)$/,
      ([x]) => {
        where = "bench";
        rest = sentence(x as string);
        return true;
      },
    ],
    [
      /^Once during your turn, if (.+?), you may (?:use this Ability\. )?(.+)$/,
      ([c, x]) => {
        const k = condPhrase(c as string, false);
        if (!k) return false;
        condition = condition ? cond.and(condition, k) : k;
        rest = sentence(x as string);
        return true;
      },
    ],
    [
      /^Once during your first turn, you may (.+)$/,
      ([x]) => {
        condition = condition ? cond.and(condition, { c: "firstTurn" }) : { c: "firstTurn" };
        rest = sentence(x as string);
        return true;
      },
    ],
    [
      /^Once during your turn, you may (?:use this Ability\. )?(.+)$/,
      ([x]) => {
        rest = sentence(x as string);
        return true;
      },
    ],
    [
      /^As often as you like during your turn, if (.+?), you may (?:use this Ability\. )?(.+)$/,
      ([c, x]) => {
        const k = condPhrase(c as string, false);
        if (!k) return false;
        condition = condition ? cond.and(condition, k) : k;
        limit.once = "none";
        rest = sentence(x as string);
        return true;
      },
    ],
    [
      /^As often as you like during your turn, you may (?:use this Ability\. )?(.+)$/,
      ([x]) => {
        limit.once = "none";
        rest = sentence(x as string);
        return true;
      },
    ],
  ];
  let matched = false;
  for (const [re, apply] of forms) {
    const fm = re.exec(rest);
    if (fm && apply(fm.slice(1))) {
      matched = true;
      break;
    }
  }
  if (!matched) return { unmatched: rest };
  // "…, you may discard a Basic {R} Energy card from your hand in order to use this Ability. Draw cards until…"
  const handCost = /^Discard (an?|\w+) (.+?) from your hand in order to use this Ability\. (.+)$/.exec(rest);
  if (handCost) {
    const n = num(handCost[1]) ?? 1;
    const f = cardFilter(handCost[2] as string);
    if (!f) return { unmatched: rest };
    pre.push(
      fx.chooseCards("hand", "cost", msg("Choose cards to discard from your hand"), {
        ...(f.filter ? { filter: f.filter } : {}),
        min: n,
        max: n,
      }),
      fx.move("cost", "discard"),
    );
    const k = cond.hasCards("hand", "me", f.filter, n);
    condition = condition ? cond.and(condition, k) : k;
    rest = handCost[3] as string;
  }
  const b = body(rest);
  if (!b) return { unmatched: rest };
  const act: NonNullable<AbilityDef["activated"]> = { effects: [...pre, ...b.effects] };
  if (lim.byName) act.once = "turnByName";
  else if (limit.once === "none") act.once = "none";
  if (where) act.where = where;
  const all = [condition, b.condition].filter((c): c is Condition => !!c);
  if (all.length) act.condition = all.length === 1 ? (all[0] as Condition) : cond.and(...all);
  if (lim.endsTurn) act.endsTurn = true;
  return { activated: act };
}
