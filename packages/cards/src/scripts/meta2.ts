/**
 * Hand scripts of the second wave of meta decks (PLAN-B B1: Crustle, Mega Excadrill ex, Dhelmise, Mega Lucario ex,
 * Rocket's Honchkrow, Mega Sharpedo ex, Cynthia's Garchomp ex, Ogerpon Meganium). Each script follows the printed text;
 * the details are in docs/extensions/meta.md.
 */
import {
  type AbilityDef,
  amt,
  type CardDef,
  cond,
  type Effect,
  type EnergyDef,
  fx,
  msg,
  ref,
  scope,
  type TrainerDef,
} from "@pokecircle/engine";
import { type CardScript, registerScripts } from "../scripts";

const atk = (d: CardDef, i: number, effects: Effect[]): Partial<CardDef> => ({
  attacks: (d.attacks ?? []).map((a, j) => (j === i ? { ...a, effects } : a)),
});
const abil = (d: CardDef, i: number, parts: Partial<AbilityDef>): Partial<CardDef> => ({
  abilities: (d.abilities ?? []).map((a, j) => (j === i ? { ...a, ...parts } : a)),
});
const trainer = (d: CardDef, t: Partial<TrainerDef>): Partial<CardDef> => ({
  trainer: { kind: d.trainer?.kind ?? "item", ...d.trainer, ...t },
});
const energy = (e: Partial<EnergyDef>): Partial<CardDef> => ({ energy: { basic: false, provides: [["C"]], ...e } });

const SEARCH = () => msg("Choose cards from your deck");
const SUPPORTER = { category: ["trainer" as const], trainer: ["supporter" as const] };
const TR = "Team Rocket's";
const TR_SUPPORTER = { ...SUPPORTER, nameIncludes: "Team Rocket" };
const HIDE_N_SNEAK = { category: ["pokemon" as const], abilityNamed: "Hide 'n' Sneak" };
const BOTH_HANDS_TO_DECK: Effect[] = [
  fx.moveAll("hand", "me", "deck"),
  fx.shuffle("me"),
  fx.moveAll("hand", "opp", "deck"),
  fx.shuffle("opp"),
];

