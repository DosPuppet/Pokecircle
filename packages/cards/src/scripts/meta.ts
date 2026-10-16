/**
 * Hand scripts of the meta decks' cards (PLAN-A P6) that the compiler does not read. Each script follows the printed
 * text; the details of each batch are in docs/extensions/meta.md.
 */
import { type AbilityDef, amt, type CardDef, cond, type Effect, fx, msg, ref, scope, type TrainerDef } from "@pokecircle/engine";
import { type CardScript, registerScripts } from "../scripts";

/** The attack `i` gets these effects. */
const atk = (d: CardDef, i: number, effects: Effect[]): Partial<CardDef> => ({
  attacks: (d.attacks ?? []).map((a, j) => (j === i ? { ...a, effects } : a)),
});
/** The Ability `i` gets these parts. */
const abil = (d: CardDef, i: number, parts: Partial<AbilityDef>): Partial<CardDef> => ({
  abilities: (d.abilities ?? []).map((a, j) => (j === i ? { ...a, ...parts } : a)),
});
const trainer = (d: CardDef, t: Partial<TrainerDef>): Partial<CardDef> => ({
  trainer: { kind: d.trainer?.kind ?? "item", ...d.trainer, ...t },
});

const BASIC_ENERGY = { category: ["energy" as const], basicEnergy: true };
const SEARCH = () => msg("Choose cards from your deck");
const DISCARD_PILE = () => msg("Choose cards from your discard pile");
/** Each player shuffles their hand into their deck. */
const BOTH_HANDS_TO_DECK: Effect[] = [
  fx.moveAll("hand", "me", "deck"),
  fx.shuffle("me"),
  fx.moveAll("hand", "opp", "deck"),
  fx.shuffle("opp"),
];
const KO_LAST_TURN = cond.cmp({ k: "turnLog", event: "knockedOut", side: "me", previous: true }, ">", 0);
/** "During this turn, attacks used by your Pokémon do N more damage to your opponent's Active Pokémon ex". */
const thisTurnVsEx = (n: number): Effect =>
  fx.timed("thisTurn", { s: "dealt", scope: scope.mine(), add: n, vs: { tags: ["ex"] }, activeOnly: true });

