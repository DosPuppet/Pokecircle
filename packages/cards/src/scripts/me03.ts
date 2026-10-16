/**
 * Hand scripts of me03 (PLAN-B B6): the texts no template covers. Each script follows the printed text; the details are
 * in docs/extensions/me04-me03.md.
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

const BASIC_ENERGY: CardFilter = { category: ["energy"], basicEnergy: true };
const CONDITIONS = [
  ["asleep", msg("Asleep")],
  ["burned", msg("Burned")],
  ["confused", msg("Confused")],
  ["paralyzed", msg("Paralyzed")],
  ["poisoned", msg("Poisoned")],
] as const;

const SCRIPTS: Record<string, CardScript> = {
  // Weaponized Swords: "Reveal any number of Honedge, Doublade, and Aegislash from your hand, and this attack does 60
  // damage for each card you revealed in this way."
  "Doublade@me03-057": (d) =>
    atk(d, 0, [
      fx.chooseCards("hand", "rev", msg("Reveal any number of these cards from your hand"), {
        filter: { names: ["Honedge", "Doublade", "Aegislash"] },
        min: 0,
        max: 60,
        reveal: true,
      }),
      fx.setDamage(amt.mul(60, amt.count("rev"))),
      fx.main(),
    ]),
  // Nullifying Zero: "For each of your opponent's Pokémon, flip a coin. If heads, this attack does 150 damage to that
  // Pokémon."
  "Mega Zygarde ex@me03-047": (d) =>
    atk(d, 1, [
      fx.choosePokemon(scope.theirs(), "t", msg("Choose your opponent's Pokémon"), {
        min: amt.pokemon(scope.theirs()),
        max: amt.pokemon(scope.theirs()),
      }),
      { op: "forEach", key: "t", as: "p", effects: [fx.flip(), fx.if(cond.heads(), [fx.damage(ref.v("p"), 150)])] },
    ]),
  // Grand Wing: "Once during your turn, you may use this Ability. Your opponent shuffles their hand and puts it on the
  // bottom of their deck. If they put any cards on the bottom of their deck in this way, they draw 4 cards."
  "Vivillon@me03-009": (d) =>
    abil(d, 0, {
      activated: {
        effects: [
          { op: "moveAll", zone: "hand", side: "opp", to: "deckBottom", store: "n" },
          fx.if(cond.cmp(amt.v("n"), ">", 0), [fx.draw(4, "opp")]),
        ],
      },
    }),
  // Tail Generator: "Choose Basic {L} Energy cards from your discard pile up to the amount of Energy attached to all of
  // your opponent's Pokémon and attach them to your {L} Pokémon in any way you like."
  "Dedenne@me03-029": (d) =>
    atk(d, 0, [
      fx.chooseCards("discard", "e", msg("Choose Basic Lightning Energy cards from your discard pile"), {
        filter: { ...BASIC_ENERGY, energyTypes: ["L"] },
        min: 0,
        max: amt.energy(ref.all(scope.theirs()), { units: true }),
      }),
      fx.attach("e", scope.mine({ types: ["L"] })),
    ]),
  // Infinite Shadow: "If this Pokémon is Knocked Out by damage from an attack from your opponent's Pokémon, put it into
  // your hand instead of the discard pile. (Discard all attached cards.)"
  "Gengar@me03-050": (d) =>
    abil(d, 0, { triggers: [{ on: "knockedOut", byOpponentAttack: true, effects: [fx.move("ev:cards", "hand")] }] }),
  // Sonic Ripper: "Shuffle all Energy attached to this Pokémon into your deck, and this attack does 220 damage to 1 of your
  // opponent's Pokémon."
  "Mega Skarmory ex@me03-055": (d) =>
    atk(d, 0, [
      fx.discardEnergy(ref.self, "all", { to: "deck" }),
      fx.shuffle(),
      fx.choosePokemon(scope.theirs(), "t", msg("Choose 1 of your opponent's Pokémon")),
      fx.damage(ref.v("t"), 220),
    ]),
  // Gormandizer: "Flip a coin until you get tails. Search your deck for an amount of Basic Energy up to the number of
  // heads and attach it to this Pokémon. Then, shuffle your deck."
  "Snorlax@me03-063": (d) =>
    atk(d, 0, [
      fx.flipUntilTails(),
      fx.if(cond.cmp(amt.heads(), ">", 0), [
        fx.chooseCards("deck", "e", msg("Choose cards from your deck"), { filter: BASIC_ENERGY, min: 0, max: amt.heads() }),
        fx.attach("e", scope.self()),
        fx.shuffle(),
      ]),
    ]),
  // Chirp: "Search your deck for up to 2 Pokémon with {F} Resistance, reveal them, and put them into your hand. Then,
  // shuffle your deck."
  "Fletchling@me03-066": (d) =>
    atk(d, 0, [
      fx.chooseCards("deck", "found", msg("Choose cards from your deck"), {
        filter: { category: ["pokemon"], resistance: "F" },
        min: 0,
        max: 2,
        reveal: true,
      }),
      fx.move("found", "hand"),
      fx.shuffle(),
    ]),
  // Hand Trim: "Discard random cards from your opponent's hand until they have 5 cards in their hand."
  "Furfrou@me03-067": (d) =>
    atk(d, 0, [
      fx.chooseCards("hand", "rnd", msg("A random card"), {
        side: "opp",
        min: 0,
        max: { k: "max", of: [0, amt.sub(amt.cards("hand", "opp"), 5)] },
        random: true,
        reveal: true,
      }),
      fx.move("rnd", "discard"),
    ]),
  // "The Mega Zygarde ex this card is attached to can use the attack on this card." Geobuster ({F}{F}{F}{F}, 350):
  // "Discard all Energy from this Pokémon."
  "Core Memory@me03-070": (d) =>
    trainer(d, {
      attacks: [
        {
          name: "Geobuster",
          cost: ["F", "F", "F", "F"],
          damage: 350,
          text: "Discard all Energy from this Pokémon.",
          effects: [fx.main(), fx.discardEnergy(ref.self, "all")],
          condition: cond.matches(ref.self, { names: ["Mega Zygarde ex"] }),
        },
      ],
    }),
  // "Your opponent reveals their hand, and you choose an Energy card you find there and put it on the bottom of their
  // deck."
  "Energy Swatter@me03-073": (d) =>
    trainer(d, {
      condition: cond.cmp(amt.cards("hand", "opp"), ">", 0),
      effects: [
        { op: "revealHand", side: "opp" },
        fx.chooseCards("hand", "x", msg("Choose an Energy card"), {
          side: "opp",
          filter: { category: ["energy"] },
          min: 1,
          max: 1,
        }),
        fx.move("x", "deckBottom"),
      ],
    }),
  // "Heal 20 damage and remove a Special Condition from your Active Pokémon."
  "Lumiose Galette@me03-078": (d) =>
    trainer(d, {
      condition: cond.or(cond.cmp(amt.counters(ref.myActive), ">", 0), cond.hasCondition(ref.myActive)),
      effects: [
        fx.heal(ref.myActive, 20),
        fx.chooseOne(
          msg("Choose a Special Condition to remove"),
          CONDITIONS.map(([k, label]) => ({
            label,
            effects: [{ op: "cure", target: ref.myActive, conds: [k] }] as Effect[],
            cond: cond.hasCondition(ref.myActive, k),
          })),
        ),
      ],
    }),
  // "Draw cards until you have 5 cards in your hand. Before drawing cards, you may discard any number of cards from your
  // hand. (If you can't draw any cards in this way, you can't use this card.)"
  "Naveen@me03-079": (d) =>
    trainer(d, {
      condition: cond.deck(),
      effects: [
        fx.chooseCards("hand", "d", msg("You may discard cards from your hand"), { min: 0, max: 60, notSource: true }),
        fx.move("d", "discard"),
        fx.drawUntil(5),
      ],
    }),
};

registerScripts(SCRIPTS);
