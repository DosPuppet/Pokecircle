/** Home screen: choose your deck, the opponent's deck and the AI level, then play (or resume the saved game). */
import { AI_LEVELS, type AiLevel } from "@pocketmate/ai";
import { DeckPicker } from "./decks/DeckPicker";
import { LangToggle } from "./LangToggle";
import { useLoc, useT } from "./localize";
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
  const LEVEL: Record<AiLevel, string> = { beginner: t("Beginner"), medium: t("Intermediate"), expert: t("Expert") };
  const deckList = (value: string, onPick: (id: string) => void) => <DeckPicker value={value} onPick={onPick} />;
  return (
    <div className="home">
      <header className="home-top">
        <h1 className="brand">PocketMate</h1>
        <LangToggle />
      </header>
      <main className="home-main">
        <p className="tagline">{t("Pokémon Trading Card Game: play against the AI or online.")}</p>
        {notice ? (
          <button type="button" className="notice" onClick={() => notify("")}>
            {loc(notice)}
          </button>
        ) : null}
        {hasSaved ? (
          <button type="button" className="btn primary big" onClick={resumeGame}>
            {t("Resume the game in progress")}
          </button>
        ) : null}
        <h2>{t("Your deck")}</h2>
        {deckList(deck, (id) => setSettings({ deck: id }))}
        <h2>{t("The opponent's deck")}</h2>
        {deckList(aiDeck, (id) => setSettings({ aiDeck: id }))}
        <h2>{t("AI level")}</h2>
        <div className="seg">
          {AI_LEVELS.map((l) => (
            <button type="button" key={l} className={aiLevel === l ? "on" : ""} onClick={() => setSettings({ aiLevel: l })}>
              {LEVEL[l]}
            </button>
          ))}
        </div>
        <div className="home-actions">
          <button type="button" className="btn primary big" onClick={startGame}>
            {t("Play against the AI")}
          </button>
          <button type="button" className="btn big" onClick={() => go("online")}>
            {t("Play online")}
          </button>
          <button type="button" className="btn big" onClick={() => go("decks")}>
            {t("My decks")}
          </button>
        </div>
      </main>
    </div>
  );
}
