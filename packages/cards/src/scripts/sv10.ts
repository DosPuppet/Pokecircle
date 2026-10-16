/**
 * Hand scripts of sv10 (Destined Rivals; PLAN-B B10): the texts no template covers. Each script follows the printed
 * text; the details are in docs/extensions/sv10.md.
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

const TR = "Team Rocket's";
const COPY = () => msg("Choose an attack of your opponent's Active Pokémon");

const SCRIPTS: Record<string, CardScript> = {
  // Haughty Order: "Reveal the top 10 cards of your opponent's deck. You may choose an attack from a Pokémon you find
  // there and use it as this attack. Shuffle the revealed cards into your opponent's deck."
  "Team Rocket's Persian ex@sv10-150": (d) =>
    atk(d, 0, [
      fx.chooseCards("deck", "rev", msg("The top 10 cards of your opponent's deck"), {
        side: "opp",
        top: 10,
        min: 0,
        max: 10,
        random: true,
        reveal: true,
      }),
      { op: "useAttackOf", from: { cards: "rev" }, filter: { category: ["pokemon"] }, prompt: msg("Choose an attack to use") },
      fx.shuffle("opp"),
    ]),
  // Evil Incineration: "Discard a Team Rocket's Energy from this Pokémon. If you do, discard your opponent's Active
  // Pokémon and all attached cards."
  "Team Rocket's Moltres ex@sv10-031": (d) =>
    atk(d, 1, [
      fx.if(cond.matches(ref.self, { attachedNamed: "Team Rocket's Energy" }), [
        fx.discardEnergy(ref.self, 1, { names: ["Team Rocket's Energy"] }),
        fx.pokemonTo(ref.defending, "discard"),
      ]),
    ]),
  // Flustered Leap: "Once during your turn, if this Pokémon is on your Bench, you may discard the bottom card of your
  // deck. If you do, discard all cards from this Pokémon and put this Pokémon on top of your deck."
  "Misty's Psyduck@sv10-045": (d) =>
    abil(d, 0, {
      activated: {
        where: "bench",
        condition: cond.deck(),
        effects: [
          fx.chooseCards("deck", "b", msg("The bottom card of your deck"), { bottom: 1, min: 1, max: 1, random: true }),
          fx.move("b", "discard"),
          fx.discardEnergy(ref.self, "all"),
          fx.discardTools(ref.self),
          { op: "pokemonTo", target: ref.self, to: "deckTop" },
        ],
      },
    }),
  // Diver's Catch: "When 1 of your {W} Pokémon is Knocked Out by damage from an attack from your opponent's Pokémon, you
  // may put all Basic {W} Energy attached to that Pokémon into your hand instead of the discard pile."
  "Huntail@sv10-055": (d) =>
    abil(d, 0, {
      triggers: [
        {
          on: "allyKnockedOut",
          byOpponentAttack: true,
          may: true,
          condition: { c: "eventCard", key: "defId", filter: { category: ["pokemon"], types: ["W"] } },
          effects: [
            fx.chooseCards("discard", "w", msg("Basic Water Energy"), {
              among: "ev:attached",
              filter: { category: ["energy"], basicEnergy: true, energyTypes: ["W"] },
              min: 0,
              max: 60,
              random: true,
            }),
            fx.move("w", "hand"),
          ],
        },
      ],
    }),
  // Crescendo Wave: "This attack does 30 damage for each {W} Energy attached to this Pokémon. Before doing damage, you may
  // attach any number of Basic {W} Energy cards from your hand to this Pokémon."
  "Gorebyss@sv10-056": (d) =>
    atk(d, 0, [
      fx.chooseCards("hand", "e", msg("You may attach Basic Water Energy cards from your hand"), {
        filter: { category: ["energy"], basicEnergy: true, energyTypes: ["W"] },
        min: 0,
        max: 60,
      }),
      fx.attach("e", scope.self()),
      fx.setDamage(amt.mul(30, amt.energy(ref.self, { type: "W", units: true }))),
      fx.main(),
    ]),
  // Darkest Impulse: "Whenever your opponent plays a Pokémon from their hand to evolve 1 of their Pokémon, put 4 damage
  // counters on that Pokémon. The effect of Darkest Impulse doesn't stack."
  "Team Rocket's Ampharos@sv10-074": (d) =>
    abil(d, 0, { triggers: [{ on: "oppEvolved", noStack: "Darkest Impulse", effects: [fx.counters({ ev: "pokemon" }, 4)] }] }),
  // Bench Manipulation: "Your opponent flips a coin for each of their Benched Pokémon. This attack does 80 damage to your
  // opponent's Active Pokémon for each tails. This attack's damage isn't affected by Weakness or Resistance."
  "Team Rocket's Hypno@sv10-080": (d) =>
    atk(d, 1, [
      fx.flip(amt.pokemon(scope.oppBench())),
      fx.setDamage(amt.mul(80, { k: "tails" })),
      { op: "mainDamage", noWR: true },
    ]),
  // Rocket Brain: "As often as you like during your turn, you may move 1 damage counter from 1 of your Team Rocket's
  // Pokémon to another of your Pokémon."
  "Team Rocket's Orbeetle@sv10-089": (d) =>
    abil(d, 0, {
      activated: {
        once: "none",
        condition: cond.and(
          cond.exists(scope.mine({ nameIncludes: TR, damaged: true })),
          cond.cmp(amt.pokemon(scope.mine()), ">", 1),
        ),
        effects: [
          fx.choosePokemon(
            scope.mine({ nameIncludes: TR, damaged: true }),
            "from",
            msg("Choose 1 of your Team Rocket's Pokémon"),
          ),
          fx.choosePokemon(scope.mine(), "to", msg("Choose the Pokémon to move the damage counter to")),
          { op: "moveCounters", from: ref.v("from"), to: ref.v("to"), n: 1 },
        ],
      },
    }),
  // Try to Imitate: "Flip a coin. If heads, choose 1 of your opponent's Active Pokémon's attacks and use it as this
  // attack."
  "Ethan's Sudowoodo@sv10-093": (d) =>
    atk(d, 1, [fx.flip(), fx.if(cond.heads(), [{ op: "useAttackOf", from: scope.oppActive(), prompt: COPY() }])]),
  // Dark Awakening: "Choose up to 2 of your {D} Pokémon. For each of those Pokémon, search your deck for a card that
  // evolves from that Pokémon and put it onto that Pokémon to evolve it. Then, shuffle your deck."
  "Team Rocket's Nidorina@sv10-115": (d) =>
    atk(d, 0, [
      fx.choosePokemon(scope.mine({ types: ["D"] }), "t", msg("Choose up to 2 of your Darkness Pokémon"), { min: 0, max: 2 }),
      {
        op: "forEach",
        key: "t",
        as: "p",
        effects: [
          {
            op: "evolveFromHand",
            scope: scope.mine(),
            target: ref.v("p"),
            fromDeck: true,
            prompt: msg("Choose the Pokémon to evolve"),
          },
        ],
      },
      fx.shuffle(),
    ]),
  // Assassin's Return: "You may put this Pokémon into your hand. (Discard all cards attached to this Pokémon.)"
  "Team Rocket's Crobat ex@sv10-122": (d) =>
    atk(d, 0, [
      fx.main(),
      fx.may(msg("Put this Pokémon into your hand?"), [
        fx.discardEnergy(ref.self, "all"),
        fx.discardTools(ref.self),
        fx.pokemonTo(ref.self, "hand"),
      ]),
    ]),
  // Explode Together Now: "This attack does 40 damage for each Pokémon in play that has "Koffing" or "Weezing" in its name
  // (both yours and your opponent's)."
  "Team Rocket's Weezing@sv10-126": (d) =>
    atk(d, 0, [
      fx.setDamage(
        amt.mul(
          40,
          amt.add(
            amt.pokemon(scope.of("both", "any", { nameIncludes: "Koffing" })),
            amt.pokemon(scope.of("both", "any", { nameIncludes: "Weezing" })),
          ),
        ),
      ),
      fx.main(),
    ]),
  // Iron Shake-Up: "You may move any amount of {M} Energy from your Pokémon to your other Pokémon in any way you like."
  // (One Energy at a time, until the player stops.)
  "Forretress@sv10-140": (d) => {
    const metal = scope.mine({ energyTypes: ["M"] });
    const one: Effect = fx.if(
      cond.and(cond.not({ c: "var", key: "stop" }), cond.exists(metal), cond.cmp(amt.pokemon(scope.mine()), ">", 1)),
      [
        fx.may(
          msg("Move a Metal Energy?"),
          [
            fx.choosePokemon(metal, "from", msg("Choose the Pokémon to move the Energy from")),
            fx.moveEnergy(ref.v("from"), scope.mine(), 1, ["M"]),
          ],
          [fx.set("stop", 1)],
        ),
      ],
    );
    return atk(d, 0, [fx.main(), fx.set("stop", 0), fx.repeat(20, [one])]);
  },
  // "Heal 30 damage from your Active Pokémon. If that Pokémon is an Arven's Pokémon, heal 100 damage from it instead."
  "Arven's Sandwich@sv10-161": (d) =>
    trainer(d, {
      condition: cond.cmp(amt.counters(ref.myActive), ">", 0),
      effects: [
        fx.if(cond.matches(ref.myActive, { nameIncludes: "Arven's" }), [fx.heal(ref.myActive, 100)], [fx.heal(ref.myActive, 30)]),
      ],
    }),
  // "Turn 1 of your opponent's face-down Prize cards face up and choose a random card from your opponent's hand. Your
  // opponent reveals that card. You may have your opponent switch those cards."
  "Team Rocket's Bother-Bot@sv10-172": (d) =>
    trainer(d, {
      condition: cond.and(cond.cmp(amt.cards("hand", "opp"), ">", 0), cond.cmp(amt.prizesLeft("opp"), ">", 0)),
      effects: [
        fx.chooseCards("prizes", "prize", msg("A Prize card"), { side: "opp", min: 1, max: 1, random: true, reveal: true }),
        fx.chooseCards("hand", "card", msg("A random card"), { side: "opp", min: 1, max: 1, random: true, reveal: true }),
        fx.may(msg("Have your opponent switch those cards?"), [fx.move("prize", "hand"), fx.move("card", "prizes")]),
      ],
    }),
  // "Flip a coin. If heads, put 2 damage counters on 1 of your opponent's Pokémon. If tails, put 2 damage counters on
  // your Active Pokémon."
  "Team Rocket's Venture Bomb@sv10-179": (d) =>
    trainer(d, {
      effects: [
        fx.flip(),
        fx.if(
          cond.heads(),
          [fx.choosePokemon(scope.theirs(), "t", msg("Choose 1 of your opponent's Pokémon")), fx.counters(ref.v("t"), 2)],
          [fx.counters(ref.myActive, 2)],
        ),
      ],
    }),
};

registerScripts(SCRIPTS);
