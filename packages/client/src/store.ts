/** Interface state (P0 shell; the game state arrives in P3). */
import { create } from "zustand";
import { type Lang, setTextLang } from "./translate";

export type Screen = "home" | "decks" | "game" | "online";

const LANG_KEY = "pocketmate.lang";

function storedLang(): Lang {
  try {
    const v = localStorage.getItem(LANG_KEY);
    return v === "en" ? "en" : "fr";
  } catch {
    return "fr";
  }
}

interface Store {
  screen: Screen;
  lang: Lang;
  setLang: (lang: Lang) => void;
  go: (screen: Screen) => void;
}

export const useGame = create<Store>((set) => {
  const lang = storedLang();
  setTextLang(lang);
  return {
    screen: "home",
    lang,
    setLang: (l) => {
      setTextLang(l);
      try {
        localStorage.setItem(LANG_KEY, l);
      } catch {}
      set({ lang: l });
    },
    go: (screen) => set({ screen }),
  };
});
