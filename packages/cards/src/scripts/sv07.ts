/**
 * Hand scripts of sv07 and sv06.5 (Stellar Crown, Shrouded Fable; PLAN-B B13), with the earlier Standard cards reprinted
 * there. Each script follows the printed text; the details are in docs/extensions/sv07-sv06.5.md.
 */
import {
  type AbilityDef,
  amt,
  type CardDef,
  type CardFilter,
  cond,
  type Effect,
  type EType,
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
const basicOf = (t: EType): CardFilter => ({ ...BASIC_ENERGY, energyTypes: [t] });
const TYPES: EType[] = ["G", "R", "W", "L", "P", "F", "D", "M"];

const SCRIPTS: Record<string, CardScript> = {
  // Glittering Star Pattern: "When you play this Pokémon from your hand to evolve 1 of your Pokémon during your turn, you
  // may switch in 1 of your opponent's Benched Pokémon that has 90 HP or less remaining to the Active Spot."
  "Ledian@svp-133": (d) =>
    abil(d, 0, {
      triggers: [
        {
          on: "evolved",
          may: true,
          condition: cond.exists(scope.oppBench({ maxRemainingHp: 90 })),
          effects: [
            fx.choosePokemon(scope.oppBench({ maxRemainingHp: 90 }), "t", msg("Choose 1 of your opponent's Benched Pokémon")),
            { op: "switch", side: "opp", chooser: "me", with: "t" },
          ],
        },
      ],
    }),
  // Selective Slime: "Once during your turn, you may flip a coin. If heads, choose Burned, Confused, or Poisoned. Your
  // opponent's Active Pokémon is now affected by that Special Condition."
  "Cradily@sv07-006": (d) =>
    abil(d, 0, {
      activated: {
        effects: [
          fx.flip(),
          fx.if(cond.heads(), [
            fx.chooseOne(msg("Choose a Special Condition"), [
              { label: msg("Burned"), effects: [fx.condition(ref.oppActive, "burned")] },
              { label: msg("Confused"), effects: [fx.condition(ref.oppActive, "confused")] },
              { label: msg("Poisoned"), effects: [fx.condition(ref.oppActive, "poisoned")] },
            ]),
          ]),
        ],
      },
    }),
  // Reaping Dash: "Before doing damage, discard all Pokémon Tools and Special Energy from your opponent's Active Pokémon."
  "Mow Rotom@sv07-008": (d) =>
    atk(d, 0, [fx.discardTools(ref.defending), fx.discardEnergy(ref.defending, "all", { special: true }), fx.main()]),
  // Breezy Gift: "Put this Pokémon and all attached cards into your deck. If you do, search your deck for up to 3 cards and
  // put them into your hand. Then, shuffle your deck."
  "Eldegoss@sv07-011": (d) =>
    atk(d, 0, [
      fx.pokemonTo(ref.self, "deck"),
      fx.chooseCards("deck", "c", SEARCH(), { min: 0, max: 3 }),
      fx.move("c", "hand"),
      fx.shuffle(),
    ]),
  // Unleash Lightning: "During your next turn, your Pokémon can't attack. (This includes new Pokémon that come into play.)"
  "Electivire@sv07-047": (d) => atk(d, 1, [fx.main(), fx.timed("yourNextTurn", { s: "cantAttack", scope: scope.mine() })]),
  // Disorienting Flash: "Your opponent's Active Pokémon is now Confused. Put 8 damage counters instead of 3 on that Pokémon
  // for this Special Condition."
  "Lanturn@sv07-049": (d) => atk(d, 0, [fx.main(), { op: "condition", target: ref.defending, cond: "confused", confusion: 8 }]),
  // Jolting Charge: "Search your deck for up to 2 Basic {G} Energy cards and up to 2 Basic {L} Energy cards and attach them
  // to your Pokémon in any way you like. Then, shuffle your deck."
  "Joltik@sv07-050": (d) =>
    atk(d, 0, [
      fx.chooseCards("deck", "g", SEARCH(), { filter: basicOf("G"), min: 0, max: 2 }),
      fx.chooseCards("deck", "l", SEARCH(), { filter: basicOf("L"), min: 0, max: 2 }),
      fx.attach("g", scope.mine()),
      fx.attach("l", scope.mine()),
      fx.shuffle(),
    ]),
  // Colorful Confection: "Search your deck for up to 5 Pokémon that are the same type as any Basic Energy attached to this
  // Pokémon, reveal them, and put them into your hand. Then, shuffle your deck."
  "Alcremie@sv07-065": (d) =>
    atk(d, 0, [
      ...TYPES.map((t, i) =>
        fx.if(cond.cmp(amt.energy(ref.self, { type: t, basic: true }), ">", 0), [
          fx.chooseCards("deck", `f${t}`, SEARCH(), {
            filter: { category: ["pokemon"], types: [t] },
            min: 0,
            max: amt.sub(5, amt.add(0, ...TYPES.slice(0, i).map((u) => amt.count(`f${u}`)))),
            reveal: true,
          }),
          fx.move(`f${t}`, "hand"),
        ]),
      ),
      fx.shuffle(),
    ]),
  // Time to Chow Down: "… you may heal all damage from each of your Evolution Pokémon. If you healed any damage in this
  // way, discard all Energy from those Pokémon."
  "Dachsbun ex@sv07-067": (d) =>
    abil(d, 0, {
      triggers: [
        {
          on: "evolved",
          may: true,
          condition: cond.exists(scope.mine({ stage: ["stage1", "stage2"], damaged: true })),
          effects: [
            fx.choosePokemon(scope.mine({ stage: ["stage1", "stage2"], damaged: true }), "t", msg("Your Evolution Pokémon"), {
              min: amt.pokemon(scope.mine({ stage: ["stage1", "stage2"], damaged: true })),
              max: amt.pokemon(scope.mine({ stage: ["stage1", "stage2"], damaged: true })),
            }),
            { op: "forEach", key: "t", as: "p", effects: [fx.heal(ref.v("p"), "all"), fx.discardEnergy(ref.v("p"), "all")] },
          ],
        },
      ],
    }),
  // Wide Wall: "As long as this Pokémon is in the Active Spot, whenever your opponent plays a Supporter card from their
  // hand, prevent all effects of that card done to all of your Pokémon."
  "Rhyperior@sv07-076": (d) =>
    abil(d, 0, { statics: [{ s: "shielded", scope: scope.mine(), from: "supporters", cond: { c: "isActive", ref: ref.self } }] }),
  // Diffuse Reflection: "This attack does 40 damage for each Special Energy attached to all of your opponent's Pokémon."
  "Diancie@sv07-086": (d) =>
    atk(d, 0, [fx.setDamage(amt.mul(40, amt.energy(ref.all(scope.theirs()), { special: true }))), fx.main()]),
  // Devouring Mouth: "If this Pokémon has more Energy attached than your opponent's Active Pokémon, this attack does 160
  // more damage."
  "Swalot@sv07-092": (d) =>
    atk(d, 0, [
      fx.if(cond.cmp(amt.energy(ref.self, { units: true }), ">", amt.energy(ref.defending, { units: true })), [fx.bonus(160)]),
      fx.main(),
    ]),
  // Goad 'n' Grab: "Switch out your opponent's Active Pokémon to the Bench. (Your opponent chooses the new Active Pokémon.)
  // If you do, this attack does 160 damage to the new Active Pokémon."
  "Grimmsnarl@sv07-096": (d) =>
    atk(d, 0, [fx.if(cond.exists(scope.oppBench()), [fx.switch("opp", "opp"), fx.damage(ref.oppActive, 160)])]),
  // Emergency Rotation: "Once during your turn, if this Pokémon is in your hand and your opponent has any Stage 2 Pokémon in
  // play, you may put this Pokémon onto your Bench."
  "Klinklang@sv07-101": (d) => abil(d, 0, { statics: [], benchFromHand: cond.exists(scope.theirs({ stage: ["stage2"] })) }),
  // Reforged Axe: "Before doing damage, discard all Pokémon Tools from this Pokémon. If you can't discard any, this attack
  // does nothing."
  "Melmetal@sv07-104": (d) =>
    atk(d, 1, [
      fx.if(cond.matches(ref.self, { hasTool: true }), [fx.discardTools(ref.self)], [{ op: "attackFails" }]),
      fx.main(),
    ]),
  // Pummeling Payback: "If this Pokémon is damaged by an attack from your opponent's Pokémon (even if this Pokémon is
  // Knocked Out), put 2 damage counters on the Attacking Pokémon for each {M} Energy attached to this Pokémon."
  "Orthworm ex@sv07-110": (d) =>
    abil(d, 0, {
      triggers: [
        {
          on: "damagedByAttack",
          byOpponentAttack: true,
          effects: [fx.counters({ ev: "attacker" }, amt.mul(2, amt.energy(ref.self, { type: "M", units: true })))],
        },
      ],
    }),
  // Aero Chase: "If the Retreat Cost of your opponent's Active Pokémon is {C}{C} or more, this attack does 110 more damage."
  "Talonflame@sv07-123": (d) =>
    atk(d, 0, [fx.if(cond.cmp({ k: "retreatCost", on: ref.defending }, ">=", 2), [fx.bonus(110)]), fx.main()]),
  // "If the Pokémon this card is attached to is in the Active Spot and is damaged by an attack from your opponent's Pokémon
  // (even if this Pokémon is Knocked Out), put 12 damage counters on the Attacking Pokémon. If you placed any damage
  // counters in this way, discard this card."
  "Deluxe Bomb@sv07-134": (d) =>
    trainer(d, {
      triggers: [
        {
          on: "damagedByAttack",
          byOpponentAttack: true,
          condition: { c: "var", key: "ev:wasActive" },
          effects: [fx.counters({ ev: "attacker" }, 12), fx.move("thisCard", "discard")],
        },
      ],
    }),
  // "Once during each player's turn, that player may search their deck for a Stage 1 Pokémon that evolves from 1 of their
  // Basic Pokémon and put it onto that Pokémon to evolve it. If that Pokémon was evolved in this way, that player may search
  // their deck for a Stage 2 Pokémon that evolves from that Pokémon and put it onto that Pokémon to evolve it. Then, that
  // player shuffles their deck. (Players can't evolve a Basic Pokémon during their first turn or a Basic Pokémon that was
  // put into play this turn.)"
  "Grand Tree@sv07-136": (d) =>
    trainer(d, {
      stadiumAction: true,
      condition: cond.and(
        cond.not({ c: "firstTurn" }),
        cond.deck(),
        cond.exists(scope.mine({ stage: ["basic"], enteredBefore: true })),
      ),
      effects: [
        {
          op: "evolveFromHand",
          scope: scope.mine({ stage: ["basic"], enteredBefore: true }),
          fromDeck: true,
          store: "t",
          prompt: msg("Choose the Pokémon to evolve"),
        },
        fx.if(cond.cmp(amt.count("t"), ">", 0), [
          fx.may(msg("Search your deck for a Stage 2 Pokémon that evolves from that Pokémon?"), [
            {
              op: "evolveFromHand",
              scope: scope.mine(),
              target: ref.v("t"),
              fromDeck: true,
              prompt: msg("Choose the Pokémon to evolve"),
            },
          ]),
        ]),
        fx.shuffle(),
      ],
    }),
  // "Put 2 cards from your hand on the bottom of your deck in any order. If you put 2 cards on the bottom of your deck in
  // this way, draw 4 cards. (If you can't put 2 cards from your hand on the bottom of your deck, you can't use this
  // card.)"
  "Kofu@sv07-138": (d) =>
    trainer(d, {
      condition: cond.hasCards("hand", "me", undefined, 3),
      effects: [
        fx.chooseCards("hand", "b", msg("Choose 2 cards to put on the bottom of your deck"), { min: 2, max: 2, notSource: true }),
        { op: "orderCards", key: "b", prompt: msg("Put them in any order (first = top)") },
        fx.move("b", "deckBottom"),
        fx.draw(4),
      ],
    }),
  // Mystical Return: "Flip a coin. If heads, choose 1 of your opponent's Benched Pokémon. Shuffle that Pokémon and all
  // attached cards into their deck."
  "Sylveon@sv06.5-022": (d) =>
    atk(d, 0, [
      fx.flip(),
      fx.if(cond.and(cond.heads(), cond.exists(scope.oppBench())), [
        fx.choosePokemon(scope.oppBench(), "t", msg("Choose 1 of your opponent's Benched Pokémon")),
        fx.pokemonTo(ref.v("t"), "deck"),
        fx.shuffle("opp"),
      ]),
    ]),
  // United Wings: "This attack does 20 damage for each Pokémon in your discard pile that has the United Wings attack."
  "Dartrix@sv06.5-004": (d) =>
    atk(d, 0, [
      fx.setDamage(amt.mul(20, amt.cards("discard", "me", { category: ["pokemon"], attackNamed: "United Wings" }))),
      fx.main(),
    ]),
  // Power Shot: "Discard a Basic {G} Energy card from your hand. If you can't, this attack does nothing."
  "Decidueye@sv06.5-005": (d) =>
    atk(d, 1, [
      fx.if(
        cond.hasCards("hand", "me", basicOf("G")),
        [
          fx.chooseCards("hand", "d", msg("Choose a card to discard"), { filter: basicOf("G"), min: 1, max: 1 }),
          fx.move("d", "discard"),
        ],
        [{ op: "attackFails" }],
      ),
      fx.main(),
    ]),
  // Shattering Speed: "Discard this Pokémon and all attached cards."
  "Revavroom ex@sv06.5-015": (d) => atk(d, 1, [fx.main(), fx.pokemonTo(ref.self, "discard")]),
  // Daydream: "During your opponent's next turn, if they attach an Energy card from their hand to the Defending Pokémon,
  // their turn ends."
  "Hypno@sv06.5-017": (d) =>
    atk(d, 0, [
      fx.main(),
      fx.timed("opponentsNextTurn", { s: "onAttach", scope: scope.oppActive(), endsTurn: true }, ref.defending),
    ]),
  // Crescent Purge: "You may turn 1 of your face-down Prize cards face up. If you do, this attack does 80 more damage."
  "Cresselia@sv06.5-021": (d) =>
    atk(d, 1, [
      fx.if(cond.cmp(amt.prizesLeft("me"), ">", 0), [
        fx.may(msg("Turn 1 of your Prize cards face up for 80 more damage?"), [
          fx.chooseCards("prizes", "p", msg("A Prize card"), { min: 1, max: 1, random: true, reveal: true }),
          fx.bonus(80),
        ]),
      ]),
      fx.main(),
    ]),
  // Iron Smasher: "If your opponent has any Future Pokémon in play, this attack does 120 more damage."
  "Slither Wing@sv06.5-026": (d) =>
    atk(d, 0, [fx.if(cond.exists(scope.theirs({ tags: ["future"] })), [fx.bonus(120)]), fx.main()]),
  // Mischievous Tentacles: "Look at the top card of your opponent's deck. You may have your opponent shuffle their deck."
  "Inkay@sv06.5-033": (d) =>
    atk(d, 0, [
      fx.main(),
      { op: "look", zone: "deck", side: "opp", top: 1 },
      fx.may(msg("Have your opponent shuffle their deck?"), [fx.shuffle("opp")]),
    ]),
  // Colluding Tentacles: "Switch in 1 of your opponent's Benched Pokémon to the Active Spot. If you do, this attack does 120
  // damage to the new Active Pokémon. If you didn't play Xerosic's Machinations from your hand during this turn, this
  // attack does nothing."
  "Malamar@sv06.5-034": (d) =>
    atk(d, 0, [
      fx.if(
        cond.cmp({ k: "turnLog", event: "supporterPlayed", side: "me", filter: { names: ["Xerosic's Machinations"] } }, "==", 0),
        [{ op: "attackFails" }],
      ),
      fx.if(cond.exists(scope.oppBench()), [fx.switch("opp"), fx.damage(ref.oppActive, 120)]),
    ]),
  // Poisonous Musculature: "Search your deck for up to 2 Basic {D} Energy cards and attach them to this Pokémon. Then,
  // shuffle your deck. If you attached Energy to a Pokémon in this way, this Pokémon is now Poisoned."
  "Okidogi ex@sv06.5-036": (d) =>
    atk(d, 0, [
      fx.chooseCards("deck", "e", SEARCH(), { filter: basicOf("D"), min: 0, max: 2 }),
      fx.attach("e", scope.self()),
      fx.shuffle(),
      fx.if(cond.cmp(amt.count("e"), ">", 0), [fx.condition(ref.self, "poisoned")]),
    ]),
  // Oh No You Don't: "If this Pokémon is Knocked Out by damage from an attack from your opponent's Pokémon, and if you have
  // any Pecharunt ex in play, your opponent takes 1 fewer Prize card."
  "Munkidori ex@sv06.5-037": (d) =>
    abil(d, 0, {
      statics: [
        {
          s: "prizes",
          scope: scope.self(),
          delta: -1,
          byAttack: true,
          cond: cond.exists(scope.mine({ names: ["Pecharunt ex"] })),
        },
      ],
    }),
  // Colorful Catch: "Search your deck for up to 3 Basic Energy cards of different types, reveal them, and put them into
  // your hand. Then, shuffle your deck."
  "Eevee@sv06.5-050": (d) =>
    atk(d, 0, [
      fx.chooseCards("deck", "e", SEARCH(), { filter: BASIC_ENERGY, min: 0, max: 3, distinctNames: true, reveal: true }),
      fx.move("e", "hand"),
      fx.shuffle(),
    ]),
  // "Search your deck for a Stadium card and an Energy card, reveal them, and put them into your hand. Then, shuffle your
  // deck."
  "Colress's Tenacity@sv06.5-057": (d) =>
    trainer(d, {
      condition: cond.deck(),
      effects: [
        fx.chooseCards("deck", "s", SEARCH(), {
          filter: { category: ["trainer"], trainer: ["stadium"] },
          min: 0,
          max: 1,
          reveal: true,
        }),
        fx.chooseCards("deck", "e", SEARCH(), { filter: { category: ["energy"] }, min: 0, max: 1, reveal: true }),
        fx.move("s", "hand"),
        fx.move("e", "hand"),
        fx.shuffle(),
      ],
    }),
  // "At the end of your turn (after your attack), if the Pokémon this card is attached to is in the Active Spot, you may
  // attach a Basic Energy card from your discard pile to it."
  "Powerglass@sv06.5-063": (d) =>
    trainer(d, {
      triggers: [
        {
          on: "turnEnd",
          may: true,
          condition: cond.and({ c: "isActive", ref: ref.self }, cond.hasCards("discard", "me", BASIC_ENERGY)),
          effects: [
            fx.chooseCards("discard", "e", msg("Choose a Basic Energy card from your discard pile"), {
              filter: BASIC_ENERGY,
              min: 1,
              max: 1,
            }),
            fx.attach("e", scope.self()),
          ],
        },
      ],
    }),
};

registerScripts(SCRIPTS);
