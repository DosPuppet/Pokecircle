/**
 * Hand scripts of sv09 and sv08.5 (Journey Together, Prismatic Evolutions; PLAN-B B11), including the earlier cards
 * reprinted there. Each script follows the printed text; the details are in docs/extensions/sv09-sv08.5.md.
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
const all = (sc: ReturnType<typeof scope.theirs>, key: string): Effect =>
  fx.choosePokemon(sc, key, msg("Choose your opponent's Pokémon"), { min: amt.pokemon(sc), max: amt.pokemon(sc) });

const SCRIPTS: Record<string, CardScript> = {
  // Hero's Spirit: "Put this Pokémon into play only with the effect of Palafin's Zero to Hero Ability."
  "Palafin ex@svp-126": (d) => abil(d, 0, { onlyByEffect: true, statics: [] }),
  // Azure Seas: "Damage from attacks used by this Pokémon isn't affected by any effects on your opponent's Active Pokémon."
  "Walking Wake ex@svp-127": (d) => abil(d, 0, { statics: [{ s: "ignoreEffects", scope: scope.self() }] }),
  // Twin Shotels: "This attack does 50 damage to 2 of your opponent's Pokémon. This attack's damage isn't affected by
  // Weakness or Resistance, or by any effects on those Pokémon."
  "Iron Crown ex@svp-146": (d) =>
    atk(d, 0, [
      fx.choosePokemon(scope.theirs(), "t", msg("Choose 2 of your opponent's Pokémon"), { min: 2, max: 2 }),
      { op: "damage", to: ref.v("t"), amount: 50, noWR: true, ignoreEffects: true },
    ]),
  // Leaflet Blessings: "Attach a Basic {G} Energy card from your hand to 1 of your Benched Pokémon. If you do, heal all
  // damage from that Pokémon."
  "Leafeon@sv06-011": (d) =>
    atk(d, 0, [
      fx.chooseCards("hand", "e", msg("Choose an Energy card from your hand"), {
        filter: { ...BASIC_ENERGY, energyTypes: ["G"] },
        min: 1,
        max: 1,
      }),
      fx.if(cond.and(cond.cmp(amt.count("e"), ">", 0), cond.exists(scope.myBench())), [
        fx.choosePokemon(scope.myBench(), "to", msg("Choose 1 of your Benched Pokémon")),
        {
          op: "attach",
          cards: "e",
          to: scope.myBench(),
          prompt: msg("Choose the Pokémon to attach the card to"),
          target: ref.v("to"),
        },
        fx.heal(ref.v("to"), "all"),
      ]),
    ]),
  // Rainbow DNA: "This Pokémon can evolve into any Pokémon ex that evolves from Eevee if you play it from your hand onto
  // this Pokémon."
  "Eevee ex@sv08.5-075": (d) =>
    abil(d, 0, {
      statics: [{ s: "evolvesAs", scope: scope.self(), name: "Eevee", filter: { category: ["pokemon"], tags: ["ex"] } }],
    }),
  // Amazez: "Devolve each of your opponent's evolved Pokémon by shuffling the highest Stage Evolution card on it into your
  // opponent's deck."
  "Espeon ex@sv08.5-034": (d) =>
    atk(d, 1, [
      all(scope.theirs({ stage: ["stage1", "stage2"] }), "t"),
      { op: "forEach", key: "t", as: "p", effects: [{ op: "devolve", target: ref.v("p"), to: "deck" }] },
      fx.shuffle("opp"),
    ]),
  // Onyx: "Discard all Energy from this Pokémon, and take a Prize card."
  "Umbreon ex@sv08.5-060": (d) => atk(d, 1, [fx.discardEnergy(ref.self, "all"), { op: "takePrizes", n: 1 }]),
  // Seasoned Skill: "Blood Moon used by this Pokémon costs {C} less for each Prize card your opponent has taken."
  "Bloodmoon Ursaluna ex@sv06-141": (d) =>
    abil(d, 0, { statics: [{ s: "attackCost", scope: scope.self(), less: amt.prizesTaken("opp"), attack: "Blood Moon" }] }),
  // Inviting Wink: "… you may have your opponent reveal their hand and you put any number of Basic Pokémon you find there
  // onto their Bench."
  "Lillie's Ribombee@sv09-067": (d) =>
    abil(d, 0, {
      triggers: [
        {
          on: "evolved",
          may: true,
          effects: [
            { op: "revealHand", side: "opp" },
            fx.chooseCards("hand", "b", msg("Choose Basic Pokémon to put onto your opponent's Bench"), {
              side: "opp",
              filter: { category: ["pokemon"], stage: ["basic"] },
              min: 0,
              max: amt.benchSpace("opp"),
            }),
            fx.move("b", "bench"),
          ],
        },
      ],
    }),
  // Wafting Heal: "… you may heal all damage from your Active {G} Pokémon. If you healed any damage in this way, discard
  // all Energy from that Pokémon."
  "Whimsicott@sv05-015": (d) =>
    abil(d, 0, {
      triggers: [
        {
          on: "evolved",
          may: true,
          condition: cond.and(cond.matches(ref.myActive, { types: ["G"] }), cond.cmp(amt.counters(ref.myActive), ">", 0)),
          effects: [fx.heal(ref.myActive, "all"), fx.discardEnergy(ref.myActive, "all")],
        },
      ],
    }),
  // Land Collapse: "Discard the top card of your opponent's deck. If you played an Ancient Supporter card from your hand
  // during this turn, discard 3 more cards in this way."
  "Great Tusk@sv05-097": (d) =>
    atk(d, 0, [
      fx.mill("opp", 1),
      fx.if(cond.cmp({ k: "turnLog", event: "supporterPlayed", side: "me", filter: { tags: ["ancient"] } }, ">", 0), [
        fx.mill("opp", 3),
      ]),
    ]),
  // "Switch in 1 of your opponent's Benched Pokémon to the Active Spot. If you do, switch your Active Pokémon with 1 of your
  // Benched Pokémon."
  "Prime Catcher@sv05-157": (d) =>
    trainer(d, {
      condition: cond.exists(scope.oppBench()),
      effects: [fx.switch("opp"), fx.if(cond.exists(scope.myBench()), [fx.switch("me")])],
    }),
  // "The Retreat Cost of the Pokémon this card is attached to is {C} less. If that Pokémon's remaining HP is 30 or less,
  // it has no Retreat Cost."
  "Rescue Board@sv05-159": (d) =>
    trainer(d, {
      statics: [
        { s: "retreat", scope: scope.self(), delta: -1 },
        { s: "retreat", scope: scope.self(), set: 0, cond: cond.cmp({ k: "remainingHp", on: ref.self }, "<=", 30) },
      ],
    }),
  // Dynamic Blaze: "If your opponent's Active Pokémon is an Evolution Pokémon, this attack does 140 more damage, and
  // discard all Energy from this Pokémon."
  "Hearthflame Mask Ogerpon ex@sv06-040": (d) => {
    const evolved = cond.matches(ref.defending, { stage: ["stage1", "stage2"] });
    return atk(d, 1, [fx.if(evolved, [fx.bonus(140)]), fx.main(), fx.if(evolved, [fx.discardEnergy(ref.self, "all")])]);
  },
  // Adrena-Pheromone: "If this Pokémon has any {D} Energy attached and is damaged by an attack, flip a coin. If heads,
  // prevent that damage."
  "Fezandipiti@sv06-096": (d) =>
    abil(d, 0, {
      statics: [
        {
          s: "prevent",
          scope: scope.self(),
          what: "damage",
          flip: true,
          cond: cond.cmp(amt.energy(ref.self, { type: "D" }), ">", 0),
        },
      ],
    }),
  // "Choose a Pokémon ex in your discard pile that has "Ogerpon" in its name, and switch it with 1 of your Pokémon ex in
  // play that has "Ogerpon" in its name. Any attached cards, damage counters, … remain on the new Pokémon."
  "Ogre's Mask@sv06-159": (d) => {
    const ogerpon = { tags: ["ex" as const], nameIncludes: "Ogerpon" };
    return trainer(d, {
      condition: cond.and(
        cond.hasCards("discard", "me", { category: ["pokemon"], ...ogerpon }),
        cond.exists(scope.mine(ogerpon)),
      ),
      effects: [
        fx.chooseCards("discard", "new", msg("Choose a Pokémon ex in your discard pile"), {
          filter: { category: ["pokemon"], ...ogerpon },
          min: 1,
          max: 1,
        }),
        fx.choosePokemon(scope.mine(ogerpon), "old", msg("Choose 1 of your Pokémon in play")),
        { op: "replaceCard", target: ref.v("old"), card: "new" },
      ],
    });
  },
  // "Put 1 of your Pokémon and all attached cards into your hand."
  "Scoop Up Cyclone@sv06-162": (d) =>
    trainer(d, {
      effects: [fx.choosePokemon(scope.mine(), "t", msg("Choose 1 of your Pokémon")), fx.pokemonTo(ref.v("t"), "hand")],
    }),
  // "Shuffle your hand into your deck. Then, draw 4 cards. If your opponent has 3 or fewer Prize cards remaining, draw 8
  // cards instead."
  "Lacey@sv07-139": (d) =>
    trainer(d, {
      effects: [
        fx.moveAll("hand", "me", "deck"),
        fx.shuffle(),
        fx.if(cond.cmp(amt.prizesLeft("opp"), "<=", 3), [fx.draw(8)], [fx.draw(4)]),
      ],
    }),
  // "When the Tera Pokémon this card is attached to uses an attack, that attack costs 1 Energy less. (The Energy can be of
  // any type.)"
  "Sparkling Crystal@sv07-142": (d) =>
    trainer(d, {
      statics: [{ s: "attackCost", scope: { ...scope.self(), filter: { tags: ["tera"] } }, less: 1, anyType: true }],
    }),
  // Angelite: "Choose 2 of your opponent's Benched Pokémon. Shuffle those Pokémon and all attached cards into your
  // opponent's deck. If 1 of your Pokémon used Angelite during your last turn, this attack can't be used."
  "Sylveon ex@sv08-086": (d) => ({
    attacks: (d.attacks ?? []).map((a, j) =>
      j === 1
        ? {
            ...a,
            effects: [
              fx.choosePokemon(scope.oppBench(), "t", msg("Choose 2 of your opponent's Benched Pokémon"), { min: 2, max: 2 }),
              fx.pokemonTo(ref.v("t"), "deck"),
              fx.shuffle("opp"),
            ],
            condition: cond.not({ c: "didLastTurn", kind: "attacked", ref: ref.all(scope.mine()), key: "Angelite" }),
          }
        : a,
    ),
  }),
  // "Look at the top 7 cards of your deck. You may reveal a Pokémon and a Trainer card you find there and put them into
  // your hand. Shuffle the other cards back into your deck."
  "Drayton@sv08-174": (d) =>
    trainer(d, {
      condition: cond.deck(),
      effects: [
        fx.chooseCards("deck", "p", msg("You may reveal a Pokémon"), {
          top: 7,
          filter: { category: ["pokemon"] },
          min: 0,
          max: 1,
          reveal: true,
        }),
        fx.move("p", "hand"),
        fx.chooseCards("deck", "t", msg("You may reveal a Trainer card"), {
          top: amt.sub(7, amt.count("p")),
          filter: { category: ["trainer"] },
          min: 0,
          max: 1,
          reveal: true,
        }),
        fx.move("t", "hand"),
        fx.shuffle(),
      ],
    }),
  // "Tell your opponent the name of a Pokémon in your hand … Your opponent guesses that Pokémon's HP … If your opponent
  // guessed right, they draw 4 cards. If they guessed wrong, you draw 4 cards."
  "Tyme@sv08-190": (d) =>
    trainer(d, {
      condition: cond.hasCards("hand", "me", { category: ["pokemon"] }),
      effects: [
        fx.chooseCards("hand", "p", msg("Choose a Pokémon in your hand"), { filter: { category: ["pokemon"] }, min: 1, max: 1 }),
        {
          op: "may",
          chooser: "opp",
          prompt: msg("Is that Pokémon's HP 100 or more? (Yes or No is your guess.)"),
          then: [fx.set("guess", 1)],
          else: [fx.set("guess", 0)],
        },
        // HP are multiples of 10: "less than 100" is "90 or less".
        fx.chooseCards("hand", "low", msg("A Pokémon in your hand"), {
          among: "p",
          filter: { maxHp: 90 },
          min: 0,
          max: 1,
          random: true,
        }),
        fx.if(
          cond.or(
            cond.and({ c: "var", key: "guess" }, cond.cmp(amt.count("low"), "==", 0)),
            cond.and(cond.not({ c: "var", key: "guess" }), cond.cmp(amt.count("low"), "==", 1)),
          ),
          [fx.draw(4, "opp")],
          [fx.draw(4)],
        ),
      ],
    }),
  // Euclase: "Knock Out 1 of your opponent's Pokémon that has exactly 6 damage counters on it."
  "Glaceon ex@sv08.5-026": (d) =>
    atk(d, 1, [
      fx.if(cond.exists(scope.theirs({ counters: 6 })), [
        fx.choosePokemon(scope.theirs({ counters: 6 }), "t", msg("Choose 1 of your opponent's Pokémon")),
        { op: "knockOut", target: ref.v("t") },
      ]),
    ]),
  // Flashing Spear: "You may discard up to 2 Basic Energy from your Benched Pokémon. This attack does 90 more damage for
  // each card you discarded in this way."
  "Jolteon ex@sv08.5-030": (d) =>
    atk(d, 0, [
      {
        op: "discardEnergyFrom",
        scope: scope.myBench(),
        min: 0,
        max: 2,
        basic: true,
        store: "d",
        prompt: msg("You may discard up to 2 Basic Energy from your Benched Pokémon"),
      },
      fx.bonus(amt.mul(90, amt.v("d"))),
      fx.main(),
    ]),
  // "Draw 4 cards. At the end of this turn, if you have 5 or more cards in your hand, discard your hand."
  "Amarys@sv08.5-093": (d) =>
    trainer(d, {
      condition: cond.deck(),
      effects: [
        fx.draw(4),
        fx.timed(
          "thisTurn",
          {
            s: "endOfTurn",
            scope: scope.myActive(),
            effects: [fx.if(cond.cmp(amt.cards("hand", "me"), ">=", 5), [fx.moveAll("hand", "me", "discard")])],
          },
          ref.myActive,
        ),
      ],
    }),
  // "Discard your hand and search your deck for a Pokémon, a Supporter card, and a Basic Energy card, reveal them, and put
  // them into your hand. Then, shuffle your deck."
  "Larry's Skill@sv08.5-115": (d) =>
    trainer(d, {
      effects: [
        fx.moveAll("hand", "me", "discard"),
        fx.chooseCards("deck", "p", SEARCH(), { filter: { category: ["pokemon"] }, min: 0, max: 1, reveal: true }),
        fx.chooseCards("deck", "s", SEARCH(), {
          filter: { category: ["trainer"], trainer: ["supporter"] },
          min: 0,
          max: 1,
          reveal: true,
        }),
        fx.chooseCards("deck", "e", SEARCH(), { filter: BASIC_ENERGY, min: 0, max: 1, reveal: true }),
        fx.move("p", "hand"),
        fx.move("s", "hand"),
        fx.move("e", "hand"),
        fx.shuffle(),
      ],
    }),
  // Victory Symbol: "If you use this attack when you have exactly 1 Prize card remaining, you win this game."
  "N's Sigilyph@sv09-064": (d) => atk(d, 1, [fx.if(cond.cmp(amt.prizesLeft("me"), "==", 1), [{ op: "winGame" }])]),
  // "Attacks used by the Hop's Pokémon this card is attached to cost {C} less and do 30 more damage to your opponent's
  // Active Pokémon (before applying Weakness and Resistance)."
  "Hop's Choice Band@sv09-148": (d) => {
    const holder = { ...scope.self(), filter: { nameIncludes: "Hop's" } };
    return trainer(d, {
      statics: [
        { s: "attackCost", scope: holder, less: 1 },
        { s: "dealt", scope: holder, add: 30, activeOnly: true },
      ],
    });
  },
  // "If the Lillie's Pokémon this card is attached to is Knocked Out by damage from an attack from your opponent's Pokémon,
  // that player takes 1 fewer Prize card."
  "Lillie's Pearl@sv09-151": (d) =>
    trainer(d, {
      statics: [{ s: "prizes", scope: { ...scope.self(), filter: { nameIncludes: "Lillie's" } }, delta: -1, byAttack: true }],
    }),
  // "Count your Prize cards, shuffle them, and put them on the bottom of your deck. Then, take that many cards from the top
  // of your deck and put them face down as your Prize cards."
  "Redeemable Ticket@sv09-156": (d) =>
    trainer(d, {
      effects: [
        fx.set("n", amt.prizesLeft("me")),
        fx.moveAll("prizes", "me", "deckBottom"),
        fx.chooseCards("deck", "top", msg("The top cards of your deck"), {
          top: amt.v("n"),
          min: 0,
          max: amt.v("n"),
          random: true,
        }),
        fx.move("top", "prizes"),
      ],
    }),
  // "Discard a Pokémon Tool and a Special Energy from 1 of your opponent's Pokémon."
  "Ruffian@sv09-157": (d) => {
    const target = scope.of("opp", "any", { hasTool: true });
    const special = scope.of("opp", "any", { specialEnergy: true });
    return trainer(d, {
      condition: cond.or(cond.exists(target), cond.exists(special)),
      effects: [
        fx.choosePokemon(scope.theirs(), "t", msg("Choose 1 of your opponent's Pokémon")),
        fx.discardTools(ref.v("t")),
        fx.discardEnergy(ref.v("t"), 1, { special: true }),
      ],
    });
  },
};

registerScripts(SCRIPTS);