const SCRIPTS: Record<string, CardScript> = {
  // —— Supporters ——
  "Bianca's Devotion": (d) =>
    trainer(d, {
      effects: [
        fx.choosePokemon(scope.mine({ damaged: true, maxRemainingHp: 30 }), "t", msg("Choose your Pokémon")),
        fx.heal(ref.v("t"), "all"),
      ],
      condition: cond.exists(scope.mine({ damaged: true, maxRemainingHp: 30 })),
    }),
  Gwynn: (d) =>
    trainer(d, {
      effects: [
        fx.chooseCards("hand", "p", msg("Choose up to 2 Pokémon without a Rule Box to discard"), {
          filter: { category: ["pokemon"], noTags: ["ruleBox"] },
          min: 0,
          max: 2,
          notSource: true,
        }),
        fx.move("p", "discard"),
        fx.draw(amt.mul(3, amt.count("p"))),
      ],
    }),
  "Explorer's Guidance": (d) =>
    trainer(d, {
      effects: [
        fx.set("seen", amt.min(6, amt.cards("deck", "me"))),
        fx.chooseCards("deck", "two", msg("Choose 2 cards to put into your hand"), {
          top: 6,
          min: amt.min(2, amt.v("seen")),
          max: 2,
        }),
        fx.move("two", "hand"),
        // The other cards looked at are still on top of the deck.
        fx.mill("me", amt.sub(amt.v("seen"), amt.count("two"))),
      ],
      condition: cond.deck(),
    }),
  "Wally's Compassion": (d) =>
    trainer(d, {
      effects: [
        fx.choosePokemon(scope.mine({ tags: ["mega"] }), "t", msg("Choose your Mega Evolution Pokémon ex")),
        fx.if(cond.matches(ref.v("t"), { damaged: true }), [
          fx.heal(ref.v("t"), "all"),
          fx.discardEnergy(ref.v("t"), "all", { to: "hand" }),
        ]),
      ],
      condition: cond.exists(scope.mine({ tags: ["mega"] })),
    }),
  "Team Rocket's Archer": (d) =>
    trainer(d, {
      effects: [...BOTH_HANDS_TO_DECK, fx.draw(5), fx.draw(3, "opp")],
      condition: cond.cmp(
        { k: "turnLog", event: "knockedOut", side: "me", previous: true, filter: { nameIncludes: TR } },
        ">",
        0,
      ),
    }),
  "Team Rocket's Ariana": (d) =>
    trainer(d, {
      effects: [
        fx.if(cond.cmp(amt.pokemon(scope.mine({ not: { nameIncludes: TR } })), "==", 0), [fx.drawUntil(8)], [fx.drawUntil(5)]),
      ],
    }),
  "Team Rocket's Proton": (d) =>
    trainer(d, {
      firstTurnOk: true,
      effects: [
        fx.chooseCards("deck", "b", SEARCH(), {
          filter: { category: ["pokemon"], stage: ["basic"], nameIncludes: TR },
          min: 0,
          max: 3,
          reveal: true,
        }),
        fx.move("b", "hand"),
        fx.shuffle(),
      ],
      condition: cond.deck(),
    }),
  "Team Rocket's Giovanni": (d) =>
    trainer(d, {
      effects: [
        fx.choosePokemon(scope.myBench({ nameIncludes: TR }), "t", msg("Choose your Benched Team Rocket's Pokémon")),
        { op: "switch", side: "me", with: "t" },
        fx.if(cond.bench("opp"), [fx.switch("opp", "me")]),
      ],
      condition: cond.and(cond.matches(ref.myActive, { nameIncludes: TR }), cond.exists(scope.myBench({ nameIncludes: TR }))),
    }),
  // —— Items ——
  "Jumbo Ice Cream": (d) =>
    trainer(d, {
      effects: [fx.heal(ref.myActive, 80)],
      condition: cond.cmp(amt.energy(ref.myActive), ">=", 3),
    }),
  "Premium Power Pro": (d) =>
    trainer(d, {
      effects: [fx.timed("thisTurn", { s: "dealt", scope: scope.mine({ types: ["F"] }), add: 30, activeOnly: true })],
    }),
  "Team Rocket's Transceiver": (d) =>
    trainer(d, {
      effects: [
        fx.chooseCards("deck", "s", SEARCH(), { filter: TR_SUPPORTER, min: 0, max: 1, reveal: true }),
        fx.move("s", "hand"),
        fx.shuffle(),
      ],
      condition: cond.deck(),
    }),
  // —— Stadiums ——
  "Gravity Mountain": (d) =>
    trainer(d, { statics: [{ s: "hp", scope: scope.of("both", "any", { stage: ["stage2"] }), add: -30 }] }),
  "Team Rocket's Factory": (d) =>
    trainer(d, {
      stadiumAction: true,
      effects: [fx.draw(2)],
      condition: cond.cmp(
        { k: "turnLog", event: "supporterPlayed", side: "me", filter: { nameIncludes: "Team Rocket" } },
        ">",
        0,
      ),
    }),
  "Lumiose City": (d) =>
    trainer(d, {
      stadiumAction: true,
      effects: [
        fx.chooseCards("deck", "b", SEARCH(), { filter: { category: ["pokemon"], stage: ["basic"] }, min: 0, max: 1 }),
        fx.move("b", "bench"),
        fx.shuffle(),
        // "If a player searches their deck in this way, their turn ends."
        fx.endTurn(),
      ],
      condition: cond.and(cond.deck(), cond.cmp(amt.benchSpace(), ">", 0)),
    }),
  "Prism Tower": (d) =>
    trainer(d, {
      stadiumAction: true,
      effects: [
        fx.chooseCards("hand", "c", msg("Choose 2 cards to discard"), { min: 2, max: 2 }),
        fx.move("c", "discard"),
        fx.draw(1),
      ],
      condition: cond.hasCards("hand", "me", undefined, 2),
    }),
  // —— Special Energy ——
  "Spiky Energy": () =>
    energy({
      provides: [["C"]],
      triggers: [
        {
          on: "damagedByAttack",
          byOpponentAttack: true,
          condition: { c: "isActive", ref: ref.self },
          effects: [fx.counters({ ev: "attacker" }, 2)],
        },
      ],
    }),
  "Legacy Energy": () =>
    energy({
      provides: [["*"]],
      statics: [{ s: "prizes", scope: scope.self(), delta: -1, byAttack: true, oncePerGame: true }],
    }),
  "Team Rocket's Energy": () =>
    energy({
      provides: [
        ["P", "D"],
        ["P", "D"],
      ],
      attachCondition: cond.matches(ref.self, { nameIncludes: TR }),
    }),
  "Ignition Energy": () =>
    energy({
      provides: [["C"]],
      providesIf: { filter: { stage: ["stage1", "stage2"] }, provides: [["C"], ["C"], ["C"]] },
      triggers: [{ on: "turnEnd", effects: [fx.move("thisCard", "discard")] }],
    }),
  "Rocky Fighting Energy": () =>
    energy({
      provides: [["F"]],
      statics: [{ s: "prevent", scope: { ...scope.self(), filter: { types: ["F"] } }, what: "effects" }],
    }),
  // —— Pokémon ——
  "Metang@svp-090": (d) =>
    abil(d, 0, {
      activated: {
        effects: [
          fx.set("seen", amt.min(4, amt.cards("deck", "me"))),
          fx.chooseCards("deck", "m", msg("Choose Basic {M} Energy cards to attach"), {
            top: 4,
            filter: { category: ["energy"], basicEnergy: true, energyTypes: ["M"] },
            min: 0,
            max: 4,
          }),
          fx.attach("m", scope.mine()),
          // The other cards looked at are still on top: to the bottom of the deck, in a random order.
          fx.mill("me", amt.sub(amt.v("seen"), amt.count("m")), "deckBottom"),
        ],
        condition: cond.deck(),
      },
    }),
  "Poltchageist@me05-005": (d) => atk(d, 0, [fx.counters(ref.defending, 1)]),
  "Sinistcha@me05-006": (d) =>
    atk(d, 0, [fx.if(cond.hasCards("discard", "me", HIDE_N_SNEAK, 6), [fx.counters(ref.all(scope.theirs()), 4)])]),
  "Dhelmise@me05-039": (d) => atk(d, 0, [fx.if(cond.hasCards("discard", "me", HIDE_N_SNEAK, 4), [fx.bonus(140)]), fx.main()]),
  Solrock: (d) =>
    atk(d, 0, [fx.if(cond.not(cond.exists(scope.myBench({ names: ["Lunatone"] }))), [fx.fails()]), fx.main({ noWR: true })]),
  Lunatone: (d) =>
    abil(d, 0, {
      activated: {
        once: "turnByName",
        effects: [
          fx.chooseCards("hand", "e", msg("Choose a Basic {F} Energy card to discard"), {
            filter: { category: ["energy"], basicEnergy: true, energyTypes: ["F"] },
            min: 1,
            max: 1,
          }),
          fx.move("e", "discard"),
          fx.draw(3),
        ],
        condition: cond.and(
          cond.exists(scope.mine({ names: ["Solrock"] })),
          cond.hasCards("hand", "me", { category: ["energy"], basicEnergy: true, energyTypes: ["F"] }),
        ),
      },
    }),
  "Team Rocket's Murkrow": (d) =>
    atk(d, 1, [
      fx.main(),
      { op: "lockAttack", target: ref.defending, duration: "opponentsNextTurn", prompt: msg("Choose an attack it can't use") },
    ]),
  "Team Rocket's Honchkrow": (d) =>
    atk(d, 0, [
      fx.chooseCards("hand", "s", msg("Choose Team Rocket's Supporter cards to discard"), {
        filter: TR_SUPPORTER,
        min: 0,
        max: 60,
      }),
      fx.move("s", "discard"),
      fx.setDamage(amt.mul(60, amt.count("s"))),
      fx.main(),
    ]),
  "Team Rocket's Porygon": (d) =>
    atk(d, 0, [
      fx.chooseCards("hand", "mine", msg("Choose a card to discard"), { min: 1, max: 1 }),
      fx.move("mine", "discard"),
      fx.if(cond.cmp(amt.count("mine"), ">", 0), [
        fx.chooseCards("hand", "theirs", msg("Choose a card to discard"), { side: "opp", chooser: "opp", min: 1, max: 1 }),
        fx.move("theirs", "discard"),
      ]),
    ]),
  "Team Rocket's Porygon2": (d) => atk(d, 0, [fx.setDamage(amt.mul(20, amt.cards("discard", "me", TR_SUPPORTER))), fx.main()]),
  "Team Rocket's Articuno": (d) => ({
    ...abil(d, 0, {
      statics: [{ s: "prevent", scope: scope.mine({ stage: ["basic"], nameIncludes: TR }), what: "effects" }],
    }),
    ...atk(d, 0, [
      fx.if(cond.cmp({ k: "energy", on: ref.self, names: ["Team Rocket's Energy"] }, ">", 0), [fx.bonus(60)]),
      fx.main(),
    ]),
  }),
  "Toxtricity@me02-068": (d) =>
    abil(d, 0, {
      activated: {
        effects: [
          fx.chooseCards("deck", "e", SEARCH(), {
            filter: { category: ["energy"], basicEnergy: true, energyTypes: ["D"] },
            min: 0,
            max: 1,
          }),
          fx.attach("e", scope.myBench({ types: ["D"] }), msg("Choose your Benched {D} Pokémon"), "t"),
          fx.shuffle(),
          fx.if(cond.cmp(amt.count("e"), ">", 0), [fx.counters(ref.v("t"), 2)]),
        ],
        condition: cond.and(cond.deck(), cond.exists(scope.myBench({ types: ["D"] }))),
      },
    }),
  "Cynthia's Spiritomb": (d) =>
    atk(d, 0, [
      fx.setDamage(amt.mul(10, amt.counters(ref.all(scope.myBench({ nameIncludes: "Cynthia's" }))))),
      { op: "mainDamage", noWeakness: true },
    ]),
  "Arboliva ex": (d) => ({
    attacks: (d.attacks ?? []).map((a, j) =>
      j === 0
        ? {
            ...a,
            effects: [
              fx.repeat(6, [
                fx.choosePokemon(scope.theirs(), "t", msg("Choose your opponent's Pokémon")),
                fx.damage(ref.v("t"), 20, { noWR: true }),
              ]),
            ],
          }
        : j === 1
          ? { ...a, effects: [fx.main(), fx.cure(ref.self)] }
          : a,
    ),
  }),
  "Noctowl@svp-141": (d) =>
    abil(d, 0, {
      triggers: [
        {
          on: "evolved",
          may: true,
          oncePerTurn: true,
          condition: cond.exists(scope.mine({ tags: ["tera"] })),
          effects: [
            fx.chooseCards("deck", "t", SEARCH(), { filter: { category: ["trainer"] }, min: 0, max: 2, reveal: true }),
            fx.move("t", "hand"),
            fx.shuffle(),
          ],
        },
      ],
    }),
};

registerScripts(SCRIPTS);
