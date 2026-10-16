/**
 * Hand scripts of sv08 (Surging Sparks; PLAN-B B12), with the earlier Standard cards reprinted in it. Each script follows
 * the printed text; the details are in docs/extensions/sv08.md.
 */
import {
  type AbilityDef,
  amt,
  type CardDef,
  type CardFilter,
  cond,
  type Effect,
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
const basicOf = (t: "L" | "P" | "M"): CardFilter => ({ ...BASIC_ENERGY, energyTypes: [t] });
const every = (sc: ReturnType<typeof scope.theirs>, key: string): Effect =>
  fx.choosePokemon(sc, key, msg("Choose your opponent's Pokémon"), { min: amt.pokemon(sc), max: amt.pokemon(sc) });

const SCRIPTS: Record<string, CardScript> = {
  // Overvolt Discharge: "Once during your turn, you may attach up to 3 Basic Energy cards from your discard pile to your
  // {L} Pokémon in any way you like. If you use this Ability, this Pokémon is Knocked Out."
  "Magneton@svp-153": (d) =>
    abil(d, 0, {
      selfKO: true,
      activated: {
        effects: [
          fx.chooseCards("discard", "e", msg("Choose Basic Energy cards from your discard pile"), {
            filter: BASIC_ENERGY,
            min: 0,
            max: 3,
          }),
          fx.attach("e", scope.mine({ types: ["L"] })),
          { op: "knockOut", target: ref.self },
        ],
      },
    }),
  // Obliging Heal: "When you play this Pokémon from your hand onto your Bench during your turn, you may heal 30 damage from
  // your Active Pokémon and have it recover from a Special Condition."
  "Indeedee@svp-154": (d) =>
    abil(d, 0, {
      triggers: [
        {
          on: "playedToBench",
          may: true,
          effects: [
            fx.heal(ref.myActive, 30),
            fx.chooseOne(msg("Choose a Special Condition to remove"), [
              {
                label: msg("Asleep"),
                cond: cond.hasCondition(ref.myActive, "asleep"),
                effects: [{ op: "cure", target: ref.myActive, conds: ["asleep"] }],
              },
              {
                label: msg("Burned"),
                cond: cond.hasCondition(ref.myActive, "burned"),
                effects: [{ op: "cure", target: ref.myActive, conds: ["burned"] }],
              },
              {
                label: msg("Confused"),
                cond: cond.hasCondition(ref.myActive, "confused"),
                effects: [{ op: "cure", target: ref.myActive, conds: ["confused"] }],
              },
              {
                label: msg("Paralyzed"),
                cond: cond.hasCondition(ref.myActive, "paralyzed"),
                effects: [{ op: "cure", target: ref.myActive, conds: ["paralyzed"] }],
              },
              {
                label: msg("Poisoned"),
                cond: cond.hasCondition(ref.myActive, "poisoned"),
                effects: [{ op: "cure", target: ref.myActive, conds: ["poisoned"] }],
              },
            ]),
          ],
        },
      ],
    }),
  // Jungle Whip: "You may put all Energy attached to this Pokémon into your hand to have this attack do 80 more damage."
  "Zarude@sv08-011": (d) =>
    atk(d, 1, [
      fx.if(cond.cmp(amt.energy(ref.self), ">", 0), [
        fx.may(msg("Do more damage?"), [fx.discardEnergy(ref.self, "all", { to: "hand" }), fx.bonus(80)]),
      ]),
      fx.main(),
    ]),
  // Crimson Blaster: "Discard all {R} Energy from this Pokémon, and this attack does 180 damage to 1 of your opponent's
  // Benched Pokémon."
  "Armarouge@sv08-034": (d) =>
    atk(d, 1, [
      fx.discardEnergy(ref.self, "all", { types: ["R"] }),
      fx.if(cond.exists(scope.oppBench()), [
        fx.choosePokemon(scope.oppBench(), "t", msg("Choose 1 of your opponent's Benched Pokémon")),
        fx.damage(ref.v("t"), 180),
      ]),
    ]),
  // Cursed Edge: "Discard all Special Energy from all of your opponent's Pokémon."
  "Ceruledge@sv08-035": (d) =>
    atk(d, 0, [
      fx.main(),
      every(scope.theirs({ specialEnergy: true }), "t"),
      { op: "forEach", key: "t", as: "p", effects: [fx.discardEnergy(ref.v("p"), "all", { special: true })] },
    ]),
  // Upthrusting Horns: "You may put 2 Energy attached to your opponent's Active Stage 2 Pokémon into their hand."
  "Paldean Tauros@sv08-039": (d) =>
    atk(d, 0, [
      fx.main(),
      fx.if(cond.matches(ref.defending, { stage: ["stage2"] }), [
        fx.may(msg("Put Energy attached to your opponent's Active Pokémon into their hand?"), [
          fx.discardEnergy(ref.defending, 2, { to: "hand" }),
        ]),
      ]),
    ]),
  // Frigid Fangs: "During your opponent's next turn, Pokémon that have 2 or less Energy attached can't attack. (This
  // includes new Pokémon that come into play.)"
  "Walrein@sv08-045": (d) =>
    atk(d, 0, [fx.main(), fx.timed("opponentsNextTurn", { s: "cantAttack", scope: scope.theirs({ maxEnergy: 2 }) })]),
  // Up-Tempo: "You must put a card from your hand on the bottom of your deck in order to use this Ability. Once during
  // your turn, you may draw cards until you have 5 cards in your hand."
  "Quaquaval@sv08-052": (d) =>
    abil(d, 0, {
      activated: {
        condition: cond.and(cond.cmp(amt.cards("hand", "me"), ">=", 1), cond.cmp(amt.cards("hand", "me"), "<", 6)),
        effects: [
          fx.chooseCards("hand", "b", msg("Choose a card to put on the bottom of your deck"), { min: 1, max: 1 }),
          fx.move("b", "deckBottom"),
          fx.drawUntil(5),
        ],
      },
    }),
  // Crushing Pulse: "Your opponent reveals their hand. Discard all Item cards and Pokémon Tool cards you find there."
  "Rotom@sv08-061": (d) =>
    atk(d, 0, [
      fx.main(),
      { op: "revealHand", side: "opp" },
      fx.moveAll("hand", "opp", "discard", { category: ["trainer"], trainer: ["item", "tool"] }),
    ]),
  // Paralyzing Crackle: "Flip a coin. If heads, your opponent's Active Pokémon is now Paralyzed, and discard an Energy from
  // that Pokémon."
  "Stunfisk@sv08-064": (d) =>
    atk(d, 0, [
      fx.main(),
      fx.flip(),
      fx.if(cond.heads(), [fx.condition(ref.defending, "paralyzed"), fx.discardEnergy(ref.defending, 1)]),
    ]),
  // Storm Bolt: "Move all Energy from this Pokémon to your Benched Pokémon in any way you like."
  "Kilowattrel@sv08-067": (d) =>
    atk(d, 1, [
      fx.main(),
      fx.repeat(amt.energy(ref.self), [fx.if(cond.exists(scope.myBench()), [fx.moveEnergy(ref.self, scope.myBench(), 1)])]),
    ]),
  // Return Charge: "Switch this Pokémon with 1 of your Benched Pokémon. If you do, attach up to 2 Basic {L} Energy cards
  // from your hand to this Pokémon."
  "Kilowattrel ex@sv08-068": (d) =>
    atk(d, 0, [
      fx.main(),
      fx.if(cond.exists(scope.myBench()), [
        fx.switch("me"),
        fx.chooseCards("hand", "e", msg("Choose Energy cards from your hand"), { filter: basicOf("L"), min: 0, max: 2 }),
        fx.attach("e", scope.self()),
      ]),
    ]),
  // C.O.D.E.: Protect: "During your opponent's next turn, prevent all damage done to each of your Future Pokémon by
  // attacks from Pokémon ex. If this Pokémon is no longer your Active Pokémon, this effect ends."
  "Miraidon@sv08-069": (d) =>
    atk(d, 0, [
      fx.timed("opponentsNextTurn", {
        s: "prevent",
        scope: scope.mine({ tags: ["future"] }),
        what: "damage",
        from: { tags: ["ex"] },
        cond: { c: "matches", ref: ref.myActive, filter: { names: ["Miraidon"] } },
      }),
    ]),
  // Full Heart: "Attach up to 2 Basic {P} Energy cards from your hand to your Pokémon in any way you like."
  "Mesprit@sv08-079": (d) =>
    atk(d, 0, [
      fx.chooseCards("hand", "e", msg("Choose Energy cards from your hand"), { filter: basicOf("P"), min: 0, max: 2 }),
      fx.attach("e", scope.mine()),
    ]),
  // Law of the Underworld: "Put 6 damage counters on each Pokémon that has an Ability (both yours and your opponent's)."
  "Cofagrigus@sv08-083": (d) => atk(d, 0, [fx.counters(ref.all(scope.of("both", "any", { hasAbility: true })), 6)]),
  // Barite Jail: "Put damage counters on each of your opponent's Benched Pokémon until its remaining HP is 100."
  "Palossand ex@sv08-091": (d) =>
    atk(d, 1, [
      every(scope.oppBench(), "t"),
      {
        op: "forEach",
        key: "t",
        as: "p",
        effects: [
          fx.counters(ref.v("p"), {
            k: "max",
            of: [0, { k: "div", a: amt.sub({ k: "remainingHp", on: ref.v("p") }, 100), b: 10 }],
          }),
        ],
      },
    ]),
  // Destined Fight: "Both Active Pokémon are Knocked Out."
  "Annihilape@sv08-100": (d) =>
    atk(d, 1, [
      { op: "knockOut", target: ref.defending },
      { op: "knockOut", target: ref.self },
    ]),
  // Blocking Stomp: "If the Defending Pokémon is a Basic Pokémon, it can't attack during your opponent's next turn."
  "Paldean Tauros@sv08-101": (d) =>
    atk(d, 1, [
      fx.main(),
      fx.if(cond.matches(ref.defending, { stage: ["basic"] }), [
        fx.timed("opponentsNextTurn", { s: "cantAttack", scope: scope.oppActive() }, ref.defending),
      ]),
    ]),
  // Corrosive Shards: "Your opponent's Active Pokémon is now Poisoned. During your opponent's next turn, Energy cards can't
  // be attached from your opponent's hand to that Pokémon."
  "Glimmora@sv08-115": (d) =>
    atk(d, 0, [
      fx.main(),
      fx.condition(ref.defending, "poisoned"),
      fx.timed("opponentsNextTurn", { s: "cantAttach", scope: scope.oppActive() }, ref.defending),
    ]),
  // Unrelenting Onslaught: "If 1 of your other Ancient Pokémon used an attack during your last turn, this attack does 150
  // more damage."
  "Koraidon@sv08-116": (d) =>
    atk(d, 0, [
      fx.if({ c: "didLastTurn", kind: "attacked", ref: ref.all({ ...scope.mine({ tags: ["ancient"] }), notSelf: true }) }, [
        fx.bonus(150),
      ]),
      fx.main(),
    ]),
  // Mischievous Painting: "Attach up to 3 Energy cards from your opponent's discard pile to their Pokémon in any way you
  // like."
  "Grafaiai@sv08-121": (d) =>
    atk(d, 0, [
      fx.main(),
      fx.chooseCards("discard", "e", msg("Choose Energy cards from your opponent's discard pile"), {
        side: "opp",
        filter: { category: ["energy"] },
        min: 0,
        max: 3,
      }),
      fx.attach("e", scope.theirs()),
    ]),
  // Metal Defender: "During your opponent's next turn, this Pokémon has no Weakness." Assemble Alloy: "When you play this
  // Pokémon from your hand to evolve 1 of your Pokémon during your turn, you may attach up to 2 Basic {M} Energy cards from
  // your discard pile to your {M} Pokémon in any way you like."
  "Archaludon ex@sv08-130": (d) => ({
    ...atk(d, 0, [fx.main(), fx.timed("opponentsNextTurn", { s: "noWeakness", scope: scope.self() }, ref.self)]),
    ...abil(d, 0, {
      triggers: [
        {
          on: "evolved",
          may: true,
          condition: cond.hasCards("discard", "me", basicOf("M")),
          effects: [
            fx.chooseCards("discard", "e", msg("Choose Basic Metal Energy cards from your discard pile"), {
              filter: basicOf("M"),
              min: 0,
              max: 2,
            }),
            fx.attach("e", scope.mine({ types: ["M"] })),
          ],
        },
      ],
    }),
  }),
  // Swinging Sphene: "Flip a coin. If heads, Knock Out your opponent's Active Basic Pokémon. If tails, Knock Out 1 of your
  // opponent's Benched Basic Pokémon."
  "Alolan Exeggutor ex@sv08-133": (d) =>
    atk(d, 1, [
      fx.flip(),
      fx.if(
        cond.heads(),
        [fx.if(cond.matches(ref.defending, { stage: ["basic"] }), [{ op: "knockOut", target: ref.defending }])],
        [
          fx.if(cond.exists(scope.oppBench({ stage: ["basic"] })), [
            fx.choosePokemon(scope.oppBench({ stage: ["basic"] }), "t", msg("Choose 1 of your opponent's Benched Pokémon")),
            { op: "knockOut", target: ref.v("t") },
          ]),
        ],
      ),
    ]),
  // Time Manipulation: "Search your deck for 2 cards, shuffle your deck, then put those cards on top of it in any order."
  "Dialga@sv08-135": (d) =>
    atk(d, 0, [
      fx.chooseCards("deck", "c", SEARCH(), { min: amt.min(2, amt.cards("deck", "me")), max: 2 }),
      fx.shuffle(),
      { op: "orderCards", key: "c", prompt: msg("Put them back in any order (first = top)") },
      fx.move("c", "deckTop"),
    ]),
  // Fully Singe: "Discard an Energy from your opponent's Active Pokémon ex."
  "Turtonator@sv08-137": (d) =>
    atk(d, 0, [fx.main(), fx.if(cond.matches(ref.defending, { tags: ["ex"] }), [fx.discardEnergy(ref.defending, 1)])]),
  // Fury Cutter: "Flip 3 coins. If 1 of them is heads, this attack does 20 more damage. If 2 of them are heads, this
  // attack does 50 more damage. If all of them are heads, this attack does 80 more damage."
  "Zangoose@sv08-149": (d) =>
    atk(d, 0, [
      fx.flip(3),
      fx.if(cond.cmp(amt.heads(), "==", 1), [fx.bonus(20)]),
      fx.if(cond.cmp(amt.heads(), "==", 2), [fx.bonus(50)]),
      fx.if(cond.cmp(amt.heads(), "==", 3), [fx.bonus(80)]),
      fx.main(),
    ]),
  // Now You're in My Power: "Until the end of your next turn, the Defending Pokémon's Weakness is now {C}. (The amount of
  // Weakness doesn't change.)"
  "Oranguru@sv08-156": (d) =>
    atk(d, 0, [
      fx.main(),
      fx.timed("untilYourNextTurnEnd", { s: "weakness", scope: scope.oppActive(), type: "C" }, ref.defending),
    ]),
  // Familial March: "Search your deck for up to 2 in any combination of Maushold and Maushold ex and put them onto your
  // Bench. Then, shuffle your deck."
  "Maushold@sv08-158": (d) =>
    atk(d, 0, [
      fx.chooseCards("deck", "found", SEARCH(), {
        filter: { category: ["pokemon"], names: ["Maushold", "Maushold ex"] },
        min: 0,
        max: amt.min(2, amt.benchSpace()),
      }),
      { op: "move", cards: "found", to: "bench", anyStage: true },
      fx.shuffle(),
    ]),
  // "If the Pokémon this card is attached to is Knocked Out by damage from an attack from your opponent's Pokémon, search
  // your deck for up to 3 cards and put them into your hand. Then, shuffle your deck."
  "Amulet of Hope@sv08-162": (d) =>
    trainer(d, {
      triggers: [
        {
          on: "knockedOut",
          byOpponentAttack: true,
          effects: [fx.chooseCards("deck", "c", SEARCH(), { min: 0, max: 3 }), fx.move("c", "hand"), fx.shuffle()],
        },
      ],
    }),
  // "Search your deck for up to 5 cards and discard them. Then, shuffle your deck."
  "Brilliant Blender@sv08-164": (d) =>
    trainer(d, {
      condition: cond.deck(),
      effects: [fx.chooseCards("deck", "c", SEARCH(), { min: 0, max: 5 }), fx.move("c", "discard"), fx.shuffle()],
    }),
  // "You can use this card only if you go second, and only during your first turn. Put an Energy attached to 1 of your
  // opponent's Pokémon into their hand."
  "Chill Teaser Toy@sv08-166": (d) =>
    trainer(d, {
      condition: cond.and(cond.not({ c: "wentFirst" }), { c: "firstTurn" }, cond.exists(scope.theirs({ hasEnergy: true }))),
      effects: [
        fx.choosePokemon(scope.theirs({ hasEnergy: true }), "t", msg("Choose 1 of your opponent's Pokémon")),
        fx.discardEnergy(ref.v("t"), 1, { to: "hand" }),
      ],
    }),
  // "Look at the top 3 cards of your deck and put them back in any order, or shuffle them and put them on the bottom of
  // your deck."
  "Deduction Kit@sv08-171": (d) =>
    trainer(d, {
      condition: cond.deck(),
      effects: [
        fx.chooseCards("deck", "top", msg("The top 3 cards of your deck"), { top: 3, min: 0, max: 3, random: true }),
        fx.chooseOne(msg("Choose 1"), [
          {
            label: msg("Put them back in any order"),
            effects: [
              { op: "orderCards", key: "top", prompt: msg("Put them back in any order (first = top)") },
              fx.move("top", "deckTop"),
            ],
          },
          { label: msg("Put them on the bottom of your deck"), effects: [fx.move("top", "deckBottom")] },
        ]),
      ],
    }),
  // "Shuffle your hand into your deck. Then, flip a coin. If heads, draw 8 cards. If tails, draw 3 cards."
  "Drasna@sv08-173": (d) =>
    trainer(d, {
      effects: [fx.moveAll("hand", "me", "deck"), fx.shuffle(), fx.flip(), fx.if(cond.heads(), [fx.draw(8)], [fx.draw(3)])],
    }),
  // "Look at the bottom 7 cards of your deck. You may reveal a Pokémon you find there and put it into your hand. Shuffle
  // the other cards back into your deck."
  "Dusk Ball@sv08-175": (d) =>
    trainer(d, {
      condition: cond.deck(),
      effects: [
        fx.chooseCards("deck", "p", msg("You may reveal a Pokémon"), {
          bottom: 7,
          filter: { category: ["pokemon"] },
          min: 0,
          max: 1,
          reveal: true,
        }),
        fx.move("p", "hand"),
        fx.shuffle(),
      ],
    }),
  // "Search your deck for any number of Basic Energy cards of different types, reveal them, and put them into your hand."
  "Energy Search Pro@sv08-176": (d) =>
    trainer(d, {
      condition: cond.deck(),
      effects: [
        fx.chooseCards("deck", "e", SEARCH(), { filter: BASIC_ENERGY, min: 0, max: 8, distinctNames: true, reveal: true }),
        fx.move("e", "hand"),
        fx.shuffle(),
      ],
    }),
  // "Switch in 1 of your opponent's Benched Basic Pokémon to the Active Spot. If you do, the new Active Pokémon is now
  // Confused."
  "Lisia's Appeal@sv08-179": (d) =>
    trainer(d, {
      condition: cond.exists(scope.oppBench({ stage: ["basic"] })),
      effects: [
        fx.choosePokemon(scope.oppBench({ stage: ["basic"] }), "t", msg("Choose 1 of your opponent's Benched Pokémon")),
        { op: "switch", side: "opp", chooser: "me", with: "t" },
        fx.condition(ref.oppActive, "confused"),
      ],
    }),
  // "Your opponent counts the cards in their hand, shuffles those cards, and puts them on the bottom of their deck. If
  // they do, they draw that many cards."
  "Meddling Memo@sv08-181": (d) =>
    trainer(d, {
      condition: cond.cmp(amt.cards("hand", "opp"), ">", 0),
      effects: [{ op: "moveAll", zone: "hand", side: "opp", to: "deckBottom", store: "n" }, fx.draw(amt.v("n"), "opp")],
    }),
  // "Discard all Pokémon Tools and Special Energy from all of your opponent's Pokémon, and discard a Stadium in play."
  "Megaton Blower@sv08-182": (d) =>
    trainer(d, {
      effects: [
        every(scope.theirs(), "t"),
        {
          op: "forEach",
          key: "t",
          as: "p",
          effects: [fx.discardTools(ref.v("p")), fx.discardEnergy(ref.v("p"), "all", { special: true })],
        },
        fx.discardStadium(),
      ],
    }),
  // "Switch your Active Pokémon with 1 of your Benched Pokémon. If you do, you may move any amount of Energy from the
  // Pokémon you moved to your Bench to the new Active Pokémon."
  "Scramble Switch@sv08-186": (d) =>
    trainer(d, {
      condition: cond.exists(scope.myBench()),
      effects: [
        fx.choosePokemon(scope.myActive(), "old", msg("Your Active Pokémon")),
        fx.switch("me"),
        fx.set("stop", 0),
        fx.repeat(20, [
          fx.if(cond.and(cond.not({ c: "var", key: "stop" }), cond.cmp(amt.energy(ref.v("old")), ">", 0)), [
            fx.may(
              msg("Move an Energy to the new Active Pokémon?"),
              [fx.moveEnergy(ref.v("old"), scope.myActive(), 1)],
              [fx.set("stop", 1)],
            ),
          ]),
        ]),
      ],
    }),
  // "The Pokémon this card is attached to can use the attack on this card. If this card is attached to 1 of your Pokémon,
  // discard it at the end of your turn." Fluorite ({G}{W}{P}): "Discard all Energy from this Pokémon, and heal all damage
  // from each of your Tera Pokémon."
  "Technical Machine: Fluorite@sv08-188": (d) =>
    trainer(d, {
      attacks: [
        {
          name: "Fluorite",
          cost: ["G", "W", "P"],
          damage: 0,
          text: "Discard all Energy from this Pokémon, and heal all damage from each of your Tera Pokémon.",
          effects: [fx.discardEnergy(ref.self, "all"), fx.heal(ref.all(scope.mine({ tags: ["tera"] })), "all")],
        },
      ],
      triggers: [{ on: "turnEnd", effects: [fx.move("thisCard", "discard")] }],
    }),
};

registerScripts(SCRIPTS);