const SCRIPTS: Record<string, CardScript> = {
  // —— Supporters ——
  "Lillie's Determination": (d) =>
    trainer(d, {
      effects: [
        fx.moveAll("hand", "me", "deck"),
        fx.shuffle(),
        fx.if(cond.cmp(amt.prizesLeft("me"), "==", 6), [fx.draw(8)], [fx.draw(6)]),
      ],
    }),
  Dawn: (d) =>
    trainer(d, {
      effects: [
        fx.chooseCards("deck", "b", SEARCH(), { filter: { category: ["pokemon"], stage: ["basic"] }, max: 1, reveal: true }),
        fx.move("b", "hand"),
        fx.chooseCards("deck", "s1", SEARCH(), { filter: { category: ["pokemon"], stage: ["stage1"] }, max: 1, reveal: true }),
        fx.move("s1", "hand"),
        fx.chooseCards("deck", "s2", SEARCH(), { filter: { category: ["pokemon"], stage: ["stage2"] }, max: 1, reveal: true }),
        fx.move("s2", "hand"),
        fx.shuffle(),
      ],
      condition: cond.deck(),
    }),
  Crispin: (d) =>
    trainer(d, {
      effects: [
        fx.chooseCards("deck", "two", msg("Choose up to 2 Basic Energy cards of different types"), {
          filter: BASIC_ENERGY,
          max: 2,
          reveal: true,
          distinctNames: true,
        }),
        fx.if(
          cond.cmp(amt.count("two"), "==", 2),
          [
            fx.chooseCards("deck", "h", msg("Choose the card to put into your hand"), { among: "two", min: 1, max: 1 }),
            fx.move("h", "hand"),
            { op: "varMinus", key: "two", minus: "h" },
            fx.attach("two", scope.mine()),
          ],
          [fx.move("two", "hand")],
        ),
        fx.shuffle(),
      ],
      condition: cond.deck(),
    }),
  "Ciphermaniac's Codebreaking": (d) =>
    trainer(d, {
      effects: [
        fx.chooseCards("deck", "two", SEARCH(), { min: amt.min(2, amt.cards("deck", "me")), max: 2 }),
        fx.shuffle(),
        { op: "orderCards", key: "two", prompt: msg("Put the cards on top of your deck: the first is on top") },
        fx.move("two", "deckTop"),
      ],
      condition: cond.deck(),
    }),
  Eri: (d) =>
    trainer(d, {
      effects: [
        { op: "revealHand", side: "opp" },
        fx.chooseCards("hand", "items", msg("Choose up to 2 Item cards to discard"), {
          side: "opp",
          filter: { category: ["trainer"], trainer: ["item"] },
          max: 2,
        }),
        fx.move("items", "discard"),
      ],
    }),
  "Xerosic's Machinations": (d) =>
    trainer(d, {
      effects: [
        fx.set("n", amt.sub(amt.cards("hand", "opp"), 3)),
        fx.chooseCards("hand", "x", msg("Discard cards until you have 3 cards in your hand"), {
          side: "opp",
          chooser: "opp",
          min: amt.v("n"),
          max: amt.v("n"),
        }),
        fx.move("x", "discard"),
      ],
      condition: cond.cmp(amt.cards("hand", "opp"), ">", 3),
    }),
  "Rosa's Encouragement": (d) =>
    trainer(d, {
      effects: [
        fx.choosePokemon(scope.mine({ stage: ["stage2"] }), "t", msg("Choose your Stage 2 Pokémon")),
        fx.chooseCards("discard", "e", DISCARD_PILE(), { filter: BASIC_ENERGY, max: 2 }),
        {
          op: "attach",
          cards: "e",
          to: scope.mine(),
          prompt: msg("Choose the Pokémon to attach the card to"),
          target: ref.v("t"),
        },
      ],
      condition: cond.and(
        cond.cmp(amt.prizesLeft("me"), ">", amt.prizesLeft("opp")),
        cond.exists(scope.mine({ stage: ["stage2"] })),
        cond.hasCards("discard", "me", BASIC_ENERGY),
      ),
    }),
  "Gladion's Final Battle": (d) =>
    trainer(d, {
      effects: [fx.timed("thisTurn", { s: "dealt", scope: scope.mine({ noTags: ["ruleBox"] }), add: 80, activeOnly: true })],
      condition: cond.cmp(amt.cards("hand", "me"), "==", 1),
    }),
  Kieran: (d) =>
    trainer(d, {
      effects: [
        fx.chooseOne(msg("Choose 1"), [
          {
            label: msg("Switch your Active Pokémon with 1 of your Benched Pokémon"),
            cond: cond.bench("me"),
            effects: [fx.switch("me")],
          },
          { label: msg("This turn, your attacks do 30 more damage to Pokémon ex"), effects: [thisTurnVsEx(30)] },
        ]),
      ],
    }),
  Briar: (d) =>
    trainer(d, {
      effects: [
        fx.timed("thisTurn", {
          s: "prizes",
          scope: scope.oppActive(),
          delta: 1,
          byAttack: true,
          cond: cond.matches(ref.myActive, { tags: ["tera"] }),
        }),
      ],
      condition: cond.cmp(amt.prizesLeft("opp"), "==", 2),
    }),
  "Brock's Scouting": (d) =>
    trainer(d, {
      effects: [
        fx.chooseOne(msg("Choose 1"), [
          {
            label: msg("Up to 2 Basic Pokémon"),
            effects: [
              fx.chooseCards("deck", "c", SEARCH(), {
                filter: { category: ["pokemon"], stage: ["basic"] },
                max: 2,
                reveal: true,
              }),
            ],
          },
          {
            label: msg("1 Evolution Pokémon"),
            effects: [
              fx.chooseCards("deck", "c", SEARCH(), {
                filter: { category: ["pokemon"], stage: ["stage1", "stage2"] },
                max: 1,
                reveal: true,
              }),
            ],
          },
        ]),
        fx.move("c", "hand"),
        fx.shuffle(),
      ],
      condition: cond.deck(),
    }),
  "Janine's Secret Art": (d) =>
    trainer(d, {
      effects: [
        fx.choosePokemon(scope.mine({ types: ["D"] }), "ps", msg("Choose up to 2 of your {D} Pokémon"), { min: 0, max: 2 }),
        fx.forEach("ps", "t", [
          fx.chooseCards("deck", "e", SEARCH(), { filter: { ...BASIC_ENERGY, energyTypes: ["D"] }, max: 1 }),
          {
            op: "attach",
            cards: "e",
            to: scope.mine(),
            prompt: msg("Choose the Pokémon to attach the card to"),
            target: ref.v("t"),
            store: "got",
          },
        ]),
        fx.shuffle(),
        fx.if({ c: "isActive", ref: ref.v("got") }, [fx.condition(ref.myActive, "poisoned")]),
      ],
      condition: cond.exists(scope.mine({ types: ["D"] })),
    }),
  "Black Belt's Training": (d) => trainer(d, { effects: [thisTurnVsEx(40)] }),
  Hilda: (d) =>
    trainer(d, {
      effects: [
        fx.chooseCards("deck", "evo", SEARCH(), {
          filter: { category: ["pokemon"], stage: ["stage1", "stage2"] },
          max: 1,
          reveal: true,
        }),
        fx.move("evo", "hand"),
        fx.chooseCards("deck", "en", SEARCH(), { filter: { category: ["energy"] }, max: 1, reveal: true }),
        fx.move("en", "hand"),
        fx.shuffle(),
      ],
      condition: cond.deck(),
    }),
  // —— Items ——
  "Secret Box": (d) =>
    trainer(d, {
      effects: [
        fx.chooseCards("hand", "cost", msg("Choose cards to discard from your hand"), { min: 3, max: 3, notSource: true }),
        fx.move("cost", "discard"),
        ...(["item", "tool", "supporter", "stadium"] as const).flatMap((k) => [
          fx.chooseCards("deck", k, SEARCH(), { filter: { category: ["trainer"], trainer: [k] }, max: 1, reveal: true }),
          fx.move(k, "hand"),
        ]),
        fx.shuffle(),
      ],
      condition: cond.cmp(amt.cards("hand", "me"), ">=", 4),
    }),
  "Rare Candy": (d) =>
    trainer(d, {
      effects: [
        {
          op: "evolveFromHand",
          scope: scope.mine({ stage: ["basic"], enteredBefore: true }),
          skipStage1: true,
          prompt: msg("Choose your Basic Pokémon"),
        },
      ],
      condition: cond.and(
        cond.not({ c: "firstTurn" }),
        cond.exists(scope.mine({ stage: ["basic"], enteredBefore: true })),
        cond.hasCards("hand", "me", { category: ["pokemon"], stage: ["stage2"] }),
      ),
    }),
  "Special Red Card": (d) =>
    trainer(d, {
      effects: [
        { op: "moveAll", zone: "hand", side: "opp", to: "deckBottom", store: "n" },
        fx.if(cond.cmp(amt.v("n"), ">", 0), [fx.draw(3, "opp")]),
      ],
      condition: cond.cmp(amt.prizesLeft("opp"), "<=", 3),
    }),
  "Unfair Stamp": (d) =>
    trainer(d, { effects: [...BOTH_HANDS_TO_DECK, fx.draw(5, "me"), fx.draw(2, "opp")], condition: KO_LAST_TURN }),
  "Sacred Ash": (d) =>
    trainer(d, {
      effects: [
        fx.chooseCards("discard", "p", DISCARD_PILE(), { filter: { category: ["pokemon"] }, max: 5 }),
        fx.move("p", "deck"),
        fx.shuffle(),
      ],
      condition: cond.hasCards("discard", "me", { category: ["pokemon"] }),
    }),
  "Energy Switch": (d) =>
    trainer(d, {
      effects: [
        fx.choosePokemon(scope.mine({ hasEnergy: true }), "from", msg("Choose the Pokémon to move a Basic Energy from")),
        { op: "moveEnergy", from: ref.v("from"), to: scope.mine(), n: 1, basic: true },
      ],
      condition: cond.and(cond.exists(scope.mine({ hasEnergy: true })), cond.cmp(amt.pokemon(scope.mine()), ">=", 2)),
    }),
  "Glass Trumpet": (d) =>
    trainer(d, {
      effects: [
        fx.choosePokemon(scope.myBench({ types: ["C"] }), "b", msg("Choose up to 2 of your Benched {C} Pokémon"), {
          min: 0,
          max: 2,
        }),
        fx.forEach("b", "t", [
          fx.chooseCards("discard", "e", DISCARD_PILE(), { filter: BASIC_ENERGY, max: 1 }),
          {
            op: "attach",
            cards: "e",
            to: scope.mine(),
            prompt: msg("Choose the Pokémon to attach the card to"),
            target: ref.v("t"),
          },
        ]),
      ],
      condition: cond.and(cond.exists(scope.mine({ tags: ["tera"] })), cond.hasCards("discard", "me", BASIC_ENERGY)),
    }),
  "Crushing Hammer": (d) =>
    trainer(d, {
      effects: [
        fx.flip(),
        fx.if(cond.heads(), [
          fx.choosePokemon(scope.theirs({ hasEnergy: true }), "t", msg("Choose your opponent's Pokémon")),
          fx.discardEnergy(ref.v("t"), 1),
        ]),
      ],
      condition: cond.exists(scope.theirs({ hasEnergy: true })),
    }),
  "Bug Catching Set": (d) =>
    trainer(d, {
      effects: [
        fx.chooseCards("deck", "c", SEARCH(), {
          top: 7,
          filter: {
            anyOf: [
              { category: ["pokemon"], types: ["G"] },
              { ...BASIC_ENERGY, energyTypes: ["G"] },
            ],
          },
          max: 2,
          reveal: true,
        }),
        fx.move("c", "hand"),
        fx.shuffle(),
      ],
      condition: cond.deck(),
    }),
  "N's PP Up": (d) =>
    trainer(d, {
      effects: [
        fx.chooseCards("discard", "e", DISCARD_PILE(), { filter: BASIC_ENERGY, min: 1, max: 1 }),
        fx.attach("e", scope.myBench({ nameIncludes: "N's" })),
      ],
      condition: cond.and(cond.hasCards("discard", "me", BASIC_ENERGY), cond.exists(scope.myBench({ nameIncludes: "N's" }))),
    }),
  // —— Tools ——
  "Lucky Helmet": (d) =>
    trainer(d, {
      triggers: [
        { on: "damagedByAttack", byOpponentAttack: true, condition: { c: "isActive", ref: ref.self }, effects: [fx.draw(2)] },
      ],
    }),
  "Brave Bangle": (d) =>
    trainer(d, {
      statics: [
        {
          s: "dealt",
          scope: { ...scope.self(), filter: { noTags: ["ruleBox"] } },
          add: 30,
          vs: { tags: ["ex"] },
          activeOnly: true,
        },
      ],
    }),
  "Binding Mochi": (d) =>
    trainer(d, {
      statics: [{ s: "dealt", scope: scope.self(), add: 40, activeOnly: true, cond: cond.hasCondition(ref.self, "poisoned") }],
    }),
  "Punk Helmet": (d) =>
    trainer(d, {
      triggers: [
        {
          on: "damagedByAttack",
          byOpponentAttack: true,
          condition: cond.and({ c: "isActive", ref: ref.self }, cond.matches(ref.self, { types: ["D"] })),
          effects: [fx.counters({ ev: "attacker" }, 4)],
        },
      ],
    }),
  // —— Stadiums ——
  "Battle Cage": (d) => trainer(d, { statics: [{ s: "prevent", scope: scope.of("both", "bench"), what: "counters" }] }),
  "Area Zero Underdepths": (d) =>
    trainer(d, { statics: [{ s: "benchSize", side: "both", size: 8, scope: { side: "me", filter: { tags: ["tera"] } } }] }),
  "Risky Ruins": (d) =>
    trainer(d, {
      triggers: [
        {
          on: "benched",
          condition: cond.matches({ ev: "pokemon" }, { stage: ["basic"], not: { types: ["D"] } }),
          effects: [fx.counters({ ev: "pokemon" }, 2)],
        },
      ],
    }),
  "Festival Grounds": (d) =>
    trainer(d, { statics: [{ s: "noConditions", scope: scope.of("both", "any", { hasEnergy: true }) }] }),
  "Forest of Vitality": (d) =>
    trainer(d, { statics: [{ s: "evolveSameTurn", scope: scope.of("both", "any", { types: ["G"] }) }] }),
  "Nighttime Mine": (d) =>
    trainer(d, { statics: [{ s: "attackCost", scope: scope.of("both", "any", { tags: ["tera"] }), less: -1 }] }),
  "Team Rocket's Watchtower": (d) =>
    trainer(d, { statics: [{ s: "noAbilities", scope: scope.of("both", "any", { types: ["C"] }) }] }),
  "Academy at Night": (d) =>
    trainer(d, {
      stadiumAction: true,
      effects: [
        fx.chooseCards("hand", "c", msg("Choose a card to put on top of your deck"), { min: 1, max: 1 }),
        fx.move("c", "deckTop"),
      ],
      condition: cond.hasCards("hand", "me"),
    }),
  // —— Pokémon ——
  Munkidori: (d) =>
    abil(d, 0, {
      activated: {
        effects: [
          fx.choosePokemon(scope.mine({ damaged: true }), "from", msg("Choose your Pokémon to move damage counters from")),
          fx.choosePokemon(scope.theirs(), "to", msg("Choose your opponent's Pokémon")),
          {
            op: "chooseNumber",
            min: 1,
            max: amt.min(3, amt.counters(ref.v("from"))),
            store: "n",
            prompt: msg("How many damage counters?"),
          },
          { op: "moveCounters", from: ref.v("from"), to: ref.v("to"), n: amt.v("n") },
        ],
        condition: cond.and(cond.cmp(amt.energy(ref.self, { type: "D" }), ">", 0), cond.exists(scope.mine({ damaged: true }))),
      },
    }),
  Alakazam: (d) => atk(d, 0, [fx.counters(ref.defending, amt.mul(2, amt.cards("hand", "me")))]),
  "Raging Bolt ex": (d) => ({
    attacks: (d.attacks ?? []).map((a, j) =>
      j === 0
        ? { ...a, effects: [fx.moveAll("hand", "me", "discard"), fx.draw(6)] }
        : j === 1
          ? {
              ...a,
              effects: [
                {
                  op: "discardEnergyFrom",
                  scope: scope.mine(),
                  min: 0,
                  max: 60,
                  basic: true,
                  store: "n",
                  prompt: msg("Discard any amount of Basic Energy from your Pokémon"),
                },
                fx.setDamage(amt.mul(70, amt.v("n"))),
                fx.main(),
              ],
            }
          : a,
    ),
  }),
  "Wellspring Mask Ogerpon ex": (d) =>
    atk(d, 1, [
      fx.main(),
      fx.if(cond.cmp(amt.energy(ref.self), ">=", 3), [
        fx.may(msg("Shuffle 3 Energy attached to this Pokémon into your deck?"), [
          fx.discardEnergy(ref.self, 3, { to: "deck" }),
          fx.shuffle(),
          fx.choosePokemon(scope.oppBench(), "t", msg("Choose your opponent's Benched Pokémon")),
          fx.damage(ref.v("t"), 120),
        ]),
      ]),
    ]),
  "Iron Leaves ex": (d) =>
    abil(d, 0, {
      triggers: [
        {
          on: "playedToBench",
          may: true,
          effects: [
            fx.choosePokemon(scope.self(), "me", msg("Choose your Pokémon")),
            { op: "switch", side: "me", with: "me" },
            {
              op: "gatherEnergy",
              from: scope.mine(),
              to: ref.self,
              min: 0,
              max: 60,
              prompt: msg("Move any amount of Energy from your other Pokémon to this Pokémon"),
            },
          ],
        },
      ],
    }),
  Drakloak: (d) =>
    abil(d, 0, {
      activated: {
        effects: [
          fx.chooseCards("deck", "c", msg("Choose a card to put into your hand"), { top: 2, min: 1, max: 1 }),
          fx.move("c", "hand"),
          fx.mill("me", 1, "deckBottom"),
        ],
        condition: cond.deck(),
      },
    }),
  Duskull: (d) =>
    atk(d, 0, [
      fx.chooseCards("discard", "d", DISCARD_PILE(), { filter: { names: ["Duskull"] }, max: amt.min(3, amt.benchSpace()) }),
      fx.move("d", "bench"),
    ]),
  "Dudunsparce ex": (d) => atk(d, 0, [fx.setDamage(amt.mul(60, amt.pokemon(scope.theirs({ tags: ["ex"] })))), fx.main()]),
  "N's Zoroark ex": (d) =>
    atk(d, 0, [
      {
        op: "useAttackOf",
        from: scope.myBench({ nameIncludes: "N's" }),
        prompt: msg("Choose an attack of your Benched N's Pokémon"),
      },
    ]),
  "N's Purrloin": (d) =>
    atk(d, 0, [
      fx.main(),
      { op: "revealHand", side: "opp" },
      fx.chooseCards("hand", "c", msg("Choose a card to put on the bottom of your opponent's deck"), {
        side: "opp",
        min: 1,
        max: 1,
      }),
      fx.move("c", "deckBottom"),
    ]),
  "Pecharunt ex": (d) =>
    abil(d, 0, {
      activated: {
        once: "turnByName",
        effects: [
          fx.choosePokemon(
            scope.myBench({ types: ["D"], not: { names: ["Pecharunt ex"] } }),
            "t",
            msg("Choose your Benched {D} Pokémon"),
          ),
          { op: "switch", side: "me", with: "t" },
          fx.condition(ref.myActive, "poisoned"),
        ],
        condition: cond.exists(scope.myBench({ types: ["D"], not: { names: ["Pecharunt ex"] } })),
      },
    }),
  Tatsugiri: (d) =>
    abil(d, 0, {
      activated: {
        where: "active",
        effects: [
          fx.chooseCards("deck", "c", SEARCH(), {
            top: 6,
            filter: { category: ["trainer"], trainer: ["supporter"] },
            max: 1,
            reveal: true,
          }),
          fx.move("c", "hand"),
          fx.shuffle(),
        ],
        condition: cond.deck(),
      },
    }),
  Slowking: (d) =>
    atk(d, 0, [
      { op: "mill", side: "me", n: 1, store: "m" },
      {
        op: "useAttackOf",
        from: { cards: "m" },
        filter: { category: ["pokemon"], noTags: ["ruleBox"] },
        prompt: msg("Choose an attack to use"),
      },
    ]),
  Metagross: (d) =>
    atk(d, 1, [
      fx.if(cond.cmp(amt.energy(ref.self, { type: "M" }), ">=", 3), [
        fx.may(msg("Discard 3 {M} Energy from this Pokémon for 150 more damage?"), [
          fx.discardEnergy(ref.self, 3, { types: ["M"] }),
          fx.bonus(150),
        ]),
      ]),
      fx.main(),
    ]),
  Zeraora: (d) =>
    atk(d, 1, [
      fx.discardEnergy(ref.self, "all"),
      fx.choosePokemon(scope.oppBench({ tags: ["ex"] }), "t", msg("Choose your opponent's Benched Pokémon ex")),
      fx.damage(ref.v("t"), 210),
    ]),
};

registerScripts(SCRIPTS);
