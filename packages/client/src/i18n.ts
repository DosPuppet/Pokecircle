/**
 * Texts of the game screen built from the view and the events: log lines (`describeEvent`), labels of Special
 * Conditions and types. Lines are engine-style texts (`msg`, card references `⟦defId⟧`), rendered in the interface
 * language by `localizeText`, so the log follows a change of language.
 */
import {
  cardRef,
  type GameEvent,
  type GameView,
  msg,
  type PlayerId,
  type PokemonId,
  type SpecialCondition,
} from "@pokecircle/engine";
import { cardName } from "./cards";
import { type Lang, localize } from "./translate";

/**
 * A text with card references, in a language; Energy symbols ({G}…) become type names, or stay as they are with
 * `symbols` (drawn by `RichText`).
 */
export function localizeText(text: string, lang: Lang, symbols = false): string {
  const out = localize(text, lang, (defId) => cardName(defId, lang));
  return symbols ? out : out.replace(/\{([GRWLPFDMNCY])\}/g, (_, t: string) => localize(TYPE_LABEL[t] as string, lang, (d) => d));
}

export const CONDITION_LABEL: Record<SpecialCondition, string> = {
  asleep: msg("Asleep"),
  burned: msg("Burned"),
  confused: msg("Confused"),
  paralyzed: msg("Paralyzed"),
  poisoned: msg("Poisoned"),
};

export const TYPE_LABEL: Record<string, string> = {
  G: msg("Grass"),
  R: msg("Fire"),
  W: msg("Water"),
  L: msg("Lightning"),
  P: msg("Psychic"),
  F: msg("Fighting"),
  D: msg("Darkness"),
  M: msg("Metal"),
  N: msg("Dragon"),
  C: msg("Colorless"),
  Y: msg("Fairy"),
};

/** Remembers the top card of each Pokémon seen, to name Pokémon that left play (Knocked Out). */
const known = new Map<PokemonId, string>();

export function rememberPokemon(view: GameView): void {
  for (const pk of Object.values(view.pokemon)) {
    const top = view.faces[pk.cards[pk.cards.length - 1] ?? ""];
    if (top) known.set(pk.id, top);
  }
}

function pokemonRef(view: GameView, id: PokemonId | null | undefined): string {
  if (!id) return "?";
  const pk = view.pokemon[id];
  const top = pk ? view.faces[pk.cards[pk.cards.length - 1] ?? ""] : undefined;
  const defId = top ?? known.get(id);
  return defId ? cardRef(defId) : "?";
}

/** The other player's name (lines about the viewer use "you" templates). */
function who(view: GameView, p: PlayerId): string {
  return view.players[p]?.name ?? "?";
}

