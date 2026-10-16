import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { playSound, unlockAudio, useAudio } from "./audio/sfx";
import { decodeDeck, sharedDeckData } from "./decks/share";
import { prefetchGameWorker } from "./session";
import { savedOnline, useGame } from "./store";
import "./styles.css";

// Dev mode: access to the store for the Playwright scripts.
if (import.meta.env.DEV) (window as unknown as { __pm: typeof useGame }).__pm = useGame;

// Production: service worker (application cached, offline start; public/sw.js).
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  navigator.serviceWorker
    .register("/sw.js")
    .then(() => navigator.serviceWorker.ready)
    .then(() => setTimeout(prefetchGameWorker, 3000))
    .catch((e) => console.warn("Service worker not registered:", e));
}

const root = document.getElementById("root");
if (root)
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );

// Sound: unlocked on the first gesture (autoplay policy), button clicks, M = mute.
document.addEventListener("pointerdown", unlockAudio, { capture: true });
document.addEventListener(
  "click",
  (e) => {
    const btn = (e.target as HTMLElement | null)?.closest?.("button.btn");
    if (btn && !(btn as HTMLButtonElement).disabled) playSound("click");
  },
  { capture: true },
);
document.addEventListener("keydown", (e) => {
  const t = e.target as HTMLElement | null;
  if (e.key.toLowerCase() !== "m" || e.ctrlKey || e.metaKey || e.altKey) return;
  if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
  useAudio.getState().toggleMute();
});

// A deck link (#deck=…, scanned QR code): the deck builder offers to import it. Otherwise, page reopened: resume the
// online game (by its token); an invitation link (?room=CODE) opens online play.
const deckData = sharedDeckData(location.hash);
if (deckData) {
  history.replaceState(null, "", location.pathname + location.search);
  void decodeDeck(deckData).then((text) => {
    if (text) useGame.setState({ screen: "decks", sharedDeck: text });
  });
} else if (new URLSearchParams(location.search).has("room") && !savedOnline()) useGame.getState().go("online");
else if (savedOnline()) useGame.getState().rejoinRoom();
