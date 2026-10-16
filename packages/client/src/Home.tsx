/** Home screen: choose your deck, the opponent's deck and the AI level, then play (or resume the saved game). */
import { AI_LEVELS, type AiLevel } from "@pocketmate/ai";
import { PRECONS } from "@pocketmate/cards/decks";
import { CardImage } from "./game/CardImage";
import { LangToggle } from "./LangToggle";
import { useLoc, useT } from "./localize";
import { useGame } from "./store";

export function Home() {
  const t = useT();
  const loc = useLoc();
  const lang = useGame((s) => s.lang);
  const deck = useGame((s) => s.deck);
  const aiDeck = useGame((s) => s.aiDeck);
  const aiLevel = useGame((s) => s.aiLevel);
  const setSettings = useGame((s) => s.setSettings);
  const startGame = useGame((s) => s.startGame);
  const resumeGame = useGame((s) => s.resumeGame);
  const hasSaved = useGame((s) => s.hasSaved);
  const notice = useGame((s) => s.notice);
  const notify = useGame((s) => s.notify);
  const LEVEL: Record<AiLevel, string> = { beginner: t("Beginner"), medium: t("Intermediate"), expert: t("Expert") };
  const deckList = (value: string, onPick: (id: string) => void) => (
    <div className="deck-list">
      {PRECONS.map((p) => (
        <button type="button" key={p.id} className={`deck-tile${value === p.id ? " chosen" : ""}`} onClick={() => onPick(p.id)}>
          <CardImage defId={p.cover} />
          <span>{lang === "fr" ? (p.fr ?? p.name) : p.name}</span>
        </button>
      ))}
    </div>
  );
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
        <div>
          <button type="button" className="btn primary big" onClick={startGame}>
            {t("Play against the AI")}
          </button>
        </div>
      </main>
    </div>
  );
}
