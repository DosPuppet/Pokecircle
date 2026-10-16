/** The player's own decks, kept in this browser (`pocketmate.decks`), next to the preconstructed decks. */
import type { DeckEntries, DeckList } from "@pocketmate/cards";
import { validateDeck } from "@pocketmate/cards/decklist";
import { PRECONS } from "@pocketmate/cards/decks";
import { create } from "zustand";

const KEY = "pocketmate.decks";

export interface UserDeck {
  id: string;
  name: string;
  main: DeckEntries;
  /** Cover card (definition id). */
  cover?: string;
  updated: number;
}

function load(): UserDeck[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "[]") as UserDeck[];
    return Array.isArray(raw) ? raw.filter((d) => d && typeof d.id === "string" && Array.isArray(d.main)) : [];
  } catch {
    return [];
  }
}

interface DecksStore {
  decks: UserDeck[];
  save(d: UserDeck): void;
  remove(id: string): void;
}

export const useDecks = create<DecksStore>((set, get) => {
  const persist = (decks: UserDeck[]) => {
    try {
      localStorage.setItem(KEY, JSON.stringify(decks));
    } catch {}
    set({ decks });
  };
  return {
    decks: load(),
    save(d) {
      const others = get().decks.filter((x) => x.id !== d.id);
      persist([{ ...d, updated: Date.now() }, ...others]);
    },
    remove(id) {
      persist(get().decks.filter((x) => x.id !== id));
    },
  };
});

export function newDeckId(): string {
  return `u${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
}

/** Every deck the player can choose: preconstructed, then their own. */
export function allDecks(): (DeckList & { user?: boolean })[] {
  const own = useDecks
    .getState()
    .decks.map((d) => ({ id: d.id, name: d.name, main: d.main, ...(d.cover ? { cover: d.cover } : {}), user: true }));
  return [...PRECONS, ...own];
}

export function deckById(id: string): DeckList | undefined {
  return allDecks().find((d) => d.id === id);
}

/** A deck that can be played in Standard (legal, every card implemented). */
export function playable(entries: DeckEntries): boolean {
  return validateDeck(entries, "standard").length === 0;
}
