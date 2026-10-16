/**
 * Preconstructed decks (`decks/*.json`): a TCG Live list each, resolved at load time. A deck is playable when all its
 * cards are implemented (`validateDeck`).
 */
import starterFire from "../decks/starter-fire.json";
import starterWater from "../decks/starter-water.json";
import { type DeckList, parseDeckList } from "./decklist";
import { CARDS } from "./index";

interface DeckFile {
  id: string;
  name: string;
  fr?: string;
  cover?: string;
  list: string;
  format?: DeckList["format"];
}

const FILES: DeckFile[] = [starterFire, starterWater];

function load(f: DeckFile): DeckList {
  const { entries, errors } = parseDeckList(f.list);
  if (errors.length) throw new Error(`deck ${f.id}: ${errors.join("; ")}`);
  const cover = Object.values(CARDS).find((d) => d.name === f.cover && entries.some((e) => e[1] === d.id))?.id;
  const deck: DeckList = { id: f.id, name: f.name, main: entries };
  if (f.fr) deck.fr = f.fr;
  if (cover) deck.cover = cover;
  if (f.format) deck.format = f.format;
  return deck;
}

export const PRECONS: DeckList[] = FILES.map(load);
