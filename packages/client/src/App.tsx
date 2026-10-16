import { LangToggle } from "./LangToggle";
import { useT } from "./localize";

export function App() {
  const t = useT();
  return (
    <div className="home">
      <header className="home-top">
        <h1 className="brand">PocketMate</h1>
        <LangToggle />
      </header>
      <main className="home-main">
        <p className="tagline">{t("Pokémon Trading Card Game: play against the AI or online.")}</p>
      </main>
    </div>
  );
}
