/**
 * Preconstructed decks (`decks/*.json`): a TCG Live list each, resolved at load time. A deck is playable when all its
 * cards are implemented (`validateDeck`).
 */

import meta_alakazam from "../decks/meta-alakazam.json";
import meta_basic_box from "../decks/meta-basic-box.json";
import meta_dragapult from "../decks/meta-dragapult.json";
import meta_festival_lead from "../decks/meta-festival-lead.json";
import meta_hydrapple from "../decks/meta-hydrapple.json";
import meta_mega_lopunny from "../decks/meta-mega-lopunny.json";
import meta_ns_zoroark from "../decks/meta-ns-zoroark.json";
import meta_slowking from "../decks/meta-slowking.json";
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
  /** Where a meta list comes from. */
  source?: string;
}

const FILES: DeckFile[] = [
  starterFire,
  starterWater,
  meta_dragapult,
  meta_slowking,
  meta_basic_box,
  meta_ns_zoroark,
  meta_alakazam,
  meta_festival_lead,
  meta_mega_lopunny,
  meta_hydrapple,
];

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
