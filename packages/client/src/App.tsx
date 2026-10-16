import { DeckBuilder } from "./decks/DeckBuilder";
import { GameScreen } from "./game/GameScreen";
import { Home } from "./Home";
import { Online } from "./Online";
import { useGame } from "./store";
import { TutorialMenu } from "./tutorial/TutorialMenu";

export function App() {
  const screen = useGame((s) => s.screen);
  if (screen === "game") return <GameScreen />;
  if (screen === "online") return <Online />;
  if (screen === "decks") return <DeckBuilder />;
  if (screen === "tutorial") return <TutorialMenu />;
  return <Home />;
}
