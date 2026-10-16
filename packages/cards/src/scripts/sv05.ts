/**
 * Hand scripts of sv05 (Temporal Forces), the Scarlet & Violet and Mega Evolution promos and 30th Celebration (PLAN-B
 * B15): the last Standard cards. Each script follows the printed text; the details are in docs/extensions/sv05-promos.md.
 */
import {
  type AbilityDef,
  amt,
  type CardDef,
  type CardFilter,
  type Condition,
  cond,
  type Effect,
  type EType,
  fx,
  msg,
  type PokemonScope,
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

const SEARCH = () => msg("Choose cards from your deck");
const BASIC_ENERGY: CardFilter = { category: ["energy"], basicEnergy: true };
const basicOf = (t: EType): CardFilter => ({ ...BASIC_ENERGY, energyTypes: [t] });
const POKEMON: CardFilter = { category: ["pokemon"] };
const BASIC_POKEMON: CardFilter = { category: ["pokemon"], stage: ["basic"] };
const CHOOSE_OPP = () => msg("Choose 1 of your opponent's Pokémon");
/** Every Pokémon of a scope, stored without a question. */
const every = (sc: PokemonScope, key: string): Effect =>
  fx.choosePokemon(sc, key, msg("Your Pokémon"), { min: amt.pokemon(sc), max: amt.pokemon(sc) });
/** "Any number" done one step at a time (up to 20 steps), until the player stops. */
const loop = (going: Condition, prompt: string, step: Effect[]): Effect[] => [
  fx.set("stop", 0),
  fx.repeat(20, [fx.if(cond.and(cond.not({ c: "var", key: "stop" }), going), [fx.may(prompt, step, [fx.set("stop", 1)])])]),
];
/** Attach a card stored in `key` to the Pokémon stored in `to`. */
const attachTo = (key: string, to: string): Effect => ({
  op: "attach",
  cards: key,
  to: scope.mine(),
  target: ref.v(to),
  prompt: msg("Choose the Pokémon to attach the card to"),
});
/** Moltres, Articuno and Zapdos: "if you have <two others> in play, … attach a Basic <type> Energy card from your hand to this Pokémon." */
const flapping = (d: CardDef, others: [string, string], t: EType) =>
  abil(d, 0, {
    activated: {
      condition: cond.and(
        cond.exists(scope.mine({ names: [others[0]] })),
        cond.exists(scope.mine({ names: [others[1]] })),
        cond.hasCards("hand", "me", basicOf(t)),
      ),
      effects: [
        fx.chooseCards("hand", "e", msg("Choose a Basic Energy card"), { filter: basicOf(t), min: 1, max: 1 }),
        fx.attach("e", scope.self()),
      ],
    },
  });
/** Greninja ex's Stealthy Slash: "30 damage to 1 of your opponent's Pokémon for each damage counter on that Pokémon." */
const stealthySlash = (d: CardDef) =>
  atk(d, 0, [fx.choosePokemon(scope.theirs(), "t", CHOOSE_OPP()), fx.damage(ref.v("t"), amt.mul(30, amt.counters(ref.v("t"))))]);
/** "Switch this Pokémon with 1 of your Benched Pokémon. If you do, switch out your opponent's Active Pokémon to the Bench." */
const wormhole = (d: CardDef) =>
  atk(d, 0, [fx.main(), fx.if(cond.exists(scope.myBench()), [fx.switch("me"), fx.switch("opp", "opp")])]);
/** Knocked Out in the Active Spot: move up to N Basic Energy cards (of a type) from it to the Bench. */
const energyOnKO = (max: number, filter: CardFilter, oneTarget: boolean): Effect[] => [
  {
    op: "chooseCards",
    zone: "discard",
    store: "e",
    among: "ev:attached",
    filter,
    min: 0,
    max,
    prompt: msg("Choose Basic Energy cards to move to your Bench"),
  },
  ...(oneTarget
    ? [fx.choosePokemon(scope.myBench(), "t", msg("Choose 1 of your Benched Pokémon")), attachTo("e", "t")]
    : [fx.attach("e", scope.myBench())]),
];

const SCRIPTS: Record<string, CardScript> = {
  // —— Scarlet & Violet promos ——
  // Torrential Heart: "Once during your turn, you may put 5 damage counters on this Pokémon. If you do, during this turn,
  // attacks used by this Pokémon do 120 more damage to your opponent's Active Pokémon (before applying Weakness and
  // Resistance)."
  "Feraligatr@svp-089": (d) =>
    abil(d, 0, {
      activated: {
        effects: [
          fx.counters(ref.self, 5),
          fx.timed("thisTurn", { s: "dealt", scope: scope.self(), add: 120, activeOnly: true }, ref.self),
        ],
      },
    }),
  // Peak Acceleration: "Search your deck for up to 2 Basic Energy cards and attach them to your Future Pokémon in any way
  // you like. Then, shuffle your deck."
  "Miraidon@svp-092": (d) =>
    atk(d, 0, [
      fx.main(),
      fx.if(cond.exists(scope.mine({ tags: ["future"] })), [
        fx.chooseCards("deck", "e", SEARCH(), { filter: BASIC_ENERGY, min: 0, max: 2 }),
        fx.attach("e", scope.mine({ tags: ["future"] })),
      ]),
      fx.shuffle(),
    ]),
  // Destructo-Press: "Reveal the top 5 cards of your deck. This attack does 70 damage for each Future card you find there.
  // Then, discard those Future cards and shuffle the other cards back into your deck."
  "Iron Thorns@svp-098": (d) =>
    atk(d, 0, [
      fx.chooseCards("deck", "f", msg("The Future cards"), {
        top: 5,
        filter: { tags: ["future"] },
        min: 5,
        max: 5,
        reveal: true,
      }),
      fx.setDamage(amt.mul(70, amt.count("f"))),
      fx.main(),
      fx.move("f", "discard"),
      fx.shuffle(),
    ]),
  // Blaze Blitz: "This Pokémon can't use Blaze Blitz again until it leaves the Active Spot."
  "Gouging Fire ex@svp-144": (d) =>
    atk(d, 1, [fx.main(), fx.timed("whileActive", { s: "cantAttack", scope: scope.self(), attack: "Blaze Blitz" }, ref.self)]),
  // "Flip a coin. If heads, draw 4 cards. If tails, draw 2 cards."
  "Picnicker@svp-114": (d) =>
    trainer(d, { condition: cond.deck(), effects: [fx.flip(), fx.if(cond.heads(), [fx.draw(4)], [fx.draw(2)])] }),
  // Toxic Subjugation: "As long as this Pokémon is in the Active Spot, put 5 more damage counters on your opponent's
  // Poisoned Pokémon during Pokémon Checkup."
  "Pecharunt@svp-129": (d) =>
    abil(d, 0, {
      statics: [
        { s: "checkupCounters", scope: scope.theirs(), status: "poisoned", add: 5, cond: { c: "isActive", ref: ref.self } },
      ],
    }),
  // Crackling Charge: "Flip 3 coins. Attach a number of Basic {L} Energy cards up to the number of heads from your discard
  // pile to your Benched Pokémon in any way you like."
  "Pachirisu@svp-158": (d) =>
    atk(d, 0, [
      fx.flip(3),
      fx.if(cond.exists(scope.myBench()), [
        fx.chooseCards("discard", "e", msg("Choose Basic Lightning Energy cards"), {
          filter: basicOf("L"),
          min: 0,
          max: amt.heads(),
        }),
        fx.attach("e", scope.myBench()),
      ]),
    ]),
  // Nab 'n' Dash: "Search your deck for a number of cards up to the number of your Benched Pokémon and put them into your
  // hand. Then, shuffle your deck."
  "Scrafty@svp-188": (d) =>
    atk(d, 0, [
      fx.chooseCards("deck", "c", SEARCH(), { min: 0, max: amt.pokemon(scope.myBench()) }),
      fx.move("c", "hand"),
      fx.shuffle(),
    ]),

  // —— sv05 ——
  // Expelling Tornado: "Choose 3 of your opponent's Benched Pokémon. If you do, shuffle all of your opponent's Benched
  // Pokémon that you didn't choose, and all cards attached to those Pokémon, into their deck."
  "Shiftry@sv05-005": (d) =>
    atk(d, 0, [
      fx.if(cond.cmp(amt.pokemon(scope.oppBench()), ">=", 3), [
        fx.choosePokemon(scope.oppBench(), "keep", msg("Choose 3 of your opponent's Benched Pokémon"), { min: 3, max: 3 }),
        every(scope.oppBench(), "all"),
        { op: "varMinus", key: "all", minus: "keep" },
        fx.pokemonTo(ref.v("all"), "deck"),
        fx.shuffle("opp"),
      ]),
    ]),
  // Pinpoint Dive: "This attack does 60 damage to 1 of your opponent's Benched Pokémon ex or Benched Pokémon V."
  "Shaymin@sv05-013": (d) =>
    atk(d, 0, [
      fx.if(cond.exists(scope.oppBench({ tags: ["ex"] })), [
        fx.choosePokemon(scope.oppBench({ tags: ["ex"] }), "t", msg("Choose 1 of your opponent's Benched Pokémon")),
        fx.damage(ref.v("t"), 60),
      ]),
    ]),
  // Vanguard Punch: "This Pokémon also does 10 damage to itself for each damage counter on it."
  "Palafin@sv05-049": (d) => atk(d, 0, [fx.main(), fx.damage(ref.self, amt.mul(10, amt.counters(ref.self)))]),
  // Collateral Bolts: "This attack does 50 damage to each Pokémon that has any damage counters on it (both yours and your
  // opponent's), except for this Pokémon."
  "Raichu@sv05-052": (d) =>
    atk(d, 0, [fx.damage(ref.all({ side: "both", where: "any", filter: { damaged: true }, notSelf: true }), 50)]),
  // Short-Circuit Knuckle: "If your opponent has any {W} Pokémon in play, this attack does 120 more damage."
  "Electivire@sv05-054": (d) => atk(d, 0, [fx.if(cond.exists(scope.theirs({ types: ["W"] })), [fx.bonus(120)]), fx.main()]),
  // Circuit Cannon: "This attack does 80 more damage for each of your Benched Charjabug."
  "Vikavolt@sv05-056": (d) => atk(d, 1, [fx.bonus(amt.mul(80, amt.pokemon(scope.myBench({ names: ["Charjabug"] })))), fx.main()]),
  // Tricolor Pump: "Discard up to 3 Energy cards from your hand. This attack does 60 damage to 1 of your opponent's Pokémon
  // for each Energy card you discarded in this way."
  "Wugtrio ex@sv05-060": (d) =>
    atk(d, 0, [
      fx.chooseCards("hand", "d", msg("Choose up to 3 Energy cards to discard"), {
        filter: { category: ["energy"] },
        min: 0,
        max: 3,
      }),
      fx.move("d", "discard"),
      fx.if(cond.cmp(amt.count("d"), ">", 0), [
        fx.choosePokemon(scope.theirs(), "t", CHOOSE_OPP()),
        fx.damage(ref.v("t"), amt.mul(60, amt.count("d"))),
      ]),
    ]),
  // Look-Alike Show: "Your opponent reveals their hand. You may use the effect of a Supporter card you find there as the
  // effect of this attack."
  "Mr. Mime@sv05-063": (d) =>
    atk(d, 0, [
      { op: "revealHand", side: "opp" },
      fx.chooseCards("hand", "c", msg("Choose a Supporter card to use its effect"), {
        side: "opp",
        filter: { category: ["trainer"], trainer: ["supporter"] },
        min: 0,
        max: 1,
      }),
      { op: "useCardEffects", cards: "c" },
    ]),
  // Evolution Jammer: "During your opponent's next turn, they can't play any Pokémon from their hand to evolve their
  // Pokémon."
  "Bronzong@sv05-069": (d) => atk(d, 0, [fx.main(), fx.timed("opponentsNextTurn", { s: "cantEvolve", scope: scope.theirs() })]),
  // Plentiful Pollen: "During your next turn, if the Defending Pokémon is Knocked Out, take 2 more Prize cards."
  "Ribombee@sv05-076": (d) =>
    atk(d, 0, [fx.main(), fx.timed("yourNextTurn", { s: "prizes", scope: scope.oppActive(), delta: 2 }, ref.defending)]),
  // Calculation: "Look at the top 4 cards of your deck and put them back in any order." Majestic Sword: "If you played a
  // Future Supporter card from your hand during this turn, this attack does 100 more damage."
  "Iron Valiant@sv05-080": (d) => ({
    attacks: (d.attacks ?? []).map((a, j) =>
      j === 0
        ? {
            ...a,
            effects: [
              fx.chooseCards("deck", "c", msg("The top cards of your deck"), { top: 4, min: 4, max: 4 }),
              { op: "orderCards", key: "c", prompt: msg("Put them back in any order (first = top)") },
              fx.move("c", "deckTop"),
            ],
          }
        : {
            ...a,
            effects: [
              fx.if(cond.cmp({ k: "turnLog", event: "supporterPlayed", side: "me", filter: { tags: ["future"] } }, ">", 0), [
                fx.bonus(100),
              ]),
              fx.main(),
            ],
          },
    ),
  }),
  // Memory Dive: "Each of your evolved Pokémon can use any attack from its previous Evolutions. (You still need the
  // necessary Energy to use each attack.)"
  "Relicanth@sv05-084": (d) =>
    abil(d, 0, { statics: [{ s: "prevolutionAttacks", scope: scope.mine({ stage: ["stage1", "stage2"] }) }] }),
  // Dig Dig Dig: "When you play this Pokémon from your hand onto your Bench during your turn, you may search your deck for
  // up to 3 Basic {F} Energy cards and discard them. Then, shuffle your deck."
  "Drilbur@sv05-085": (d) =>
    abil(d, 0, {
      triggers: [
        {
          on: "playedToBench",
          may: true,
          effects: [
            fx.chooseCards("deck", "e", SEARCH(), { filter: basicOf("F"), min: 0, max: 3 }),
            fx.move("e", "discard"),
            fx.shuffle(),
          ],
        },
      ],
    }),
  // Mud Stock: "Attach a Basic {F} Energy card from your discard pile to each of your Benched Pokémon."
  "Mudsdale@sv05-092": (d) =>
    atk(d, 0, [
      every(scope.myBench(), "b"),
      fx.forEach("b", "p", [
        fx.chooseCards("discard", "e", msg("Choose a Basic Fighting Energy card"), { filter: basicOf("F"), min: 1, max: 1 }),
        attachTo("e", "p"),
      ]),
    ]),
  // Magnetic Burst: "If you have 3 or more Energy in play, this attack does 70 more damage. This attack's damage isn't
  // affected by Weakness."
  "Sandy Shocks@sv05-098": (d) =>
    atk(d, 0, [
      fx.if(cond.cmp(amt.energy(ref.all(scope.mine()), { units: true }), ">=", 3), [fx.bonus(70)]),
      { op: "mainDamage", noWeakness: true },
    ]),
  // Gnawing Curse: "Whenever your opponent attaches an Energy card from their hand to 1 of their Pokémon, put 2 damage
  // counters on that Pokémon."
  "Gengar ex@sv05-104": (d) => abil(d, 0, { statics: [{ s: "onAttach", scope: scope.theirs(), counters: 2 }] }),
  // Damage Collection: "You may move any number of damage counters from your opponent's Benched Pokémon to their Active
  // Pokémon."
  "Sableye@sv05-107": (d) =>
    atk(
      d,
      1,
      loop(cond.exists(scope.oppBench({ damaged: true })), msg("Move a damage counter?"), [
        fx.choosePokemon(scope.oppBench({ damaged: true }), "from", msg("Choose the Pokémon to move a damage counter from")),
        { op: "moveCounters", from: ref.v("from"), to: ref.oppActive, n: 1 },
      ]),
    ),
  // Tongue Pull: "Your opponent reveals their hand. Put up to 2 Basic Pokémon you find there onto your opponent's Bench."
  "Lickitung@sv05-124": (d) =>
    atk(d, 0, [
      { op: "revealHand", side: "opp" },
      fx.chooseCards("hand", "b", msg("Choose Basic Pokémon to put onto your opponent's Bench"), {
        side: "opp",
        filter: BASIC_POKEMON,
        min: 0,
        max: amt.min(2, amt.benchSpace("opp")),
      }),
      fx.move("b", "bench"),
    ]),
  // Energy Blender: "You may move any amount of Energy from your Pokémon to your other Pokémon in any way you like."
  "Delcatty@sv05-131": (d) =>
    atk(d, 1, [
      fx.main(),
      ...loop(
        cond.and(cond.exists(scope.mine({ hasEnergy: true })), cond.cmp(amt.pokemon(scope.mine()), ">", 1)),
        msg("Move an Energy?"),
        [
          fx.choosePokemon(scope.mine({ hasEnergy: true }), "from", msg("Choose the Pokémon to move the Energy from")),
          fx.moveEnergy(ref.v("from"), scope.mine(), 1),
        ],
      ),
    ]),
  // Emergency Evolution: "Once during your turn, if this Pokémon's remaining HP is 30 or less, you may search your deck for
  // an Unfezant or Unfezant ex and put it onto this Pidove to evolve it. Then, shuffle your deck."
  "Pidove@sv05-133": (d) =>
    abil(d, 0, {
      activated: {
        condition: cond.cmp({ k: "remainingHp", on: ref.self }, "<=", 30),
        effects: [
          {
            op: "evolveFromHand",
            scope: scope.self(),
            target: ref.self,
            fromDeck: true,
            filter: { names: ["Unfezant", "Unfezant ex"] },
            prompt: msg("Choose the Pokémon to evolve"),
          },
          fx.shuffle(),
        ],
      },
    }),
  // Cleaning Up: "Discard up to 2 Pokémon Tools from your opponent's Pokémon." (A Pokémon chosen loses all its Tools.)
  "Minccino@sv05-136": (d) =>
    atk(d, 1, [
      fx.repeat(2, [
        fx.if(cond.exists(scope.theirs({ hasTool: true })), [
          fx.may(msg("Discard a Pokémon Tool?"), [
            fx.choosePokemon(scope.theirs({ hasTool: true }), "t", CHOOSE_OPP()),
            fx.discardTools(ref.v("t")),
          ]),
        ]),
      ]),
    ]),
  // Special Roll: "This attack does 70 damage for each Special Energy card attached to this Pokémon."
  "Cinccino@sv05-137": (d) => atk(d, 1, [fx.setDamage(amt.mul(70, amt.energy(ref.self, { special: true }))), fx.main()]),
  // Raging Cannon: "If all of your Benched Pokémon have at least 1 damage counter on them, this attack does 120 more
  // damage." (With no Benched Pokémon, no bonus.)
  "Drampa@sv05-138": (d) =>
    atk(d, 1, [
      fx.if(cond.and(cond.exists(scope.myBench()), cond.not(cond.exists(scope.myBench({ not: { damaged: true } })))), [
        fx.bonus(120),
      ]),
      fx.main(),
    ]),
  // "Each player discards cards from their hand until they have 5 cards in their hand. Your opponent discards first."
  "Hand Trimmer@sv05-150": (d) =>
    trainer(d, {
      effects: [
        fx.chooseCards("hand", "o", msg("Discard cards until you have 5 cards in your hand"), {
          side: "opp",
          chooser: "opp",
          min: { k: "max", of: [0, amt.sub(amt.cards("hand", "opp"), 5)] },
          max: { k: "max", of: [0, amt.sub(amt.cards("hand", "opp"), 5)] },
        }),
        fx.move("o", "discard"),
        fx.chooseCards("hand", "m", msg("Discard cards until you have 5 cards in your hand"), {
          min: { k: "max", of: [0, amt.sub(amt.cards("hand", "me"), 5)] },
          max: { k: "max", of: [0, amt.sub(amt.cards("hand", "me"), 5)] },
        }),
        fx.move("m", "discard"),
      ],
    }),
  // "If the Pokémon this card is attached to has a Retreat Cost of exactly 4, is in the Active Spot, and is Knocked Out by
  // damage from an attack from your opponent's Pokémon, move up to 3 Basic Energy cards from that Pokémon to your Benched
  // Pokémon in any way you like." (The printed Retreat Cost.)
  "Heavy Baton@sv05-151": (d) =>
    trainer(d, {
      triggers: [
        {
          on: "knockedOut",
          byOpponentAttack: true,
          condition: cond.and(
            { c: "var", key: "ev:wasActive" },
            { c: "eventCard", key: "defId", filter: { retreat: 4 } },
            cond.exists(scope.myBench()),
          ),
          effects: energyOnKO(3, BASIC_ENERGY, false),
        },
      ],
    }),
  // "Attach a Basic Energy card from your discard pile to each of your Future Pokémon."
  "Reboot Pod@sv05-158": (d) =>
    trainer(d, {
      condition: cond.and(cond.exists(scope.mine({ tags: ["future"] })), cond.hasCards("discard", "me", BASIC_ENERGY)),
      effects: [
        every(scope.mine({ tags: ["future"] }), "f"),
        fx.forEach("f", "p", [
          fx.chooseCards("discard", "e", msg("Choose a Basic Energy card from your discard pile"), {
            filter: BASIC_ENERGY,
            min: 1,
            max: 1,
          }),
          attachTo("e", "p"),
        ]),
      ],
    }),
  // "Search your deck for a card that has no Abilities and evolves from 1 of your Pokémon, and put it onto that Pokémon to
  // evolve it. Then, shuffle your deck. You can use this card on a Pokémon you put down when you were setting up to play or
  // on a Pokémon that was put into play this turn."
  "Salvatore@sv05-160": (d) =>
    trainer(d, {
      condition: cond.and(cond.not({ c: "firstTurn" }), cond.deck()),
      effects: [
        {
          op: "evolveFromHand",
          scope: scope.mine(),
          fromDeck: true,
          filter: { category: ["pokemon"], hasAbility: false },
          prompt: msg("Choose the Pokémon to evolve"),
        },
        fx.shuffle(),
      ],
    }),

  // —— Mega Evolution promos ——
  // Pull: "Flip a coin. If heads, switch 1 of your opponent's Benched Pokémon with their Active Pokémon."
  "Drifloon@mep-005": (d) =>
    atk(d, 0, [
      fx.flip(),
      fx.if(cond.and(cond.heads(), cond.exists(scope.oppBench())), [
        fx.choosePokemon(scope.oppBench(), "t", msg("Choose 1 of your opponent's Benched Pokémon")),
        { op: "switch", side: "opp", chooser: "me", with: "t" },
      ]),
    ]),
  // Retaliatory Claw: "If this Pokémon's remaining HP is 50 or less, this attack does 170 more damage."
  "Weavile@mep-021": (d) =>
    atk(d, 0, [fx.if(cond.cmp({ k: "remainingHp", on: ref.self }, "<=", 50), [fx.bonus(170)]), fx.main()]),
  // Inferno X: "Discard any amount of {R} Energy from among your Pokémon, and this attack does 90 damage for each card you
  // discarded in this way."
  "Mega Charizard X ex@mep-023": (d) =>
    atk(d, 0, [
      {
        op: "discardEnergyFrom",
        scope: scope.mine(),
        min: 0,
        max: 60,
        types: ["R"],
        store: "n",
        prompt: msg("Choose Fire Energy to discard"),
      },
      fx.setDamage(amt.mul(90, amt.v("n"))),
      fx.main(),
    ]),
  // "Once during each player's turn, that player may heal 10 damage from each of their Pokémon. If a player healed any
  // damage in this way, their turn ends."
  "Celebratory Fanfare@mep-028": (d) =>
    trainer(d, {
      stadiumAction: true,
      condition: cond.exists(scope.mine({ damaged: true })),
      effects: [fx.heal(ref.all(scope.mine()), 10), fx.endTurn()],
    }),
  // Flaring Magic: "Once during your turn, you may discard a Basic Fire Energy card from your hand in order to use this
  // Ability. Draw cards until you have 7 cards in your hand."
  "Delphox@mep-074": (d) =>
    abil(d, 0, {
      activated: {
        condition: cond.hasCards("hand", "me", basicOf("R")),
        effects: [
          fx.chooseCards("hand", "c", msg("Choose a Basic Fire Energy card"), { filter: basicOf("R"), min: 1, max: 1 }),
          fx.move("c", "discard"),
          fx.drawUntil(7),
        ],
      },
    }),
  // Photon Cord: "If this Pokémon is in the Active Spot and is Knocked Out by damage from an attack from your opponent's
  // Pokémon, move up to 2 Basic {L} Energy cards from this Pokémon to 1 of your Benched Pokémon."
  "Miraidon@mep-082": (d) =>
    abil(d, 0, {
      triggers: [
        {
          on: "knockedOut",
          byOpponentAttack: true,
          condition: cond.and({ c: "var", key: "ev:wasActive" }, cond.exists(scope.myBench())),
          effects: energyOnKO(2, basicOf("L"), true),
        },
      ],
    }),
  "Moltres@mep-096": (d) => flapping(d, ["Articuno", "Zapdos"], "R"),
  "Articuno@mep-097": (d) => flapping(d, ["Moltres", "Zapdos"], "W"),
  "Zapdos@mep-098": (d) => flapping(d, ["Moltres", "Articuno"], "L"),
  "Greninja ex@mep-099": stealthySlash,

  // —— 30th Celebration ——
  // Surprisingly Transform: "Flip a coin. If heads, search your deck for a Pokémon and switch it with this Pokémon. Any
  // attached cards, damage counters, Special Conditions, turns in play, and any other effects remain on the new Pokémon.
  // If you switched a Pokémon in this way, put this card into your deck. Then, shuffle your deck."
  "Ditto@30th-115": (d) =>
    atk(d, 0, [
      fx.flip(),
      fx.if(cond.heads(), [
        fx.chooseCards("deck", "x", SEARCH(), { filter: POKEMON, min: 0, max: 1 }),
        { op: "replaceCard", target: ref.self, card: "x", old: "deck" },
        fx.shuffle(),
      ]),
    ]),
  // Supereffective Pheromones: "If you have Volbeat in play, apply Weakness for both Active Pokémon as ×3."
  "Illumise@30th-004": (d) =>
    abil(d, 0, {
      statics: [
        {
          s: "weakness",
          scope: { side: "both", where: "active" },
          mult: 3,
          cond: cond.exists(scope.mine({ names: ["Volbeat"] })),
        },
      ],
    }),
  // Guiding Dance: "Once during your turn, you may use this Ability. Flip a coin. If heads, search your deck for a Pokémon,
  // reveal it, and put it into your hand. Then, shuffle your deck."
  "Vivillon@30th-008": (d) =>
    abil(d, 0, {
      activated: {
        effects: [
          fx.flip(),
          fx.if(cond.heads(), [
            fx.chooseCards("deck", "c", SEARCH(), { filter: POKEMON, min: 0, max: 1, reveal: true }),
            fx.move("c", "hand"),
          ]),
          fx.shuffle(),
        ],
      },
    }),
  "Moltres@30th-011": (d) => flapping(d, ["Articuno", "Zapdos"], "R"),
  "Articuno@30th-018": (d) => flapping(d, ["Moltres", "Zapdos"], "W"),
  "Palkia@30th-020": wormhole,
  "Greninja ex@30th-021": stealthySlash,
  // Counterattack Grouping: "If your Wishiwashi or Wishiwashi ex is in the Active Spot and is damaged by an attack from
  // your opponent's Pokémon (even if your Pokémon is Knocked Out), place 3 damage counters on the Attacking Pokémon."
  "Wishiwashi@30th-022": (d) =>
    abil(d, 0, {
      statics: [{ s: "retaliate", scope: scope.of("me", "active", { names: ["Wishiwashi", "Wishiwashi ex"] }), counters: 3 }],
    }),
  // Overwriting Bolt: "The Defending Pokémon's Weakness is now {L} until the end of your next turn."
  "Pikachu@30th-040": (d) =>
    atk(d, 0, [
      fx.main(),
      fx.timed("untilYourNextTurnEnd", { s: "weakness", scope: scope.oppActive(), type: "L" }, ref.defending),
    ]),
  // Charge-Up Dash: "Flip a coin until you get tails. Search your deck for an amount of Basic {L} Energy up to the number of
  // heads and attach it to this Pokémon. Then, shuffle your deck."
  "Pikachu@30th-042": (d) =>
    atk(d, 0, [
      fx.flipUntilTails(),
      fx.chooseCards("deck", "e", SEARCH(), { filter: basicOf("L"), min: 0, max: amt.heads() }),
      fx.attach("e", scope.self()),
      fx.shuffle(),
    ]),
  // Get Some Air: "This Pokémon recovers from all Special Conditions."
  "Pikachu@30th-046": (d) => atk(d, 0, [fx.cure(ref.self)]),
  // Lightning Crash: "Discard all {L} Energy from this Pokémon, and this attack does 90 damage to 1 of your opponent's
  // Pokémon."
  "Pikachu@30th-051": (d) =>
    atk(d, 0, [
      fx.discardEnergy(ref.self, "all", { types: ["L"] }),
      fx.choosePokemon(scope.theirs(), "t", CHOOSE_OPP()),
      fx.damage(ref.v("t"), 90),
    ]),
  "Zapdos@30th-055": (d) => flapping(d, ["Moltres", "Articuno"], "L"),
  // Select a Snack: "Discard the top 3 cards of your deck and put 1 of them into your hand."
  "Morpeko@30th-061": (d) =>
    atk(d, 0, [
      { op: "mill", side: "me", n: 3, store: "m" },
      fx.chooseCards("discard", "c", msg("Choose a card to put into your hand"), { among: "m", min: 1, max: 1 }),
      fx.move("c", "hand"),
    ]),
  // Miraculous Shine: "Devolve each of your opponent's evolved Pokémon by putting the highest Stage Evolution card on it
  // into your opponent's hand."
  "Espeon@30th-069": (d) => atk(d, 0, [fx.devolve(ref.all(scope.theirs({ stage: ["stage1", "stage2"] })))]),
  // Mysterious Signal: "If your opponent's Pokémon is Knocked Out by damage from this attack, take 1 more Prize card."
  "Unown@30th-072": (d) =>
    atk(d, 0, [
      fx.timed("thisTurn", { s: "prizes", scope: scope.oppActive(), delta: 1, byAttack: true }, ref.defending),
      fx.main(),
    ]),
  // Strolls So Much: "Flip a coin. If heads, search your deck for a card and put it into your hand. Then, shuffle your
  // deck."
  "Gimmighoul@30th-081": (d) =>
    atk(d, 0, [
      fx.flip(),
      fx.if(cond.heads(), [fx.chooseCards("deck", "c", SEARCH(), { min: 0, max: 1 }), fx.move("c", "hand")]),
      fx.shuffle(),
    ]),
  // Quaking Fist: "During your opponent's next turn, whenever they try to use a Trainer card from their hand, they flip a
  // coin. If tails, your opponent discards that Trainer card instead of using it."
  "Seismitoad@30th-084": (d) => atk(d, 0, [fx.main(), fx.timed("opponentsNextTurn", { s: "trainerFlip", side: "opp" })]),
  // Nitpick: "Your opponent shuffles their hand into their deck and draws 4 cards."
  "Scraggy@30th-094": (d) => atk(d, 0, [fx.moveAll("hand", "opp", "deck"), fx.shuffle("opp"), fx.draw(4, "opp")]),
  // Life-Locked: "Your opponent's Active Pokémon can't be healed."
  "Yveltal@30th-100": (d) => abil(d, 0, { statics: [{ s: "noHeal", scope: scope.oppActive() }] }),
  // Celebration: "If you have exactly 30 cards in your hand, take 2 Prize cards. If you do, shuffle your hand into your
  // deck."
  "Gholdengo@30th-108": (d) =>
    atk(d, 0, [
      fx.if(cond.cmp(amt.cards("hand", "me"), "==", 30), [fx.takePrizes(2), fx.moveAll("hand", "me", "deck"), fx.shuffle()]),
    ]),
  // Fetch and Hide: "Your opponent reveals their hand, and you put an Item card you find there on the bottom of your
  // opponent's deck."
  "Eevee@30th-116": (d) =>
    atk(d, 0, [
      { op: "revealHand", side: "opp" },
      fx.chooseCards("hand", "c", msg("Choose an Item card"), {
        side: "opp",
        filter: { category: ["trainer"], trainer: ["item"] },
        min: 1,
        max: 1,
      }),
      fx.move("c", "deckBottom"),
    ]),
  // Good Sleep: "If this Pokémon remains Asleep during Pokémon Checkup, heal all damage from this Pokémon."
  "Snorlax@30th-119": (d) =>
    abil(d, 0, {
      triggers: [
        { on: "checkup", condition: cond.matches(ref.self, { status: ["asleep"] }), effects: [fx.heal(ref.self, "all")] },
      ],
    }),
  // Bouncy Circle: "This attack does 30 damage for each of your Benched Pokémon that has a maximum HP of 30."
  "Igglybuff@30th-120": (d) => atk(d, 0, [fx.setDamage(amt.mul(30, amt.pokemon(scope.myBench({ maxHp: 30 })))), fx.main()]),
  // Elemental Blast: "Discard a {R} Energy, a {W} Energy, and a {L} Energy from this Pokémon."
  "Lugia@30th-121": (d) =>
    atk(d, 0, [
      fx.main(),
      fx.discardEnergy(ref.self, 1, { types: ["R"] }),
      fx.discardEnergy(ref.self, 1, { types: ["W"] }),
      fx.discardEnergy(ref.self, 1, { types: ["L"] }),
    ]),
  // Gnaw Together: "Flip a coin for each Maushold you have in play. For each heads, discard the top 2 cards of your
  // opponent's deck."
  "Maushold@30th-125": (d) =>
    atk(d, 0, [
      fx.flip(amt.pokemon(scope.mine({ names: ["Maushold"] }))),
      { op: "mill", side: "opp", n: amt.mul(2, amt.heads()) },
    ]),
};

registerScripts(SCRIPTS);
