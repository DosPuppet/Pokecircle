/**
 * Hand scripts of me01 (PLAN-B B8): the texts no template covers. Each script follows the printed text; the details are
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

const BASIC_WATER = { category: ["energy" as const], basicEnergy: true, energyTypes: ["W" as const] };

const SCRIPTS: Record<string, CardScript> = {
  // Reversing Gust: "Flip a coin. If heads, choose 1 of your opponent's Pokémon. Shuffle that Pokémon and all attached
  // cards into their deck."
  "Shiftry@me01-015": (d) =>
    atk(d, 0, [
      fx.flip(),
      fx.if(cond.heads(), [
        fx.choosePokemon(scope.theirs(), "t", msg("Choose 1 of your opponent's Pokémon")),
        fx.pokemonTo(ref.v("t"), "deck"),
        fx.shuffle("opp"),
      ]),
    ]),
  // Supernatural Shapeshifter: "Discard the top card of your deck, and if that card is a Supporter card, use the effect
  // of that card as the effect of this attack."
  "Ninetales@me01-020": (d) =>
    atk(d, 0, [
      { op: "mill", side: "me", n: 1, store: "m" },
      fx.chooseCards("discard", "sup", msg("A Supporter card"), {
        among: "m",
        filter: { category: ["trainer"], trainer: ["supporter"] },
        min: 0,
        max: 1,
        random: true,
      }),
      { op: "useCardEffects", cards: "sup" },
    ]),
  // Explosiveness: "If this Pokémon is in your hand when you are setting up to play, you may put it face down in the
  // Active Spot."
  "Cinderace@me01-028": (d) => abil(d, 0, { setupActive: true, statics: [] }),
  // Scorching Earth: "If your opponent has a Stadium in play, discard it. If you do, your opponent can't play any Stadium
  // cards from their hand during their next turn."
  "Chi-Yu@me01-031": (d) =>
    atk(d, 0, [
      fx.main(),
      fx.if({ c: "stadium", owner: "opp" }, [
        fx.discardStadium(),
        fx.timed("opponentsNextTurn", { s: "cantPlay", side: "opp", kinds: ["stadium"] }),
      ]),
    ]),
  // Riptide: "This attack does 20 damage for each Basic {W} Energy card in your discard pile. Then, shuffle those cards
  // into your deck."
  "Kyogre@me01-034": (d) =>
    atk(d, 0, [
      fx.setDamage(amt.mul(20, amt.cards("discard", "me", BASIC_WATER))),
      fx.main(),
      fx.moveAll("discard", "me", "deck", BASIC_WATER),
      fx.shuffle(),
    ]),
  // Bring Down: "Choose a Pokémon in play (yours or your opponent's) that has the least HP remaining, except for this
  // Pokémon, and it is Knocked Out."
  "Inteleon@me01-041": (d) =>
    atk(d, 0, [
      {
        op: "choosePokemon",
        scope: { ...scope.of("both"), notSelf: true },
        store: "t",
        prompt: msg("Choose the Pokémon with the least HP remaining"),
        leastHp: true,
      },
      { op: "knockOut", target: ref.v("t") },
    ]),
  // Electrified Incisors: "During your opponent's next turn, whenever they attach an Energy card from their hand to the
  // Defending Pokémon, place 8 damage counters on that Pokémon."
  "Pachirisu@me01-051": (d) =>
    atk(d, 0, [
      fx.main(),
      fx.timed("opponentsNextTurn", { s: "onAttach", scope: scope.oppActive(), counters: 8 }, ref.defending),
    ]),
  // Fragile Husk: "If this Pokémon is Knocked Out by damage from an attack from your opponent's Pokémon ex, your opponent
  // can't take any Prize cards for it."
  "Shedinja@me01-061": (d) =>
    abil(d, 0, { statics: [{ s: "prizes", scope: scope.self(), delta: -99, byAttack: true, by: { tags: ["ex"] } }] }),
  // Horrifying Bite: "Flip a coin until you get tails. For each heads, choose a random card from your opponent's hand.
  // Your opponent reveals those cards and shuffles them into their deck."
  "Houndstone@me01-066": (d) =>
    atk(d, 0, [
      fx.main(),
      fx.flipUntilTails(),
      fx.chooseCards("hand", "rnd", msg("A random card"), { side: "opp", min: 0, max: amt.heads(), random: true, reveal: true }),
      fx.move("rnd", "deck"),
      fx.shuffle("opp"),
    ]),
  // Miraculous Paint: "Flip a coin. If heads, choose a Special Condition. Your opponent's Active Pokémon is now affected by
  // that Special Condition."
  "Grafaiai@me01-092": (d) =>
    atk(d, 0, [
      fx.main(),
      fx.flip(),
      fx.if(cond.heads(), [
        fx.chooseOne(msg("Choose a Special Condition"), [
          { label: msg("Asleep"), effects: [fx.condition(ref.defending, "asleep")] },
          { label: msg("Burned"), effects: [fx.condition(ref.defending, "burned")] },
          { label: msg("Confused"), effects: [fx.condition(ref.defending, "confused")] },
          { label: msg("Paralyzed"), effects: [fx.condition(ref.defending, "paralyzed")] },
          { label: msg("Poisoned"), effects: [fx.condition(ref.defending, "poisoned")] },
        ]),
      ]),
    ]),
  // All-You-Can-Grab: "Flip a coin until you get tails. Search your deck for a number of cards up to the number of heads
  // and put them into your hand. Then, shuffle your deck."
  "Gholdengo@me01-099": (d) =>
    atk(d, 0, [
      fx.flipUntilTails(),
      fx.chooseCards("deck", "found", msg("Choose cards from your deck"), { min: 0, max: amt.heads() }),
      fx.move("found", "hand"),
      fx.shuffle(),
    ]),
  // Lustrous Assist: "Once during your turn, when your Mega Latias ex moves from your Bench to the Active Spot, you may use
  // this Ability. Move any amount of Energy from your Benched Pokémon to your Active Pokémon."
  "Latios@me01-101": (d) =>
    abil(d, 0, {
      triggers: [
        {
          on: "allyBecameActive",
          may: true,
          oncePerTurn: true,
          condition: cond.and({ c: "myTurn" }, cond.matches({ ev: "pokemon" }, { names: ["Mega Latias ex"] })),
          effects: [
            {
              op: "gatherEnergy",
              from: scope.myBench(),
              to: ref.myActive,
              min: 0,
              max: 60,
              prompt: msg("Choose Energy to move to your Active Pokémon"),
            },
          ],
        },
      ],
    }),
  // Evidence Gathering: "Once during your turn, you may use this Ability. Switch a card from your hand with the top card of
  // your deck."
  "Gumshoos@me01-110": (d) =>
    abil(d, 0, {
      activated: {
        condition: cond.and(cond.cmp(amt.cards("hand", "me"), ">", 0), cond.deck()),
        effects: [
          fx.chooseCards("deck", "top", msg("The top card of your deck"), { top: 1, min: 1, max: 1, random: true }),
          fx.chooseCards("hand", "h", msg("Choose a card from your hand"), { min: 1, max: 1 }),
          fx.move("top", "hand"),
          fx.move("h", "deckTop"),
        ],
      },
    }),
  // "Ask your opponent if each player may take a Prize card. If yes, each player takes a Prize card. If no, you draw 4
  // cards."
  "Lt. Surge's Bargain@me01-120": (d) =>
    trainer(d, {
      effects: [
        {
          op: "may",
          chooser: "opp",
          prompt: msg("Each player takes a Prize card? (No: your opponent draws 4 cards.)"),
          then: [
            { op: "takePrizes", n: 1, side: "me" },
            { op: "takePrizes", n: 1, side: "opp" },
          ],
          else: [fx.draw(4)],
        },
      ],
    }),
  // "Devolve 1 of your evolved {P} Pokémon by putting any number of Evolution cards on it into your hand. (That Pokémon
  // can't evolve this turn.)"
  "Strange Timepiece@me01-128": (d) => {
    const evolved = scope.mine({ types: ["P"], stage: ["stage1", "stage2"] });
    return trainer(d, {
      condition: cond.exists(evolved),
      effects: [
        fx.choosePokemon(evolved, "t", msg("Choose 1 of your evolved Psychic Pokémon")),
        fx.devolve(ref.v("t")),
        fx.if(cond.matches(ref.v("t"), { stage: ["stage1", "stage2"] }), [
          fx.may(msg("Put another Evolution card into your hand?"), [fx.devolve(ref.v("t"))]),
        ]),
        fx.timed("thisTurn", { s: "cantEvolve", scope: scope.mine() }, ref.v("t")),
      ],
    });
  },
};

registerScripts(SCRIPTS);
