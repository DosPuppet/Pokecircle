/**
 * The app was called PocketMate: its settings, decks, saved game, online seat and lessons were kept under
 * `pocketmate.*` keys. They move once to `pokecircle.*` (imported first by main.tsx, before the stores read them).
 */
const OLD = "pocketmate.";
const NEW = "pokecircle.";

try {
  for (const key of Object.keys(localStorage)) {
    if (!key.startsWith(OLD)) continue;
    const next = NEW + key.slice(OLD.length);
    const value = localStorage.getItem(key);
    if (value !== null && localStorage.getItem(next) === null) localStorage.setItem(next, value);
    localStorage.removeItem(key);
  }
} catch {
  // storage unavailable: nothing to move
}
