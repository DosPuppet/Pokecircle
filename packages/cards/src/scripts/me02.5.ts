/**
 * Hand scripts of me02.5 (PLAN-B B7), including the earlier cards reprinted in the set. Each script follows the printed
 * text; the details are in docs/extensions/me02.5.md.
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
const basicOf = (t: "P" | "M" | "D"): CardFilter => ({ ...BASIC_ENERGY, energyTypes: [t] });
const TR = "Team Rocket's";
const N_SIX = ["N's Darmanitan", "N's Zoroark ex", "N's Vanilluxe", "N's Klinklang", "N's Reshiram", "N's Zekrom"];

const SCRIPTS: Record<string, CardScript> = {
  // Erasure Ball: "You may discard up to 2 Energy from your Benched Pokémon. This attack does 60 more damage for each card
  // you discarded in this way." Power Saver: "This Pokémon can't attack unless you have 4 or more Team Rocket's Pokémon
  // in play."
  "Team Rocket's Mewtwo ex@sv10-081": (d) => ({
    ...atk(d, 0, [
      {
        op: "discardEnergyFrom",
        scope: scope.myBench(),
        min: 0,
        max: 2,
        store: "d",
        prompt: msg("You may discard up to 2 Energy from your Benched Pokémon"),
      },
      fx.bonus(amt.mul(60, amt.v("d"))),
      fx.main(),
    ]),
    ...abil(d, 0, {
      statics: [
        {
          s: "cantAttack",
          scope: scope.self(),
          cond: cond.cmp(amt.pokemon(scope.mine({ nameIncludes: TR })), "<", 4),
        },
      ],
    }),
  }),
  // Metronome: "Choose 1 of your opponent's Active Pokémon's attacks and use it as this attack."
  "Clefable@sv06-079": (d) =>
    atk(d, 0, [
      { op: "useAttackOf", from: scope.oppActive(), prompt: msg("Choose an attack of your opponent's Active Pokémon") },
    ]),
  // "Pokémon Tools attached to each Pokémon (both yours and your opponent's) have no effect."
  "Jamming Tower@sv06-153": (d) => trainer(d, { statics: [{ s: "noTools" }] }),
  // Sudden Scorching: "Your opponent discards a card from their hand. If this Pokémon evolved from Salandit during this
  // turn, your opponent discards 2 more cards."
  "Salazzle@sv07-024": (d) => {
    const n = amt.add(1, amt.mul(2, amt.v("evolved")));
    return atk(d, 0, [
      fx.set("evolved", 0),
      fx.if({ c: "didThisTurn", kind: "evolved", ref: ref.self }, [fx.set("evolved", 1)]),
      fx.chooseCards("hand", "od", msg("Choose cards to discard from your hand"), {
        side: "opp",
        chooser: "opp",
        min: amt.min(amt.cards("hand", "opp"), n),
        max: n,
      }),
      fx.move("od", "discard"),
    ]);
  },
  // Wonder Kiss: "When your opponent's Active Pokémon is Knocked Out, flip a coin. If heads, take 1 more Prize card. The
  // effect of Wonder Kiss doesn't stack."
  "Togekiss@sv08-072": (d) =>
    abil(d, 0, { statics: [{ s: "prizes", scope: scope.oppActive(), delta: 1, flip: true, noStack: "Wonder Kiss" }] }),
  // Prism Charge: "Search your deck for up to 3 Basic Energy cards of different types and attach them to your Tera
  // Pokémon in any way you like. Then, shuffle your deck."
  "Terapagos@sv08-161": (d) =>
    atk(d, 0, [
      fx.chooseCards("deck", "e", SEARCH(), { filter: BASIC_ENERGY, min: 0, max: 3, distinctNames: true }),
      fx.attach("e", scope.mine({ tags: ["tera"] })),
      fx.shuffle(),
    ]),
  // Gemstone Mimicry: "Choose 1 of your opponent's Active Tera Pokémon's attacks and use it as this attack."
  "Team Rocket's Mimikyu@sv10-087": (d) =>
    atk(d, 0, [
      {
        op: "useAttackOf",
        from: scope.of("opp", "active", { tags: ["tera"] }),
        prompt: msg("Choose an attack of your opponent's Active Pokémon"),
      },
    ]),
  // Punk Up: "When you play this Pokémon from your hand to evolve 1 of your Pokémon during your turn, you may search your
  // deck for up to 5 Basic {D} Energy cards and attach them to your Marnie's Pokémon in any way you like."
  "Marnie's Grimmsnarl ex@sv10-136": (d) =>
    abil(d, 0, {
      triggers: [
        {
          on: "evolved",
          may: true,
          condition: cond.deck(),
          effects: [
            fx.chooseCards("deck", "e", SEARCH(), { filter: basicOf("D"), min: 0, max: 5 }),
            fx.attach("e", scope.mine({ nameIncludes: "Marnie's" })),
            fx.shuffle(),
          ],
        },
      ],
    }),
  // X-Boot: "Once during your turn, you may search your deck for a Basic {P} Energy card, a Basic {M} Energy card, or 1
  // of each and attach them to your {P} Pokémon and {M} Pokémon in any way you like."
  "Steven's Metagross ex@sv10-145": (d) =>
    abil(d, 0, {
      activated: {
        condition: cond.deck(),
        effects: [
          fx.chooseCards("deck", "p", SEARCH(), { filter: basicOf("P"), min: 0, max: 1 }),
          fx.attach("p", scope.mine({ types: ["P"] })),
          fx.chooseCards("deck", "m", SEARCH(), { filter: basicOf("M"), min: 0, max: 1 }),
          fx.attach("m", scope.mine({ types: ["M"] })),
          fx.shuffle(),
        ],
      },
    }),
  // "Flip a coin. If heads, search your deck for an Evolution Team Rocket's Pokémon, … If tails, … a Basic Team Rocket's
  // Pokémon, reveal it, and put it into your hand. Then, shuffle your deck."
  "Team Rocket's Great Ball@sv10-175": (d) => {
    const find = (stage: CardFilter["stage"]): Effect[] => [
      fx.chooseCards("deck", "found", SEARCH(), {
        filter: { category: ["pokemon"], nameIncludes: TR, stage },
        min: 0,
        max: 1,
        reveal: true,
      }),
      fx.move("found", "hand"),
    ];
    return trainer(d, {
      condition: cond.deck(),
      effects: [fx.flip(), fx.if(cond.heads(), find(["stage1", "stage2"]), find(["basic"])), fx.shuffle()],
    });
  },
  // Overflowing Wishes: "For each of your Benched Pokémon, search your deck for a Basic {P} Energy card and attach it to
  // that Pokémon. Then, shuffle your deck."
  "Mega Gardevoir ex@me01-060": (d) =>
    atk(d, 0, [
      fx.choosePokemon(scope.myBench(), "b", msg("Your Benched Pokémon"), {
        min: amt.pokemon(scope.myBench()),
        max: amt.pokemon(scope.myBench()),
      }),
      {
        op: "forEach",
        key: "b",
        as: "p",
        effects: [
          fx.chooseCards("deck", "e", SEARCH(), { filter: basicOf("P"), min: 0, max: 1 }),
          {
            op: "attach",
            cards: "e",
            to: scope.myBench(),
            prompt: msg("Choose the Pokémon to attach the card to"),
            target: ref.v("p"),
          },
        ],
      },
      fx.shuffle(),
    ]),
  // "You can use this card only if your opponent has 2 or fewer Prize cards remaining. Choose 1 of your Pokémon in play.
  // During your opponent's next turn, prevent all damage from and effects of attacks done to that Pokémon by your
  // opponent's Pokémon ex."
  "Acerola's Mischief@me01-113": (d) =>
    trainer(d, {
      condition: cond.cmp(amt.prizesLeft("opp"), "<=", 2),
      effects: [
        fx.choosePokemon(scope.mine(), "t", msg("Choose 1 of your Pokémon")),
        fx.timed("opponentsNextTurn", { s: "prevent", scope: scope.mine(), what: "all", from: { tags: ["ex"] } }, ref.v("t")),
      ],
    }),
  // "Once during each player's turn, that player may discard an Energy card from their hand in order to draw cards until
  // they have as many cards in their hand as they have {P} Pokémon in play."
  "Mystery Garden@me01-122": (d) =>
    trainer(d, {
      stadiumAction: true,
      condition: cond.hasCards("hand", "me", { category: ["energy"] }),
      effects: [
        fx.chooseCards("hand", "cost", msg("Choose an Energy card to discard"), {
          filter: { category: ["energy"] },
          min: 1,
          max: 1,
        }),
        fx.move("cost", "discard"),
        fx.drawUntil(amt.pokemon(scope.mine({ types: ["P"] }))),
      ],
    }),
  // Shadowy Concealment: "If 1 of your {D} Pokémon is Knocked Out by damage from an attack from your opponent's Pokémon
  // ex, that player takes 1 fewer Prize card. The effect of Shadowy Concealment doesn't stack."
  "Mega Gengar ex@me02-056": (d) =>
    abil(d, 0, {
      statics: [
        {
          s: "prizes",
          scope: scope.mine({ types: ["D"] }),
          delta: -1,
          byAttack: true,
          by: { tags: ["ex"] },
          noStack: "Shadowy Concealment",
        },
      ],
    }),
  // Snow Coating: "Double the number of damage counters on each of your opponent's Pokémon."
  "N's Vanilluxe@me02.5-051": (d) =>
    atk(d, 0, [
      fx.choosePokemon(scope.theirs(), "t", msg("Choose your opponent's Pokémon"), {
        min: amt.pokemon(scope.theirs()),
        max: amt.pokemon(scope.theirs()),
      }),
      { op: "forEach", key: "t", as: "p", effects: [fx.counters(ref.v("p"), amt.counters(ref.v("p")))] },
    ]),
  // Kaleidowaltz: "Flip 3 coins. For each heads, search your deck for up to 2 Basic Energy cards and attach them to your
  // Pokémon in any way you like. Then, shuffle your deck."
  "Mega Audino ex@me02.5-172": (d) =>
    atk(d, 0, [
      fx.flip(3),
      fx.repeat(amt.heads(), [
        fx.chooseCards("deck", "e", SEARCH(), { filter: BASIC_ENERGY, min: 0, max: 2 }),
        fx.attach("e", scope.mine()),
      ]),
      fx.shuffle(),
    ]),
  // "You can use this card only if you have N's Darmanitan, N's Zoroark ex, N's Vanilluxe, N's Klinklang, N's Reshiram,
  // and N's Zekrom in play. During this turn, if your opponent's Active Pokémon is Knocked Out by damage from an attack
  // used by your N's Pokémon, take 3 more Prize cards."
  "Anthea & Concordia@me02.5-182": (d) =>
    trainer(d, {
      condition: cond.and(...N_SIX.map((n) => cond.exists(scope.mine({ names: [n] })))),
      effects: [
        fx.timed("thisTurn", { s: "prizes", scope: scope.oppActive(), delta: 3, byAttack: true, by: { nameIncludes: "N's" } }),
      ],
    }),
  // "If the Team Rocket's Pokémon this card is attached to is in the Active Spot and is damaged by an attack from your
  // opponent's Pokémon (even if this Team Rocket's Pokémon is Knocked Out), the Attacking Pokémon is now Asleep."
  "Team Rocket's Hypnotizer@me02.5-206": (d) =>
    trainer(d, {
      triggers: [
        {
          on: "damagedByAttack",
          byOpponentAttack: true,
          condition: cond.and({ c: "var", key: "ev:wasActive" }, cond.matches(ref.self, { nameIncludes: TR })),
          effects: [fx.condition({ ev: "attacker" }, "asleep")],
        },
      ],
    }),
  // "Look at the top 6 cards of your deck and attach a Basic Energy card you find there to 1 of your Pokémon. Shuffle the
  // other cards back into your deck."
  "Waitress@me02.5-215": (d) =>
    trainer(d, {
      condition: cond.deck(),
      effects: [
        fx.chooseCards("deck", "e", msg("Choose a Basic Energy card"), { top: 6, filter: BASIC_ENERGY, min: 0, max: 1 }),
        fx.attach("e", scope.mine()),
        fx.shuffle(),
      ],
    }),
};

registerScripts(SCRIPTS);
