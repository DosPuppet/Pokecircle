/**
 * Hand scripts of me05 (PLAN-B B5): the texts no template covers. Each script follows the printed text; the details are
 * in docs/extensions/me05.md.
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

const MEGA_EX = { tags: ["mega" as const, "ex" as const] };

const SCRIPTS: Record<string, CardScript> = {
  // "Reveal the bottom 7 cards of your deck, and this attack does 50 damage for each Pokémon you find there that has the
  // Bug Out attack. Then, shuffle any revealed Pokémon back into your deck. Discard the other cards."
  "Sizzlipede@me05-009": (d) =>
    atk(d, 1, [
      fx.chooseCards("deck", "rev", msg("The bottom 7 cards of your deck"), {
        bottom: 7,
        min: 0,
        max: 7,
        random: true,
        reveal: true,
      }),
      fx.chooseCards("deck", "bug", msg("Pokémon that have this attack"), {
        among: "rev",
        filter: { category: ["pokemon"], attackNamed: "Bug Out" },
        min: 0,
        max: 7,
        random: true,
      }),
      fx.setDamage(amt.mul(50, amt.count("bug"))),
      fx.main(),
      fx.chooseCards("deck", "pk", msg("Revealed Pokémon"), {
        among: "rev",
        filter: { category: ["pokemon"] },
        min: 0,
        max: 7,
        random: true,
      }),
      { op: "varMinus", key: "rev", minus: "pk" },
      fx.move("rev", "discard"),
      fx.shuffle(),
    ]),
  // Photon Cord: "If this Pokémon is in the Active Spot and is Knocked Out by damage from an attack from your opponent's
  // Pokémon, move up to 2 Basic {L} Energy cards from this Pokémon to 1 of your Benched Pokémon."
  "Miraidon@me05-028": (d) =>
    abil(d, 0, {
      triggers: [
        {
          on: "knockedOut",
          byOpponentAttack: true,
          condition: cond.and({ c: "var", key: "ev:wasActive" }, cond.exists(scope.myBench())),
          effects: [
            fx.chooseCards("discard", "e", msg("Choose up to 2 Basic Lightning Energy cards to move"), {
              among: "ev:attached",
              filter: { category: ["energy"], basicEnergy: true, energyTypes: ["L"] },
              min: 0,
              max: 2,
            }),
            fx.if(cond.cmp(amt.count("e"), ">", 0), [
              fx.choosePokemon(scope.myBench(), "to", msg("Choose the Benched Pokémon to move the Energy to")),
              {
                op: "attach",
                cards: "e",
                to: scope.myBench(),
                prompt: msg("Choose the Pokémon to attach the card to"),
                target: ref.v("to"),
              },
            ]),
          ],
        },
      ],
    }),
  // "At the end of your opponent's next turn, discard the Defending Pokémon and all attached cards."
  "Jynx@me05-032": (d) =>
    atk(d, 0, [
      fx.timed(
        "opponentsNextTurn",
        { s: "endOfTurn", scope: scope.self(), effects: [fx.pokemonTo(ref.self, "discard")] },
        ref.defending,
      ),
    ]),
  // "If you have 13 or more Pokémon that have the Hide 'n' Sneak Ability in your discard pile, choose 2 of your
  // opponent's Pokémon and quadruple the number of damage counters on each of them."
  "Spiritomb@me05-035": (d) =>
    atk(d, 0, [
      fx.if(cond.cmp(amt.cards("discard", "me", { category: ["pokemon"], abilityNamed: "Hide 'n' Sneak" }), ">=", 13), [
        fx.choosePokemon(scope.theirs(), "t", msg("Choose 2 of your opponent's Pokémon"), {
          min: amt.min(2, amt.pokemon(scope.theirs())),
          max: 2,
        }),
        { op: "forEach", key: "t", as: "p", effects: [fx.counters(ref.v("p"), amt.mul(3, amt.counters(ref.v("p"))))] },
      ]),
    ]),
  // "If you have no cards in your hand, choose an attack from 1 of your opponent's Pokémon in play and use it as this
  // attack."
  "Thievul@me05-054": (d) =>
    atk(d, 0, [
      fx.if(cond.cmp(amt.cards("hand", "me"), "==", 0), [
        { op: "useAttackOf", from: scope.theirs(), prompt: msg("Choose an attack of your opponent's Pokémon") },
      ]),
    ]),
  // "Flip 2 coins. If both of them are heads, search your deck for a Pokémon and put it onto your Bench. Then, shuffle
  // your deck." (Only a Basic Pokémon can be put onto the Bench.)
  "Bombirdier@me05-071": (d) =>
    atk(d, 0, [
      fx.flip(2),
      fx.if(cond.cmp(amt.heads(), ">=", 2), [
        fx.chooseCards("deck", "found", msg("Choose cards from your deck"), {
          filter: { category: ["pokemon"], stage: ["basic"] },
          min: 0,
          max: amt.min(1, amt.benchSpace()),
        }),
        fx.move("found", "bench"),
        fx.shuffle(),
      ]),
    ]),
  // "Once during your turn, after you flip any coins for an attack of the {C} Pokémon this card is attached to, you may
  // ignore all results of those coin flips and begin flipping those coins again."
  "Backtrack Badge@me05-074": (d) =>
    trainer(d, { statics: [{ s: "reflip", scope: { ...scope.self(), filter: { types: ["C"] } } }] }),
  // "If the Pokémon this card is attached to isn't a Mega Evolution Pokémon ex, is in the Active Spot, and takes 240 or
  // more damage from an attack from your opponent's Mega Evolution Pokémon ex (even if this Pokémon is Knocked Out),
  // place 12 damage counters on the Attacking Pokémon. If you placed any damage counters in this way, discard this card."
  "Tremendous Bomb@me05-082": (d) =>
    trainer(d, {
      triggers: [
        {
          on: "damagedByAttack",
          byOpponentAttack: true,
          condition: cond.and(
            { c: "var", key: "ev:wasActive" },
            cond.not(cond.matches(ref.self, MEGA_EX)),
            cond.cmp({ k: "var", key: "ev:amount" }, ">=", 240),
            cond.matches({ ev: "attacker" }, MEGA_EX),
          ),
          effects: [fx.counters({ ev: "attacker" }, 12), fx.move("thisCard", "discard")],
        },
      ],
    }),
};

registerScripts(SCRIPTS);
