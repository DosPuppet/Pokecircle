/**
 * Hand scripts of sv06 (Twilight Masquerade; PLAN-B B14), with the earlier Standard cards reprinted in it. Each script
 * follows the printed text; the details are in docs/extensions/sv06.md.
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
const ENERGY: CardFilter = { category: ["energy"] };
const ALL_TYPES: EType[] = ["G", "R", "W", "L", "P", "F", "D", "M", "N", "C"];
/** A stop flag for "any number" loops done one step at a time (up to 20 steps). */
const loop = (stop: string, body: (keepGoing: Condition) => Effect): Effect[] => [
  fx.set(stop, 0),
  fx.repeat(20, [body(cond.not({ c: "var", key: stop }))]),
];

const SCRIPTS: Record<string, CardScript> = {
  // Pyro Dance: "Once during your turn, you may attach a Basic {R} Energy card, a Basic {F} Energy card, or 1 of each
  // from your hand to your Pokémon in any way you like."
  "Infernape@svp-116": (d) =>
    abil(d, 0, {
      activated: {
        condition: cond.or(cond.hasCards("hand", "me", basicOf("R")), cond.hasCards("hand", "me", basicOf("F"))),
        effects: [
          fx.chooseCards("hand", "r", msg("Choose a Basic Fire Energy card"), { filter: basicOf("R"), min: 0, max: 1 }),
          fx.chooseCards("hand", "f", msg("Choose a Basic Fighting Energy card"), { filter: basicOf("F"), min: 0, max: 1 }),
          fx.attach("r", scope.mine()),
          fx.attach("f", scope.mine()),
        ],
      },
    }),
  // Freezing Shroud: "During Pokémon Checkup, put 1 damage counter on each Pokémon that has an Ability (both yours and your
  // opponent's), except any Froslass."
  "Froslass@svp-117": (d) =>
    abil(d, 0, {
      triggers: [
        {
          on: "checkup",
          effects: [fx.counters(ref.all(scope.of("both", "any", { hasAbility: true, not: { names: ["Froslass"] } })), 1)],
        },
      ],
    }),
  // Drum Beating: "During your opponent's next turn, attacks used by the Defending Pokémon cost {C} more, and its Retreat
  // Cost is {C} more."
  "Rillaboom@sv06-016": (d) =>
    atk(d, 0, [
      fx.main(),
      fx.timed("opponentsNextTurn", { s: "attackCost", scope: scope.oppActive(), less: -1 }, ref.defending),
      fx.timed("opponentsNextTurn", { s: "retreat", scope: scope.oppActive(), delta: 1 }, ref.defending),
    ]),
  // Spill the Tea: "Discard up to 3 {G} Energy cards from your Pokémon. This attack does 70 damage for each card you
  // discarded in this way."
  "Sinistcha@sv06-022": (d) =>
    atk(d, 1, [
      {
        op: "discardEnergyFrom",
        scope: scope.mine(),
        min: 0,
        max: 3,
        types: ["G"],
        store: "n",
        prompt: msg("Choose up to 3 Grass Energy cards to discard"),
      },
      fx.setDamage(amt.mul(70, amt.v("n"))),
      fx.main(),
    ]),
  // Re-Brew: "Put 2 damage counters on 1 of your opponent's Pokémon for each Basic {G} Energy card in your discard pile.
  // Then, shuffle those Energy cards into your deck."
  "Sinistcha ex@sv06-023": (d) =>
    atk(d, 0, [
      fx.choosePokemon(scope.theirs(), "t", msg("Choose 1 of your opponent's Pokémon")),
      fx.counters(ref.v("t"), amt.mul(2, amt.cards("discard", "me", basicOf("G")))),
      fx.moveAll("discard", "me", "deck", basicOf("G")),
      fx.shuffle(),
    ]),
  // Ground Burn: "Discard the top card of each player's deck. This attack does 140 more damage for each Energy card
  // discarded in this way."
  "Magcargo ex@sv06-029": (d) =>
    atk(d, 1, [
      fx.set("before", amt.add(amt.cards("discard", "me", ENERGY), amt.cards("discard", "opp", ENERGY))),
      { op: "mill", side: "me", n: 1 },
      { op: "mill", side: "opp", n: 1 },
      fx.bonus(
        amt.mul(140, amt.sub(amt.add(amt.cards("discard", "me", ENERGY), amt.cards("discard", "opp", ENERGY)), amt.v("before"))),
      ),
      fx.main(),
    ]),
  // Alluring Light: "Once during your turn, you may have each player draw a card."
  "Chandelure@sv06-038": (d) => abil(d, 0, { activated: { effects: [fx.draw(1), fx.draw(1, "opp")] } }),
  // Inviting Kiss: "Search your deck for a Basic Pokémon and put it onto your Bench. Then, shuffle your deck. If you put any
  // Pokémon onto your Bench in this way, move an Energy from this Pokémon to the new Benched Pokémon."
  "Jynx@sv06-046": (d) =>
    atk(d, 0, [
      fx.if(cond.cmp(amt.benchSpace(), ">", 0), [
        fx.chooseCards("deck", "b", SEARCH(), { filter: { category: ["pokemon"], stage: ["basic"] }, min: 0, max: 1 }),
        fx.move("b", "bench"),
      ]),
      fx.shuffle(),
      fx.if(cond.cmp(amt.count("b"), ">", 0), [{ op: "moveEnergy", from: ref.self, to: ref.v("b"), n: 1 }]),
    ]),
  // Mentally Calm: "Your opponent's Pokémon in play and all attached cards can't be put into your opponent's hand."
  "Milotic@sv06-050": (d) => abil(d, 0, { statics: [{ s: "noToHand", scope: scope.theirs() }] }),
  // Zero to Hero: "Once during your turn, when this Pokémon moves from the Active Spot to the Bench, you may search your
  // deck for a Palafin ex and switch it with this Pokémon. Any attached cards, damage counters, Special Conditions, turns
  // in play, and any other effects remain on the new Pokémon. If you switched a Pokémon in this way, put this card into
  // your deck. Then, shuffle your deck."
  "Palafin@sv06-060": (d) =>
    abil(d, 0, {
      triggers: [
        {
          on: "movedToBench",
          may: true,
          oncePerTurn: true,
          condition: { c: "myTurn" },
          effects: [
            fx.chooseCards("deck", "ex", SEARCH(), { filter: { names: ["Palafin ex"] }, min: 0, max: 1 }),
            { op: "replaceCard", target: ref.self, card: "ex", old: "deck" },
            fx.shuffle(),
          ],
        },
      ],
    }),
  // Interjet: "Switch this Pokémon with 1 of your Benched Pokémon. If you do, switch out your opponent's Active Pokémon to
  // the Bench. (Your opponent chooses the new Active Pokémon.)"
  "Iron Bundle@sv06-062": (d) =>
    atk(d, 0, [fx.main(), fx.if(cond.exists(scope.myBench()), [fx.switch("me"), fx.switch("opp", "opp")])]),
  // Undulating Slice: "Put up to 9 damage counters on this Pokémon. This attack does 20 damage for each damage counter you
  // placed in this way."
  "Walking Wake@sv06-063": (d) =>
    atk(d, 1, [
      { op: "chooseNumber", min: 0, max: 9, store: "n", prompt: msg("How many damage counters?") },
      fx.counters(ref.self, amt.v("n")),
      fx.setDamage(amt.mul(20, amt.v("n"))),
      fx.main(),
    ]),
  // Piercing Gaze: "Your opponent reveals their hand. Discard a card you find there."
  "Luxray ex@sv06-068": (d) =>
    atk(d, 0, [
      fx.main(),
      { op: "revealHand", side: "opp" },
      fx.chooseCards("hand", "c", msg("Choose a card to discard"), { side: "opp", min: 1, max: 1 }),
      fx.move("c", "discard"),
    ]),
  // Teleporter: "Once during your turn, if this Pokémon is in the Active Spot, you may shuffle it and all attached cards
  // into your deck."
  "Abra@sv06-080": (d) => abil(d, 0, { activated: { where: "active", effects: [fx.pokemonTo(ref.self, "deck"), fx.shuffle()] } }),
  // Strange Hacking: "Your opponent's Active Pokémon is now Confused. You may move any number of damage counters from your
  // opponent's Pokémon to their other Pokémon in any way you like." (One counter at a time, until the player stops.)
  "Alakazam@sv06-082": (d) =>
    atk(d, 0, [
      fx.condition(ref.defending, "confused"),
      ...loop("stop", (going) =>
        fx.if(cond.and(going, cond.exists(scope.theirs({ damaged: true })), cond.cmp(amt.pokemon(scope.theirs()), ">", 1)), [
          fx.may(
            msg("Move a damage counter?"),
            [
              fx.choosePokemon(scope.theirs({ damaged: true }), "from", msg("Choose the Pokémon to move a damage counter from")),
              fx.choosePokemon(scope.theirs(), "to", msg("Choose the Pokémon to move it to")),
              { op: "moveCounters", from: ref.v("from"), to: ref.v("to"), n: 1 },
            ],
            [fx.set("stop", 1)],
          ),
        ]),
      ),
    ]),
  // Homeward Chime: "Shuffle 1 of your Benched Pokémon and all attached cards into your deck."
  "Chimecho@sv06-085": (d) =>
    atk(d, 1, [
      fx.if(cond.exists(scope.myBench()), [
        fx.choosePokemon(scope.myBench(), "t", msg("Choose 1 of your Benched Pokémon")),
        fx.pokemonTo(ref.v("t"), "deck"),
        fx.shuffle(),
      ]),
    ]),
  // Captivating Invitation: "Once during your turn, you may flip a coin. If heads, switch in 1 of your opponent's Benched
  // Pokémon to the Active Spot, and the new Active Pokémon is now Confused."
  "Florges@sv06-088": (d) =>
    abil(d, 0, {
      activated: {
        effects: [
          fx.flip(),
          fx.if(cond.and(cond.heads(), cond.exists(scope.oppBench())), [
            fx.choosePokemon(scope.oppBench(), "t", msg("Choose 1 of your opponent's Benched Pokémon")),
            { op: "switch", side: "opp", chooser: "me", with: "t" },
            fx.condition(ref.oppActive, "confused"),
          ]),
        ],
      },
    }),
  // Love Resonance: "If any of your Pokémon in play are the same type as any of your opponent's Pokémon in play, this attack
  // does 120 more damage."
  "Enamorus@sv06-093": (d) =>
    atk(d, 1, [
      fx.if(
        cond.or(
          ...ALL_TYPES.map((t) => cond.and(cond.exists(scope.mine({ types: [t] })), cond.exists(scope.theirs({ types: [t] })))),
        ),
        [fx.bonus(120)],
      ),
      fx.main(),
    ]),
  // Gutsy Swing: "If this Pokémon is affected by a Special Condition, ignore all Energy in this attack's cost."
  "Conkeldurr@sv06-105": (d) => ({
    attacks: (d.attacks ?? []).map((a, j) =>
      j === 1 ? { ...a, effects: [fx.main()], altCost: { cost: [], cond: cond.matches(ref.self, { conditioned: true }) } } : a,
    ),
  }),
  // Ground Crasher: "If a Stadium is in play, this attack also does 30 damage to each of your opponent's Benched Pokémon,
  // and discard that Stadium."
  "Ting-Lu@sv06-110": (d) =>
    atk(d, 0, [
      fx.main(),
      fx.if({ c: "stadium" }, [fx.damage(ref.all(scope.oppBench()), 30, { noWR: true }), fx.discardStadium()]),
    ]),
  // Impromptu Carrier: "When you play this Pokémon from your hand onto your Bench during your turn, you may search your deck
  // for a Pokémon Tool card and attach it to this Pokémon. Then, shuffle your deck."
  "Farfetch'd@sv06-132": (d) =>
    abil(d, 0, {
      triggers: [
        {
          on: "playedToBench",
          may: true,
          effects: [
            fx.chooseCards("deck", "t", SEARCH(), { filter: { category: ["trainer"], trainer: ["tool"] }, min: 0, max: 1 }),
            fx.attach("t", scope.self()),
            fx.shuffle(),
          ],
        },
      ],
    }),
  // Lucky Attachment: "Attach a Basic Energy card from your hand to 1 of your Pokémon."
  "Chansey@sv06-133": (d) =>
    atk(d, 0, [
      fx.chooseCards("hand", "e", msg("Choose a Basic Energy card"), { filter: BASIC_ENERGY, min: 1, max: 1 }),
      fx.attach("e", scope.mine()),
    ]),
  // Happy Switch: "Once during your turn, you may move a Basic Energy from 1 of your Pokémon to another of your Pokémon."
  "Blissey ex@sv06-134": (d) =>
    abil(d, 0, {
      activated: {
        condition: cond.and(cond.exists(scope.mine({ hasEnergy: true })), cond.cmp(amt.pokemon(scope.mine()), ">", 1)),
        effects: [
          fx.choosePokemon(scope.mine({ hasEnergy: true }), "from", msg("Choose the Pokémon to move the Energy from")),
          { op: "moveEnergy", from: ref.v("from"), to: scope.mine(), n: 1, basic: true },
        ],
      },
    }),
  // But First, Food: "Attach an Energy card from your hand to this Pokémon. If you do, heal 60 damage from this Pokémon."
  "Snorlax@sv06-136": (d) =>
    atk(d, 0, [
      fx.chooseCards("hand", "e", msg("Choose an Energy card"), { filter: { category: ["energy"] }, min: 1, max: 1 }),
      fx.attach("e", scope.self()),
      fx.if(cond.cmp(amt.count("e"), ">", 0), [fx.heal(ref.self, 60)]),
    ]),
  // Wicked Tail: "When you play this Pokémon from your hand to evolve 1 of your Pokémon during your turn, you may flip 2
  // coins. For each heads, choose a random card from your opponent's hand. Your opponent reveals those cards and shuffles
  // them into their deck."
  "Ambipom@sv06-138": (d) =>
    abil(d, 0, {
      triggers: [
        {
          on: "evolved",
          may: true,
          condition: cond.hasCards("hand", "opp"),
          effects: [
            fx.flip(2),
            fx.chooseCards("hand", "c", msg("Random cards from your opponent's hand"), {
              side: "opp",
              min: amt.heads(),
              max: amt.heads(),
              random: true,
              reveal: true,
            }),
            fx.move("c", "deck"),
            fx.shuffle("opp"),
          ],
        },
      ],
    }),
  // "Reveal the top 5 cards of your opponent's deck. You may choose any number of Basic Pokémon you find there and put those
  // Pokémon onto their Bench. Your opponent shuffles the other cards back into their deck."
  "Accompanying Flute@sv06-142": (d) =>
    trainer(d, {
      condition: cond.hasCards("deck", "opp"),
      effects: [
        fx.look("deck", "opp", 5),
        fx.chooseCards("deck", "b", msg("Choose Basic Pokémon to put onto your opponent's Bench"), {
          side: "opp",
          top: 5,
          filter: { category: ["pokemon"], stage: ["basic"] },
          min: 0,
          max: amt.benchSpace("opp"),
          reveal: true,
        }),
        fx.move("b", "bench"),
        fx.shuffle("opp"),
      ],
    }),
  // "Draw 2 cards. If you drew any cards in this way and if Community Center is in play, shuffle this Caretaker into your
  // deck instead of discarding it."
  "Caretaker@sv06-144": (d) =>
    trainer(d, {
      condition: cond.deck(),
      effects: [
        fx.draw(2, undefined, "drawn"),
        fx.if(cond.and(cond.cmp(amt.count("drawn"), ">", 0), { c: "stadium", names: ["Community Center"] }), [
          fx.move("thisCard", "deck"),
          fx.shuffle(),
        ]),
      ],
    }),
  // "Once during each player's turn, if they played a Supporter card from their hand this turn, they may heal 10 damage from
  // each of their Pokémon."
  "Community Center@sv06-146": (d) =>
    trainer(d, {
      stadiumAction: true,
      condition: cond.and(
        cond.cmp({ k: "turnLog", event: "supporterPlayed", side: "me" }, ">", 0),
        cond.exists(scope.mine({ damaged: true })),
      ),
      effects: [fx.heal(ref.all(scope.mine()), 10)],
    }),
  // "Discard a Special Energy from 1 of your opponent's Pokémon."
  "Enhanced Hammer@sv06-148": (d) =>
    trainer(d, {
      condition: cond.exists(scope.theirs({ specialEnergy: true })),
      effects: [
        fx.choosePokemon(scope.theirs({ specialEnergy: true }), "t", msg("Choose 1 of your opponent's Pokémon")),
        fx.discardEnergy(ref.v("t"), 1, { special: true }),
      ],
    }),
  // "If the Pokémon this card is attached to is in the Active Spot and is damaged by an attack from your opponent's Pokémon
  // (even if this Pokémon is Knocked Out), move an Energy from the Attacking Pokémon to 1 of your opponent's Benched
  // Pokémon."
  "Handheld Fan@sv06-150": (d) =>
    trainer(d, {
      triggers: [
        {
          on: "damagedByAttack",
          byOpponentAttack: true,
          condition: cond.and({ c: "var", key: "ev:wasActive" }, cond.exists(scope.oppBench())),
          effects: [{ op: "moveEnergy", from: { ev: "attacker" }, to: scope.oppBench(), n: 1 }],
        },
      ],
    }),
  // "You can use this card only if any of your Pokémon were Knocked Out during your opponent's last turn. Look at the top 8
  // cards of your deck and put up to 3 of them into your hand. Shuffle the other cards back into your deck."
  "Hassel@sv06-151": (d) =>
    trainer(d, {
      condition: cond.and(cond.cmp({ k: "turnLog", event: "knockedOut", side: "me", previous: true }, ">", 0), cond.deck()),
      effects: [fx.chooseCards("deck", "c", SEARCH(), { top: 8, min: 0, max: 3 }), fx.move("c", "hand"), fx.shuffle()],
    }),
  // "Search your deck for a Pokémon with the same name as 1 of your opponent's Pokémon in play, reveal it, and put it into
  // your hand. Then, shuffle your deck."
  "Love Ball@sv06-156": (d) =>
    trainer(d, {
      condition: cond.deck(),
      effects: [
        fx.chooseCards("deck", "c", SEARCH(), { filter: { ...POKEMON, nameInPlay: "opp" }, min: 0, max: 1, reveal: true }),
        fx.move("c", "hand"),
        fx.shuffle(),
      ],
    }),
  // "Each player shuffles their hand and puts it on the bottom of their deck. If either player put any cards on the bottom
  // of their deck in this way, each player flips a coin. If heads, that player draws 6 cards. If tails, they draw 3 cards."
  "Lucian@sv06-157": (d) =>
    trainer(d, {
      effects: [
        { op: "moveAll", zone: "hand", side: "me", to: "deckBottom", store: "a" },
        { op: "moveAll", zone: "hand", side: "opp", to: "deckBottom", store: "b" },
        fx.if(cond.cmp(amt.add(amt.v("a"), amt.v("b")), ">", 0), [
          fx.flip(1, "mine"),
          fx.if(cond.heads("mine"), [fx.draw(6)], [fx.draw(3)]),
          fx.flip(1, "theirs"),
          fx.if(cond.heads("theirs"), [fx.draw(6, "opp")], [fx.draw(3, "opp")]),
        ]),
      ],
    }),
  // "Reveal up to 2 Pokémon in your hand and put them into your deck. If you do, search your deck for up to that many
  // Pokémon, reveal them, and put them into your hand. Then, shuffle your deck."
  "Perrin@sv06-160": (d) =>
    trainer(d, {
      condition: cond.hasCards("hand", "me", POKEMON),
      effects: [
        fx.chooseCards("hand", "p", msg("Choose up to 2 Pokémon to put into your deck"), {
          filter: POKEMON,
          min: 1,
          max: 2,
          reveal: true,
          notSource: true,
        }),
        fx.set("n", amt.count("p")),
        fx.move("p", "deck"),
        fx.chooseCards("deck", "c", SEARCH(), { filter: POKEMON, min: 0, max: amt.v("n"), reveal: true }),
        fx.move("c", "hand"),
        fx.shuffle(),
      ],
    }),
  // "If the Pokémon this card is attached to has full HP and would be Knocked Out by damage from an attack from your
  // opponent's Pokémon, it is not Knocked Out, and its remaining HP becomes 10. Then, discard this card."
  "Survival Brace@sv06-164": (d) =>
    trainer(d, { statics: [{ s: "survive", scope: scope.self(), hp: 10, fullHp: true, consume: true, byOpponent: true }] }),
};

registerScripts(SCRIPTS);
