/**
 * The lobby: the top bar (decks, online play, tutorial, replays, settings), your deck against the AI's deck with the
 * AI level, and the big "Play against the AI" button; the chosen playmat is the background.
 */
import { AI_LEVELS, type AiLevel } from "@pokecircle/ai";
import { useState } from "react";
import { resolveBoard } from "./boardThemes";
import { DeckDialog, DeckSummary } from "./decks/DeckPicker";
import { LangToggle } from "./LangToggle";
import { useLoc, useT } from "./localize";
import { BoardControl, PaceControl, RelayToggle, SoundControl } from "./Settings";
import { useGame } from "./store";

export function Home() {
  const t = useT();
  const loc = useLoc();
  const deck = useGame((s) => s.deck);
  const aiDeck = useGame((s) => s.aiDeck);
  const aiLevel = useGame((s) => s.aiLevel);
  const setSettings = useGame((s) => s.setSettings);
  const startGame = useGame((s) => s.startGame);
  const resumeGame = useGame((s) => s.resumeGame);
  const hasSaved = useGame((s) => s.hasSaved);
  const notice = useGame((s) => s.notice);
  const notify = useGame((s) => s.notify);
  const go = useGame((s) => s.go);
  const openReplayFile = useGame((s) => s.openReplayFile);
  const board = useGame((s) => resolveBoard(s.board, 0));
  const [choosing, setChoosing] = useState<"mine" | "ai" | null>(null);
  const LEVEL: Record<AiLevel, string> = { beginner: t("Beginner"), medium: t("Intermediate"), expert: t("Expert") };
  const ABOUT: Record<AiLevel, string> = {
    beginner: t("The AI plays simply and makes mistakes."),
    medium: t("The AI plays sensibly, one move at a time."),
    expert: t("The AI looks ahead to your answer (it thinks longer)."),
  };
  return (
    <div className="home" data-board={board}>
      <header className="home-top">
        <h1 className="brand">
          Pokecircle<small>alpha</small>
        </h1>
        <button type="button" className="btn" onClick={() => go("decks")}>
          {t("My decks")}
        </button>
        <button type="button" className="btn" onClick={() => go("online")}>
          {t("Play online")}
        </button>
        <button type="button" className="btn learn" onClick={() => go("tutorial")}>
          {t("Learn to play")}
        </button>
        <label className="btn file-btn">
          {t("Watch a game (file)")}
          <input
            type="file"
            accept=".json,application/json"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) void f.text().then(openReplayFile);
            }}
          />
        </label>
        <span className="spacer" />
        <SoundControl />
        <LangToggle />
        <details className="lobby-more">
          <summary className="icon-btn" title={t("Settings")} aria-label={t("Settings")}>
            ⚙
          </summary>
          <div className="lobby-more-box">
            <PaceControl />
            <BoardControl />
            <RelayToggle />
          </div>
        </details>
      </header>
      <main className="home-main">
        {notice ? (
          <button type="button" className="notice" onClick={() => notify("")}>
            {loc(notice)}
          </button>
        ) : null}
        {hasSaved ? (
          <div className="setting-line">
            <button type="button" className="btn primary big resume" onClick={resumeGame}>
              {t("Resume the game in progress")}
            </button>
          </div>
        ) : null}
        <div className="lobby-sides">
          <section className="side-panel">
            <h2>{t("Your deck")}</h2>
            <DeckSummary id={deck} onChange={() => setChoosing("mine")} />
          </section>
          <div className="vs">VS</div>
          <section className="side-panel ai-side">
            <h2>{t("The AI's deck")}</h2>
            <DeckSummary id={aiDeck} onChange={() => setChoosing("ai")} />
            <div className="setting-line">
              <span>{t("AI level")}</span>
              <div className="seg ai-level">
                {AI_LEVELS.map((l) => (
                  <button type="button" key={l} className={aiLevel === l ? "on" : ""} onClick={() => setSettings({ aiLevel: l })}>
                    {LEVEL[l]}
                  </button>
                ))}
              </div>
            </div>
            <p className="tagline small">{ABOUT[aiLevel]}</p>
          </section>
        </div>
        <p className="lobby-tips">
          {t(
            "Drag a card onto its place to play it, or click it. Space: main button · Esc: close · M: sound. The ☰ button of the game holds the options and the log.",
          )}
        </p>
        <p className="legal">
          {t(
            "Free, non-commercial fan project. Pokémon and the Pokémon Trading Card Game are trademarks of Nintendo, Creatures and GAME FREAK; this project is not endorsed by them. Card images and data: TCGdex.",
          )}
        </p>
      </main>
      <div className="play-bar">
        <button type="button" className="main-button hot play-ai" onClick={startGame}>
          {t("Play against the AI")}
        </button>
      </div>
      {choosing ? (
        <DeckDialog
          value={choosing === "mine" ? deck : aiDeck}
          onPick={(id) => setSettings(choosing === "mine" ? { deck: id } : { aiDeck: id })}
          onClose={() => setChoosing(null)}
        />
      ) : null}
    </div>
  );
}