/** One log line for an event, or null for events not worth a line. */
export function describeEvent(e: GameEvent, view: GameView): string | null {
  const me = view.me;
  switch (e.type) {
    case "coinFlip":
      if (e.player === me) return e.heads ? msg("Your coin flip: heads") : msg("Your coin flip: tails");
      return e.heads
        ? msg("{who}: coin flip, heads", { who: who(view, e.player) })
        : msg("{who}: coin flip, tails", { who: who(view, e.player) });
    case "firstPlayer":
      return e.player === me ? msg("You go first") : msg("{who} goes first", { who: who(view, e.player) });
    case "mulligan":
      return e.player === me ? msg("You take a mulligan") : msg("{who} takes a mulligan", { who: who(view, e.player) });
    case "setupDone":
      return msg("The Pokémon are revealed: the game begins");
    case "turnStart":
      return e.player === me
        ? msg("Turn {n}: your turn", { n: e.turn })
        : msg("Turn {n}: {who}'s turn", { n: e.turn, who: who(view, e.player) });
    case "draw":
      if (e.player !== me)
        return e.cards.length === 1 ? null : msg("{who} draws {n} cards", { who: who(view, e.player), n: e.cards.length });
      return e.defIds?.length === 1
        ? msg("You draw {card}", { card: cardRef(e.defIds[0] as string) })
        : msg("You draw {n} cards", { n: e.cards.length });
    case "playBasic":
      return e.player === me
        ? msg("You put {card} onto your Bench", { card: cardRef(e.defId) })
        : msg("{who} puts {card} onto the Bench", { who: who(view, e.player), card: cardRef(e.defId) });
    case "evolve":
      return e.player === me
        ? msg("You evolve {from} into {card}", { from: cardRef(e.from), card: cardRef(e.defId) })
        : msg("{who} evolves {from} into {card}", { who: who(view, e.player), from: cardRef(e.from), card: cardRef(e.defId) });
    case "devolve":
      return msg("{card} devolves", { card: cardRef(e.defId) });
    case "attach":
      return e.player === me
        ? msg("You attach {card} to {pokemon}", { card: cardRef(e.defId), pokemon: pokemonRef(view, e.pokemon) })
        : msg("{who} attaches {card} to {pokemon}", {
            who: who(view, e.player),
            card: cardRef(e.defId),
            pokemon: pokemonRef(view, e.pokemon),
          });
    case "playTrainer":
      return e.player === me
        ? msg("You play {card}", { card: cardRef(e.defId) })
        : msg("{who} plays {card}", { who: who(view, e.player), card: cardRef(e.defId) });
    case "stadium":
      return null;
    case "ability":
      if (!e.name) return msg("Effect of {card}", { card: cardRef(e.defId) });
      return e.player === me
        ? msg("You use the Ability {name} of {card}", { name: e.name, card: cardRef(e.defId) })
        : msg("{who} uses the Ability {name} of {card}", { who: who(view, e.player), name: e.name, card: cardRef(e.defId) });
    case "retreat":
      return msg("{from} retreats: {to} becomes the Active Pokémon", {
        from: pokemonRef(view, e.from),
        to: pokemonRef(view, e.to),
      });
    case "switch":
      return msg("{to} replaces {from} in the Active Spot", { from: pokemonRef(view, e.from), to: pokemonRef(view, e.to) });
    case "promote":
      return msg("{pokemon} becomes the Active Pokémon", { pokemon: pokemonRef(view, e.pokemon) });
    case "attack":
      return msg("{pokemon} uses {attack}", { pokemon: cardRef(e.defId), attack: e.name });
    case "attackFails":
      return msg("The attack does nothing");
    case "damage":
      if (e.prevented) return msg("{pokemon}: the damage is prevented", { pokemon: pokemonRef(view, e.target) });
      if (!e.amount) return null;
      return e.weakness
        ? msg("{pokemon} takes {n} damage (Weakness)", { pokemon: pokemonRef(view, e.target), n: e.amount })
        : e.resistance
          ? msg("{pokemon} takes {n} damage (Resistance)", { pokemon: pokemonRef(view, e.target), n: e.amount })
          : msg("{pokemon} takes {n} damage", { pokemon: pokemonRef(view, e.target), n: e.amount });
    case "counters":
      return msg("{n} damage counter(s) on {pokemon}", { pokemon: pokemonRef(view, e.target), n: e.n });
    case "heal":
      return msg("{pokemon} is healed of {n} damage", { pokemon: pokemonRef(view, e.target), n: e.amount });
    case "condition":
      return e.on
        ? msg("{pokemon} is now {cond}", { pokemon: pokemonRef(view, e.target), cond: CONDITION_LABEL[e.cond] })
        : msg("{pokemon} is no longer {cond}", { pokemon: pokemonRef(view, e.target), cond: CONDITION_LABEL[e.cond] });
    case "knockOut":
      return msg("{pokemon} is Knocked Out", { pokemon: cardRef(e.defId) });
    case "prizes":
      return e.player === me
        ? msg("You take {n} Prize card(s)", { n: e.cards.length })
        : msg("{who} takes {n} Prize card(s)", { who: who(view, e.player), n: e.cards.length });
    case "move":
      if (e.to === "discard" && e.from === "hand" && e.defId)
        return e.player === me
          ? msg("You discard {card}", { card: cardRef(e.defId) })
          : msg("{who} discards {card}", { who: who(view, e.player), card: cardRef(e.defId) });
      return null;
    case "reveal":
      return e.player === me
        ? msg("You reveal {cards}", { cards: e.defIds.map(cardRef).join(", ") })
        : msg("{who} reveals {cards}", { who: who(view, e.player), cards: e.defIds.map(cardRef).join(", ") });
    case "checkup":
      return null;
    case "suddenDeath":
      return msg("Both players win at the same time: Sudden Death! A new game with 1 Prize card each");
    case "endTurn":
      return null;
    case "gameOver":
      if (!e.winner) return msg("The game is a draw");
      return e.winner === me ? msg("You win!") : msg("{who} wins", { who: who(view, e.winner) });
    case "message":
      return e.text;
    default:
      return null;
  }
}
