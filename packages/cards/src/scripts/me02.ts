/**
 * Hand scripts of me02 (PLAN-B B8): the texts no template covers. Each script follows the printed text; the details are
 * in docs/extensions/me02-me01.md.
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
  // Sandy Flapping: "Once during your turn, when you play this Pokémon from your hand to evolve 1 of your Pokémon, you may
  // use this Ability. You may also use this Ability if this Pokémon is in the Active Spot and is Knocked Out by damage
  // from an attack from your opponent's Pokémon. Discard the top 2 cards of your opponent's deck."
  "Flygon@me02-053": (d) =>
    abil(d, 0, {
      triggers: [
        { on: "evolved", may: true, oncePerTurn: true, effects: [fx.mill("opp", 2)] },
        {
          on: "knockedOut",
          byOpponentAttack: true,
          may: true,
          condition: { c: "var", key: "ev:wasActive" },
          effects: [fx.mill("opp", 2)],
        },
      ],
    }),
  // Multi Adapter: "Each of your Pokémon that has "Rotom" in its name may have up to 2 Pokémon Tool cards attached."
  "Rotom ex@me02-029": (d) => abil(d, 0, { statics: [{ s: "toolSlots", scope: scope.mine({ nameIncludes: "Rotom" }), n: 2 }] }),
  // Energizing Sketch: "Flip 3 coins. Attach an amount of Basic Energy up to the number of heads from your discard pile to
  // your Benched Pokémon in any way you like."
  "Smeargle@me02-080": (d) =>
    atk(d, 0, [
      fx.flip(3),
      fx.chooseCards("discard", "e", msg("Choose Basic Energy cards from your discard pile"), {
        filter: { category: ["energy"], basicEnergy: true },
        min: 0,
        max: amt.heads(),
      }),
      fx.attach("e", scope.myBench()),
    ]),
  // "You can use this card only if you discard a Basic {R} Energy card from your hand. Discard a Pokémon Tool or Special
  // Energy card from 1 of your opponent's Pokémon, or discard a Stadium in play."
  "Blowtorch@me02-086": (d) => {
    const fire = { category: ["energy" as const], basicEnergy: true, energyTypes: ["R" as const] };
    const tooled = scope.theirs({ hasTool: true });
    const special = scope.theirs({ specialEnergy: true });
    return trainer(d, {
      condition: cond.and(
        cond.hasCards("hand", "me", fire),
        cond.or(cond.exists(tooled), cond.exists(special), { c: "stadium" }),
      ),
      effects: [
        fx.chooseCards("hand", "cost", msg("Choose a Basic Fire Energy card to discard"), { filter: fire, min: 1, max: 1 }),
        fx.move("cost", "discard"),
        fx.chooseOne(msg("Choose what to discard"), [
          {
            label: msg("A Pokémon Tool"),
            cond: cond.exists(tooled),
            effects: [fx.choosePokemon(tooled, "t", msg("Choose 1 of your opponent's Pokémon")), fx.discardTools(ref.v("t"))],
          },
          {
            label: msg("A Special Energy card"),
            cond: cond.exists(special),
            effects: [
              fx.choosePokemon(special, "t", msg("Choose 1 of your opponent's Pokémon")),
              fx.discardEnergy(ref.v("t"), 1, { special: true }),
            ],
          },
          { label: msg("A Stadium in play"), cond: { c: "stadium" }, effects: [fx.discardStadium()] },
        ]),
      ],
    });
  },
  // "Confused Pokémon (both yours and your opponent's) don't recover from that Special Condition when they evolve or
  // devolve."
  "Dizzying Valley@me02-088": (d) => trainer(d, { statics: [{ s: "keepConfused", scope: scope.of("both") }] }),
  // "Look at the top 7 cards of your deck and put a {D} Pokémon you find there onto your Bench. Shuffle the other cards
  // and put them on the bottom of your deck. You can't use this card during your first turn."
  "Grimsley's Move@me02-090": (d) =>
    trainer(d, {
      condition: cond.and(cond.not({ c: "firstTurn" }), cond.deck()),
      effects: [
        fx.chooseCards("deck", "top", msg("The top 7 cards of your deck"), { top: 7, min: 0, max: 7, random: true }),
        fx.chooseCards("deck", "p", msg("Choose a Darkness Pokémon to put onto your Bench"), {
          among: "top",
          filter: { category: ["pokemon"], stage: ["basic"], types: ["D"] },
          min: 0,
          max: amt.min(1, amt.benchSpace()),
        }),
        fx.move("p", "bench"),
        { op: "varMinus", key: "top", minus: "p" },
        fx.move("top", "deckBottom"),
      ],
    }),
};

registerScripts(SCRIPTS);
