/**
 * Hand scripts of me04 (PLAN-B B6): the texts no template covers. Each script follows the printed text; the details are
 * in docs/extensions/me04-me03.md.
 */
import {
  type AbilityDef,
  amt,
  type CardDef,
  type CardFilter,
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

const BASIC_ENERGY: CardFilter = { category: ["energy"], basicEnergy: true };
/** Every Pokémon of a scope, stored without a question (as many as there are). */
const all = (sc: ReturnType<typeof scope.theirs>, key: string): Effect =>
  fx.choosePokemon(sc, key, msg("Choose your opponent's Pokémon"), { min: amt.pokemon(sc), max: amt.pokemon(sc) });
/** "Shuffle up to 3 … from your discard pile into your deck." */
const shuffleBack = (filter: CardFilter): Effect[] => [
  fx.chooseCards("discard", "back", msg("Choose cards from your discard pile"), { filter, min: 0, max: 3 }),
  fx.move("back", "deck"),
  fx.shuffle(),
];

const SCRIPTS: Record<string, CardScript> = {
  // Nighttime Maneuvers: "Once during your turn, if this Pokémon is in the Active Spot, you may use this Ability. Search
  // your deck for a card. Shuffle your deck, then put that card on top of it."
  "Crobat@me04-051": (d) =>
    abil(d, 0, {
      activated: {
        where: "active",
        condition: cond.deck(),
        effects: [
          fx.chooseCards("deck", "c", msg("Choose cards from your deck"), { min: 1, max: 1 }),
          fx.shuffle(),
          fx.move("c", "deckTop"),
        ],
      },
    }),
  // Ninja Spinner: "You may put a {W} Energy attached to this Pokémon into your hand and have this attack do 80 more
  // damage."
  "Mega Greninja ex@me04-022": (d) =>
    atk(d, 0, [
      fx.if(cond.cmp(amt.energy(ref.self, { type: "W" }), ">", 0), [
        fx.may(msg("Put a Water Energy attached to this Pokémon into your hand for 80 more damage?"), [
          fx.discardEnergy(ref.self, 1, { types: ["W"], to: "hand" }),
          fx.bonus(80),
        ]),
      ]),
      fx.main(),
    ]),
  // Needly Armor: "… (even if this Pokémon is Knocked Out), place 3 damage counters on the Attacking Pokémon for each
  // {G} Energy attached to this Pokémon."
  "Chesnaught@me04-007": (d) =>
    abil(d, 0, {
      triggers: [
        {
          on: "damagedByAttack",
          byOpponentAttack: true,
          condition: { c: "var", key: "ev:wasActive" },
          effects: [fx.counters({ ev: "attacker" }, amt.mul(3, amt.energy(ref.self, { type: "G", units: true })))],
        },
      ],
    }),
  // Pleasing Present: "Each player may attach up to 3 Basic Energy cards from their hand to their Pokémon in any way
  // they like. Your opponent does this first."
  "Delibird@me04-018": (d) =>
    atk(d, 0, [
      fx.chooseCards("hand", "oe", msg("You may attach up to 3 Basic Energy cards from your hand"), {
        side: "opp",
        chooser: "opp",
        filter: BASIC_ENERGY,
        min: 0,
        max: 3,
      }),
      { op: "attach", cards: "oe", to: scope.theirs(), prompt: msg("Choose the Pokémon to attach the card to"), chooser: "opp" },
      fx.chooseCards("hand", "me", msg("You may attach up to 3 Basic Energy cards from your hand"), {
        filter: BASIC_ENERGY,
        min: 0,
        max: 3,
      }),
      fx.attach("me", scope.mine()),
    ]),
  // Iceberg Breaker: "Discard the top 6 cards of your deck, and this attack does 60 damage for each Basic {W} Energy
  // card you discarded in this way."
  "Avalugg@me04-024": (d) =>
    atk(d, 0, [
      { op: "mill", side: "me", n: 6, store: "m" },
      fx.chooseCards("discard", "w", msg("Basic Water Energy discarded"), {
        among: "m",
        filter: { ...BASIC_ENERGY, energyTypes: ["W"] },
        min: 0,
        max: 6,
        random: true,
      }),
      fx.setDamage(amt.mul(60, amt.count("w"))),
      fx.main(),
    ]),
  // Critical Slash: "If your opponent's Pokémon is Knocked Out by damage from this attack, during your opponent's next
  // turn, prevent all damage from and effects of attacks done to this Pokémon."
  "Golisopod@me04-026": (d) =>
    atk(d, 0, [
      fx.main(),
      fx.if(cond.matches(ref.defending, { maxRemainingHp: 0 }), [
        fx.timed("opponentsNextTurn", { s: "prevent", scope: scope.self(), what: "all" }, ref.self),
      ]),
    ]),
  // Psyspear: "If this Pokémon has at least 2 extra Energy attached (in addition to this attack's cost), this attack also
  // does 120 damage to 1 of your opponent's Benched Pokémon."
  "Deoxys@me04-032": (d) =>
    atk(d, 0, [
      fx.main(),
      fx.if(
        cond.and(
          cond.cmp(amt.energy(ref.self, { units: true }), ">=", (d.attacks?.[0]?.cost.length ?? 0) + 2),
          cond.exists(scope.oppBench()),
        ),
        [fx.choosePokemon(scope.oppBench(), "t", msg("Choose 1 of your opponent's Benched Pokémon")), fx.damage(ref.v("t"), 120)],
      ),
    ]),
  // Spiteful Evolution: "Choose a card in your hand that evolves from this Pokémon and put it onto this Pokémon to evolve
  // it. If you do, place 2 damage counters on the Pokémon you evolved in this way. You can't use this Ability during your
  // first turn."
  "Phantump@me04-038": (d) =>
    abil(d, 0, {
      activated: {
        condition: cond.and(cond.not({ c: "firstTurn" }), cond.hasCards("hand", "me", { evolvesFromInPlay: "me" })),
        effects: [
          { op: "evolveFromHand", scope: scope.self(), prompt: msg("Choose a card that evolves from this Pokémon") },
          fx.if({ c: "didThisTurn", kind: "evolved", ref: ref.self }, [fx.counters(ref.self, 2)]),
        ],
      },
    }),
  // Devolution Ray: "If your opponent's Active Pokémon is an evolved Pokémon, devolve it by putting the highest Stage
  // Evolution card on it into your opponent's hand."
  "Claydol@me04-047": (d) => atk(d, 0, [fx.main(), { op: "devolve", target: ref.defending }]),
  // Startling Drop: "… if this Pokémon is discarded from your deck by an effect of … your opponent …, discard the top 8
  // cards of your opponent's deck."
  "Ferrothorn@me04-063": (d) =>
    abil(d, 0, { triggers: [{ on: "discardedFromDeck", byOpponentAttack: true, effects: [fx.mill("opp", 8)] }] }),
  // Metal Road: "Once during your turn, when this Pokémon moves from your Bench to the Active Spot, you may use this
  // Ability. Move any amount of {M} Energy from your other Pokémon to this Pokémon."
  "Cobalion ex@me04-064": (d) =>
    abil(d, 0, {
      triggers: [
        {
          on: "becameActive",
          may: true,
          oncePerTurn: true,
          effects: [
            {
              op: "gatherEnergy",
              from: scope.mine(),
              to: ref.self,
              min: 0,
              max: 60,
              types: ["M"],
              prompt: msg("Choose Metal Energy to move to this Pokémon"),
            },
          ],
        },
      ],
    }),
  // Corrosive Liquid: "Discard all Pokémon Tools and Special Energy from all of your opponent's Pokémon."
  "Mega Dragalge ex@me04-065": (d) =>
    atk(d, 0, [
      all(scope.theirs(), "t"),
      {
        op: "forEach",
        key: "t",
        as: "p",
        effects: [fx.discardTools(ref.v("p")), fx.discardEnergy(ref.v("p"), "all", { special: true })],
      },
    ]),
  // Target Together: "Choose 1 of your opponent's Pokémon and flip a coin for each of your Pokémon in play that has
  // "Tauros" in its name. This attack does 50 damage to the chosen Pokémon for each heads."
  "Tauros@me04-069": (d) =>
    atk(d, 0, [
      fx.choosePokemon(scope.theirs(), "t", msg("Choose 1 of your opponent's Pokémon")),
      fx.flip(amt.pokemon(scope.mine({ nameIncludes: "Tauros" }))),
      fx.damage(ref.v("t"), amt.mul(50, amt.heads())),
    ]),
  // Snap Inspection: "Flip 3 coins. If any of them are heads, your opponent reveals their hand. For each heads, choose a
  // card you find there and shuffle it into your opponent's deck."
  "Watchog@me04-071": (d) =>
    atk(d, 0, [
      fx.flip(3),
      fx.if(cond.cmp(amt.heads(), ">", 0), [
        { op: "revealHand", side: "opp" },
        fx.chooseCards("hand", "x", msg("Choose cards to shuffle into your opponent's deck"), {
          side: "opp",
          min: amt.min(amt.heads(), amt.cards("hand", "opp")),
          max: amt.heads(),
        }),
        fx.move("x", "deck"),
        fx.shuffle("opp"),
      ]),
    ]),
  // "If the Pokémon this card is attached to has Weakness to your opponent's Active Pokémon's type, is in the Active
  // Spot, and is damaged by an attack from your opponent's Pokémon (even if this Pokémon is Knocked Out), draw 3 cards."
  "Adversity Policy@me04-074": (d) =>
    trainer(d, {
      triggers: [
        {
          on: "damagedByAttack",
          byOpponentAttack: true,
          condition: cond.and({ c: "var", key: "ev:wasActive" }, { c: "weakTo", ref: ref.self, of: { ev: "attacker" } }),
          effects: [fx.draw(3)],
        },
      ],
    }),
  // "You can put this card into play only if you discard a Prism Tower in play, and you can put this card into play
  // during the same turn you play Prism Tower. Each Mega Floette ex in play (both yours and your opponent's) gets +150 HP."
  "Ange Floette@me04-075": (d) =>
    trainer(d, {
      replaces: "Prism Tower",
      statics: [{ s: "hp", scope: scope.of("both", "any", { names: ["Mega Floette ex"] }), add: 150 }],
    }),
  // "Switch your Active Pokémon with 1 of your Benched Pokémon. If you moved a Pokémon ex to your Bench in this way, heal
  // 80 damage from that Pokémon."
  "AZ's Tranquility@me04-076": (d) =>
    trainer(d, {
      condition: cond.exists(scope.myBench()),
      effects: [
        fx.choosePokemon(scope.myActive(), "old", msg("Your Active Pokémon")),
        fx.switch("me"),
        fx.if(cond.matches(ref.v("old"), { tags: ["ex"] }), [fx.heal(ref.v("old"), 80)]),
      ],
    }),
  // "Your opponent reveals their hand, and you draw a card for each Pokémon you find there."
  "Emma@me04-077": (d) =>
    trainer(d, {
      condition: cond.deck(),
      effects: [{ op: "revealHand", side: "opp" }, fx.draw(amt.cards("hand", "opp", { category: ["pokemon"] }))],
    }),
  // "Choose 1 or both: • Shuffle up to 3 {W} Pokémon from your discard pile into your deck. • Shuffle up to 3 Basic {W}
  // Energy cards from your discard pile into your deck."
  "Great Haul Net@me04-078": (d) => {
    const pokemon: CardFilter = { category: ["pokemon"], types: ["W"] };
    const water: CardFilter = { ...BASIC_ENERGY, energyTypes: ["W"] };
    return trainer(d, {
      condition: cond.or(cond.hasCards("discard", "me", pokemon), cond.hasCards("discard", "me", water)),
      effects: [
        fx.chooseOne(msg("Choose 1 or both"), [
          { label: msg("Water Pokémon"), effects: shuffleBack(pokemon), cond: cond.hasCards("discard", "me", pokemon) },
          { label: msg("Basic Water Energy"), effects: shuffleBack(water), cond: cond.hasCards("discard", "me", water) },
          {
            label: msg("Both"),
            effects: [...shuffleBack(pokemon), ...shuffleBack(water)],
            cond: cond.and(cond.hasCards("discard", "me", pokemon), cond.hasCards("discard", "me", water)),
          },
        ]),
      ],
    });
  },
  // "You must play 2 Transformation Tome cards at once. (This effect works one time for 2 cards.) Choose a Basic Pokémon in
  // your discard pile and switch it with 1 of your Basic Pokémon in play. Any attached cards, damage counters, Special
  // Conditions, turns in play, and any other effects remain on the new Pokémon."
  "Transformation Tome@me04-083": (d) => {
    const basic: CardFilter = { category: ["pokemon"], stage: ["basic"] };
    return trainer(d, {
      condition: cond.and(
        cond.hasCards("hand", "me", { names: ["Transformation Tome"] }, 2),
        cond.hasCards("discard", "me", basic),
        cond.exists(scope.mine({ stage: ["basic"] })),
      ),
      effects: [
        fx.chooseCards("hand", "tome", msg("The second Transformation Tome"), {
          filter: { names: ["Transformation Tome"] },
          min: 1,
          max: 1,
          notSource: true,
        }),
        fx.move("tome", "discard"),
        fx.chooseCards("discard", "new", msg("Choose a Basic Pokémon in your discard pile"), { filter: basic, min: 1, max: 1 }),
        fx.choosePokemon(scope.mine({ stage: ["basic"] }), "old", msg("Choose 1 of your Basic Pokémon in play")),
        { op: "replaceCard", target: ref.v("old"), card: "new" },
      ],
    });
  },
  // "Choose up to 2 Pokémon Tools attached to Pokémon (yours or your opponent's) and discard them." (A Pokémon is chosen
  // for each Tool: with 2 Tools on one Pokémon, both go.)
  "Tool Scrapper": (d) =>
    trainer(d, {
      condition: cond.exists(scope.of("both", "any", { hasTool: true })),
      effects: [
        fx.choosePokemon(scope.of("both", "any", { hasTool: true }), "t", msg("Choose up to 2 Pokémon with a Pokémon Tool"), {
          min: 1,
          max: 2,
        }),
        { op: "forEach", key: "t", as: "p", effects: [fx.discardTools(ref.v("p"))] },
      ],
    }),
  // "Once during each player's turn, that player may switch their Active {W} Pokémon with 1 of their Benched {W} Pokémon."
  "Surfing Beach": (d) =>
    trainer(d, {
      stadiumAction: true,
      condition: cond.and(cond.matches(ref.myActive, { types: ["W"] }), cond.exists(scope.myBench({ types: ["W"] }))),
      effects: [
        fx.choosePokemon(scope.myBench({ types: ["W"] }), "w", msg("Choose 1 of your Benched Water Pokémon")),
        { op: "switch", side: "me", with: "w" },
      ],
    }),
  // "If this card is discarded by an effect of an attack used by the {R} Pokémon this card is attached to, put this card
  // into your hand after attack damage and effects."
  "Nitro Fire Energy@me04-086": () => energy({ provides: [["R"]], returnAfterAttack: "hand", returnFilter: { types: ["R"] } }),
};

registerScripts(SCRIPTS);
