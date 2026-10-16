/**
 * Hand scripts of sv10.5b and sv10.5w (Black Bolt, White Flare; PLAN-B B9): the texts no template covers. Each script
 * follows the printed text; the details are in docs/extensions/sv10.5.md.
 */
import { type AbilityDef, amt, type CardDef, cond, type Effect, fx, msg, ref, scope, type TrainerDef } from "@pokecircle/engine";
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

const SCRIPTS: Record<string, CardScript> = {
  // Blizzard Burst: "This attack also does 10 damage to each of your opponent's Benched Pokémon for each Prize card your
  // opponent has taken."
  "Kyurem ex@sv10.5b-028": (d) =>
    atk(d, 1, [fx.main(), fx.damage(ref.all(scope.oppBench()), amt.mul(10, amt.prizesTaken("opp")))]),
  // "Flip 2 coins. If both of them are heads, search your deck for a Basic Energy card and attach it to 1 of your Pokémon.
  // Then, shuffle your deck."
  "Energy Coin@sv10.5b-081": (d) =>
    trainer(d, {
      condition: cond.deck(),
      effects: [
        fx.flip(2),
        fx.if(cond.cmp(amt.heads(), ">=", 2), [
          fx.chooseCards("deck", "e", msg("Choose cards from your deck"), {
            filter: { category: ["energy"], basicEnergy: true },
            min: 0,
            max: 1,
          }),
          fx.attach("e", scope.mine()),
          fx.shuffle(),
        ]),
      ],
    }),
  // Torrential Whirlpool: "Once during your turn, you may switch your Active Pokémon with 1 of your Benched Pokémon. If you
  // do, switch out your opponent's Active Pokémon to the Bench. (Your opponent chooses the new Active Pokémon.)"
  "Samurott@sv10.5w-023": (d) =>
    abil(d, 0, {
      activated: {
        condition: cond.exists(scope.myBench()),
        effects: [fx.switch("me"), fx.if(cond.exists(scope.oppBench()), [fx.switch("opp", "opp")])],
      },
    }),
  // Fortunate Eye: "Look at the top 5 cards of your opponent's deck and put them back in any order."
  "Gothorita@sv10.5w-042": (d) =>
    atk(d, 0, [
      fx.chooseCards("deck", "top", msg("The top 5 cards of your opponent's deck"), {
        side: "opp",
        top: 5,
        min: 0,
        max: 5,
        random: true,
      }),
      { op: "orderCards", key: "top", prompt: msg("Put them back in any order (first = top)") },
      fx.move("top", "deckTop"),
    ]),
  // Foul Play: "Choose 1 of your opponent's Active Pokémon's attacks and use it as this attack."
  "Zoroark@sv10.5w-062": (d) =>
    atk(d, 1, [
      { op: "useAttackOf", from: scope.oppActive(), prompt: msg("Choose an attack of your opponent's Active Pokémon") },
    ]),
  // Look for Prey: "Once during your turn, you may use this Ability. Your opponent reveals their hand, and you put a Basic
  // Pokémon with 70 HP or less that you find there onto your opponent's Bench."
  "Mandibuzz@sv10.5w-064": (d) =>
    abil(d, 0, {
      activated: {
        condition: cond.and(cond.cmp(amt.cards("hand", "opp"), ">", 0), cond.cmp(amt.benchSpace("opp"), ">", 0)),
        effects: [
          { op: "revealHand", side: "opp" },
          fx.chooseCards("hand", "p", msg("Choose a Basic Pokémon with 70 HP or less"), {
            side: "opp",
            filter: { category: ["pokemon"], stage: ["basic"], maxHp: 70 },
            min: 0,
            max: 1,
          }),
          fx.move("p", "bench"),
        ],
      },
    }),
  // Greedy Eater: "If your opponent's Basic Pokémon is Knocked Out by damage from an attack used by this Pokémon, take 1
  // more Prize card."
  "Hydreigon ex@sv10.5w-067": (d) =>
    abil(d, 0, {
      statics: [
        {
          s: "prizes",
          scope: scope.theirs({ stage: ["basic"] }),
          delta: 1,
          byAttack: true,
          by: { names: ["Hydreigon ex"] },
          cond: { c: "isActive", ref: ref.self },
        },
      ],
    }),
  // Odor Sleuth: "Flip 3 coins. Put a number of cards up to the number of heads from your discard pile into your hand."
  "Stoutland@sv10.5w-076": (d) =>
    atk(d, 0, [
      fx.flip(3),
      fx.chooseCards("discard", "c", msg("Choose cards from your discard pile"), { min: 0, max: amt.heads() }),
      fx.move("c", "hand"),
    ]),
  // "Each player shuffles their hand into their deck. Then, flip a coin. If heads, you draw 5 cards, and your opponent
  // draws 3 cards. If tails, you draw 3 cards, and your opponent draws 5 cards."
  "Harlequin@sv10.5w-083": (d) =>
    trainer(d, {
      effects: [
        fx.moveAll("hand", "me", "deck"),
        fx.shuffle("me"),
        fx.moveAll("hand", "opp", "deck"),
        fx.shuffle("opp"),
        fx.flip(),
        fx.if(cond.heads(), [fx.draw(5), fx.draw(3, "opp")], [fx.draw(3), fx.draw(5, "opp")]),
      ],
    }),
};

registerScripts(SCRIPTS);
