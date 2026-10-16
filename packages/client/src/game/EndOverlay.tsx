/** The end of the game: who won and why. */
import type { GameView } from "@pokecircle/engine";
import { useT } from "../localize";
import { useGame } from "../store";

export function EndOverlay({ view }: { view: GameView }) {
  const t = useT();
  const queue = useGame((s) => s.queue.length);
  const startGame = useGame((s) => s.startGame);
  const quit = useGame((s) => s.quitGame);
  const mode = useGame((s) => s.mode);
  const room = useGame((s) => s.online.room);
  const rematch = useGame((s) => s.rematch);
  const nextGame = useGame((s) => s.nextGame);
  const exportGame = useGame((s) => s.exportGame);
  if (!view.over || queue) return null;
  const me = room?.players.find((p) => p.seat === room.seat);
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
            : view.endReason === "effect"
              ? t("A card's effect decided the game.")
              : t("The game is a draw.");
  return (
    <div className="modal end">
      <div className="modal-box">
        <div className={`end-title${won ? " won" : view.winner ? " lost" : ""}`}>
          {won ? t("Victory!") : view.winner ? t("Defeat") : t("Draw")}
        </div>
        <div className="end-reason">{reason}</div>
        {mode === "online" && room ? (
          <div className="prompt-actions">
            {room.status === "between" ? (
              <button type="button" className="btn primary" onClick={nextGame}>
                {t("Next game ({a}–{b})", {
                  a: room.match.wins[room.seat] ?? 0,
                  b: room.match.wins[room.seat === "p1" ? "p2" : "p1"] ?? 0,
                })}
              </button>
            ) : (
              <button type="button" className="btn primary" disabled={me?.rematch} onClick={rematch}>
                {me?.rematch ? t("Waiting for the opponent…") : t("Rematch")}
              </button>
            )}
            <button type="button" className="btn" onClick={() => exportGame("download")}>
              {t("Export the game")}
            </button>
            <button type="button" className="btn" onClick={quit}>
              {t("Leave")}
            </button>
          </div>
        ) : (
          <div className="prompt-actions">
            <button type="button" className="btn primary" onClick={startGame}>
              {t("Play again")}
            </button>
            <button type="button" className="btn" onClick={() => exportGame("watch")}>
              {t("Watch the replay")}
            </button>
            <button type="button" className="btn" onClick={() => exportGame("download")}>
              {t("Export the game")}
            </button>
            <button type="button" className="btn" onClick={quit}>
              {t("Home")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
