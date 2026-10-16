import { GameScreen } from "./game/GameScreen";
import { Home } from "./Home";
import { useGame } from "./store";

export function App() {
  const screen = useGame((s) => s.screen);
  return screen === "game" ? <GameScreen /> : <Home />;
}
