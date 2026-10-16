import { DeckBuilder } from "./decks/DeckBuilder";
import { GameScreen } from "./game/GameScreen";
import { Home } from "./Home";
import { Online } from "./Online";
import { useGame } from "./store";

export function App() {
  const screen = useGame((s) => s.screen);
  if (screen === "game") return <GameScreen />;
  if (screen === "online") return <Online />;
  if (screen === "decks") return <DeckBuilder />;
  return <Home />;
}
