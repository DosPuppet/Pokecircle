/** The end of the game: who won and why. */
import type { GameView } from "@pocketmate/engine";
import { useT } from "../localize";
import { useGame } from "../store";

export function EndOverlay({ view }: { view: GameView }) {
  const t = useT();
  const queue = useGame((s) => s.queue.length);
  const startGame = useGame((s) => s.startGame);
  const quit = useGame((s) => s.quitGame);
  if (!view.over || queue) return null;
  const won = view.winner === view.me;
  const reason =
    view.endReason === "prizes"
      ? t("All the Prize cards were taken.")
      : view.endReason === "noPokemon"
        ? t("No Pokémon left in play.")
        : view.endReason === "deckOut"
          ? t("A player could not draw at the start of their turn.")
          : view.endReason === "concede"
            ? t("A player conceded.")
            : view.endReason === "suddenDeath"
              ? t("Both players won at the same time: Sudden Death.")
              : t("The game is a draw.");
  return (
    <div className="modal end">
      <div className="modal-box">
        <div className={`end-title${won ? " won" : view.winner ? " lost" : ""}`}>
          {won ? t("Victory!") : view.winner ? t("Defeat") : t("Draw")}
        </div>
        <div className="end-reason">{reason}</div>
        <div className="prompt-actions">
          <button type="button" className="btn primary" onClick={startGame}>
            {t("Play again")}
          </button>
          <button type="button" className="btn" onClick={quit}>
            {t("Home")}
          </button>
        </div>
      </div>
    </div>
  );
}
