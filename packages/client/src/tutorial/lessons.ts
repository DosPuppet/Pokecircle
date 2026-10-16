/**
 * The tutorial lessons: each one is a staged position (starter-deck cards), a scripted opponent (`lessonAgent`) and a
 * sequence of steps. Every lesson is played to its end by `client/test/tutorial.test.ts`.
 * Texts are English `msg` literals, translated on display (French catalog, vouvoiement); **bold** is drawn bold.
 * Scenario cards are definition ids; allowed decisions name cards by their English name.
 */
import { msg } from "@pokecircle/engine";
import { activeIs, damageAtMost, discarded, energyOn, inPlayNamed, type Lesson, myMain, prizesLeft, turnEnded } from "./runtime";

const FIRE = "basic-fire-energy";
const WATER = "basic-water-energy";

export const LESSONS: Lesson[] = [
  {
    id: "screen",
    title: msg("The goal of the game and the screen"),
    summary: msg("Prize cards, Active Pokémon, Bench, hand, deck and discard pile."),
    scenario: {
      filler: FIRE,
      p1: {
        active: { def: "ponyta-0thf", energy: [FIRE] },
        bench: ["larvesta-1hw1"],
        hand: ["cheren-0ywq", FIRE, "potion-01i0"],
      },
      p2: { active: { def: "spheal-1sqb", energy: [WATER] }, bench: ["wingull-0isy"], deck: Array(10).fill(WATER) },
    },
    steps: [
      {
        next: true,
        text: msg(
          "Welcome! This tutorial teaches you the **Pokémon Trading Card Game** through short game excerpts. Two players face off, each with a deck of 60 cards.",
        ),
      },
      {
        next: true,
        target: ".side.mine .prizes",
        text: msg(
          "These are your **Prize cards**: 6 face-down cards set aside at the start. Each time you Knock Out an opponent's Pokémon, you take one (two for a Pokémon ex). Take all of yours to win.",
        ),
      },
      {
        next: true,
        target: ".side.mine .active-spot",
        text: msg(
          "Your **Active Pokémon**: the one that attacks and receives the attacks. You also win if your opponent has no Pokémon left in play.",
        ),
      },
      {
        next: true,
        target: ".side.mine .bench",
        text: msg(
          "Your **Bench**: up to 5 Pokémon waiting. They can replace your Active Pokémon when it is Knocked Out or retreats.",
        ),
      },
      {
        next: true,
        target: ".hand",
        text: msg(
          "Your **hand**: Pokémon, **Trainer** cards (Items, Supporters, Stadiums, Tools) and **Energy** cards. Your opponent only sees how many there are.",
        ),
      },
      {
        next: true,
        target: ".side.mine .side-right",
        text: msg(
          "Your **deck** and your **discard pile**. You draw a card at the start of each turn: a player who cannot draw loses the game.",
        ),
      },
      {
        next: true,
        target: ".side.top",
        text: msg("At the top, your opponent's side: the same zones, seen from the other side of the table."),
      },
      {
        allow: ["endTurn"],
        until: turnEnded,
        target: ".main-button.end-turn",
        text: msg("Your turn is over when you attack or when you end it. Press **End turn**."),
        hint: msg("Press End turn to continue."),
      },
      {
        until: myMain,
        text: msg("Your opponent plays their turn: they draw a card, then they attack your Active Pokémon."),
      },
      {
        next: true,
        target: ".drawer-toggle",
        text: msg(
          "Their attack, Powder Snow, made your Pokémon **Asleep**: it can neither attack nor retreat, and a coin flip between turns may wake it up. The ☰ button holds the **log** of the game and the options. Lesson complete!",
        ),
      },
    ],
  },
  {
    id: "attack",
    title: msg("Energy and attacks"),
    summary: msg("Attach an Energy card, attack and take a Prize card."),
    scenario: {
      filler: FIRE,
      p1: { active: { def: "litleo-1e27", energy: [FIRE] }, hand: [FIRE] },
      p2: { active: { def: "wingull-0isy", damage: 30 }, bench: ["spheal-1sqb"], deck: Array(10).fill(WATER) },
    },
    steps: [
      {
        next: true,
        target: ".side.mine .active-spot",
        text: msg(
          "To attack, a Pokémon needs **Energy**. Litleo's attack Flare costs {R}{C}: one Fire Energy and one Energy of any type. It has one Fire Energy.",
        ),
      },
      {
        allow: [{ attach: "Basic Fire Energy", target: "Litleo" }],
        until: energyOn("Litleo", 2),
        target: ".hand",
        text: msg(
          "You may attach **one Energy card per turn** from your hand. Select the Fire Energy in your hand, then your Active Litleo.",
        ),
        hint: msg("Attach the Fire Energy to Litleo."),
      },
      {
        allow: [{ attack: 0 }],
        until: prizesLeft(5),
        target: ".side.mine .active-spot",
        text: msg(
          "Litleo can attack now. Select it, then press **Flare**: 30 damage. Wingull already has 30 damage and 60 HP: the button announces the Knock Out.",
        ),
        hint: msg("Select Litleo, then attack with Flare."),
      },
      {
        next: true,
        target: ".side.mine .prizes",
        text: msg(
          "Wingull is **Knocked Out**: it goes to the discard pile with its cards, and you take a Prize card. Your opponent must choose a new Active Pokémon from their Bench. Lesson complete!",
        ),
      },
    ],
  },
  {
    id: "evolve",
    title: msg("The Bench and evolution"),
    summary: msg("Put a Basic Pokémon on the Bench, evolve your Active Pokémon and attack."),
    scenario: {
      filler: FIRE,
      p1: {
        active: { def: "ponyta-14k0", energy: [FIRE] },
        hand: ["larvesta-1hw1", "rapidash-1170", FIRE],
      },
      p2: { active: "wingull-0isy", bench: ["spheal-1sqb"], deck: Array(10).fill(WATER) },
    },
    steps: [
      {
        allow: [{ playBasic: "Larvesta" }],
        until: inPlayNamed("Larvesta"),
        target: ".hand",
        text: msg(
          "**Basic Pokémon** are put on your Bench from your hand, as many as you like (5 at most on the Bench). Play Larvesta: select it, then **Play**.",
        ),
        hint: msg("Put Larvesta on your Bench."),
      },
      {
        allow: [{ evolve: "Rapidash", target: "Ponyta" }],
        until: inPlayNamed("Rapidash"),
        target: ".hand",
        text: msg(
          "Rapidash **evolves** from Ponyta: put it on Ponyta, which keeps its Energy and its damage. Not on the first turn of the game, nor on a Pokémon put into play this turn. Select Rapidash, then Ponyta.",
        ),
        hint: msg("Evolve Ponyta into Rapidash."),
      },
      {
        allow: [{ attach: "Basic Fire Energy", target: "Rapidash" }],
        until: energyOn("Rapidash", 2),
        target: ".hand",
        text: msg("Rapidash's attack Burning Run costs {R}{C}. Attach your Fire Energy to Rapidash."),
        hint: msg("Attach the Fire Energy to Rapidash."),
      },
      {
        allow: [{ attack: 0 }],
        until: prizesLeft(5),
        target: ".side.mine .active-spot",
        text: msg(
          "Attack with **Burning Run**: 60 damage, and a coin flip for 60 more. Wingull has 60 HP: Knocked Out either way.",
        ),
        hint: msg("Select Rapidash, then attack with Burning Run."),
      },
      {
        next: true,
        text: msg("A Stage 1 Pokémon evolves from a Basic Pokémon, a Stage 2 from a Stage 1. Lesson complete!"),
      },
    ],
  },
  {
    id: "trainers",
    title: msg("Trainer cards and retreating"),
    summary: msg("Play an Item and a Supporter, retreat your Active Pokémon, then attack."),
    scenario: {
      filler: FIRE,
      p1: {
        active: { def: "litleo-09p5", energy: [FIRE], damage: 40 },
        bench: [{ def: "pyroar-02oq", energy: [FIRE] }],
        hand: ["potion-01i0", "cheren-0ywq", FIRE],
      },
      p2: { active: { def: "marill-0iih", damage: 20 }, bench: ["wingull-0isy"], deck: Array(10).fill(WATER) },
    },
    steps: [
      {
        allow: [{ trainer: "Potion" }],
        until: damageAtMost("Litleo", 10),
        target: ".hand",
        text: msg(
          "**Items** can be played as many as you like during your turn. Potion heals 30 damage from one of your Pokémon: play it on Litleo.",
        ),
        hint: msg("Play Potion and heal Litleo."),
      },
      {
        allow: [{ trainer: "Cheren" }],
        until: discarded("Cheren"),
        target: ".hand",
        text: msg("**Supporters** are stronger, but only one per turn. Play Cheren to draw 3 cards."),
        hint: msg("Play Cheren."),
      },
      {
        allow: [{ retreat: "Pyroar" }],
        until: activeIs("Pyroar"),
        target: ".side.mine .active-spot",
        text: msg(
          "Pyroar on your Bench is ready to fight. Your Active Pokémon may **retreat** once per turn: discard Energy from it as its Retreat Cost shows (one for Litleo). Select Litleo, **Retreat**, then Pyroar.",
        ),
        hint: msg("Retreat Litleo and switch in Pyroar."),
      },
      {
        allow: [{ attach: "Basic Fire Energy", target: "Pyroar" }],
        until: energyOn("Pyroar", 2),
        target: ".hand",
        text: msg("Attach a Fire Energy to Pyroar: Fire Mane costs {R}{C}."),
        hint: msg("Attach a Fire Energy to Pyroar."),
      },
      {
        allow: [{ attack: 0 }],
        until: prizesLeft(5),
        target: ".side.mine .active-spot",
        text: msg("Attack with **Fire Mane**: 50 damage, enough for Marill, which already has 20."),
        hint: msg("Select Pyroar, then attack with Fire Mane."),
      },
      {
        next: true,
        text: msg("Stadium cards stay in play for both players; Tools are attached to a Pokémon. Lesson complete!"),
      },
    ],
  },
  {
    id: "weakness",
    title: msg("Weakness and Special Conditions"),
    summary: msg("Double damage on a Pokémon's Weakness; Asleep, Paralyzed, Confused, Poisoned and Burned."),
    scenario: {
      filler: WATER,
      p1: { active: { def: "sealeo-17e7", energy: [WATER, WATER] } },
      p2: { active: "pyroar-02oq", bench: ["litleo-1e27"], deck: Array(10).fill(FIRE) },
    },
    steps: [
      {
        next: true,
        target: ".side.top .active-spot",
        text: msg(
          "Look at the bottom of your opponent's Pyroar: **Weakness** {W} ×2. Damage from an attack of a Water Pokémon is doubled against it.",
        ),
      },
      {
        allow: [{ attack: 1 }],
        until: prizesLeft(5),
        target: ".side.mine .active-spot",
        text: msg(
          "Sealeo's Ice Ball does 60 damage, so 120 against Pyroar: exactly its HP. The attack button already counts Weakness and announces the Knock Out. Attack!",
        ),
        hint: msg("Select Sealeo, then attack with Ice Ball."),
      },
      {
        next: true,
        text: msg(
          "**Resistance** works the other way: −30 damage. Weakness and Resistance only count against the Active Pokémon, not the Bench.",
        ),
      },
      {
        next: true,
        text: msg(
          "**Special Conditions**: Asleep, Paralyzed and Confused turn the card (only one at a time); Poisoned and Burned put damage counters between turns, during the **Pokémon Checkup**. Retreating or evolving removes them all. Lesson complete!",
        ),
      },
    ],
  },
];
