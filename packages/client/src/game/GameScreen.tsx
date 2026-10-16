/**
 * The game screen, as on Pokémon TCG Live: the playmat with both sides (Prize cards, Bench, Active Spot, deck and
 * discard pile), the opponent's panel and hand at the top, the player's panel, hand and main button at the bottom; the
 * drawer (☰) holds the options and the log.
 */
import { resolveBoard } from "../boardThemes";
import { useLoc, useT } from "../localize";
import { useGame } from "../store";
import { Coach } from "../tutorial/Coach";
import { ActionPanel, MainButton } from "./ActionBar";
import { CardImage } from "./CardImage";
import { CoinFlip } from "./CoinFlip";
import { EndOverlay } from "./EndOverlay";
import { Hand } from "./Hand";
import { MatchScore, OpponentStatus, Rope } from "./OnlineBits";
import { OpponentHand, PlayerBar } from "./PlayerBar";
import { Preview } from "./Preview";
import { Prompt } from "./Prompt";
import { ReplayBar } from "./ReplayBar";
import { SetupBar } from "./SetupBar";
import { Side } from "./Side";
import { DrawerToggle, Sidebar } from "./Sidebar";
import { TurnBanner } from "./TurnBanner";
import { ZoneViewer } from "./ZoneViewer";

export function GameScreen() {
  const t = useT();
  const loc = useLoc();
  const view = useGame((s) => s.view);
  const error = useGame((s) => s.error);
  const showPreview = useGame((s) => s.showPreview);
  const replay = useGame((s) => !!s.replay);
  const tutorial = useGame((s) => !!s.tutorial);
  const board = useGame((s) => resolveBoard(s.board, s.boardRoll));
  if (!view)
    return (
      <div className="game loading" data-board={board}>
        {t("Shuffling the decks…")}
      </div>
    );
  const opp = view.order.find((p) => p !== view.me) as string;
  const stadiumDef = view.stadium ? view.faces[view.stadium] : undefined;
  return (
    <div className="game" data-board={board}>
      <div className="top-row">
        <PlayerBar view={view} player={opp} />
        <OpponentHand view={view} player={opp} />
        <div className="turn-info">
          {view.turn.number ? t("Turn {n}", { n: view.turn.number }) : t("Setup")}
          {view.suddenDeath ? <span className="sudden-death">{t("Sudden Death")}</span> : null}
          <MatchScore />
        </div>
      </div>
      <main className="table">
        <Side view={view} player={opp} top />
        <div className="center-line">
          <div
            className="stadium"
            onMouseEnter={() => stadiumDef && showPreview({ defId: stadiumDef })}
            onMouseLeave={() => showPreview(null)}
          >
            {stadiumDef ? <CardImage defId={stadiumDef} /> : <span className="no-stadium">{t("No Stadium")}</span>}
          </div>
          <TurnBanner view={view} />
          {error ? <div className="error-toast">{loc(error)}</div> : null}
          <OpponentStatus />
          <SetupBar view={view} />
        </div>
        <Side view={view} player={view.me} />
      </main>
      <div className="bottom-row">
        <PlayerBar view={view} player={view.me} />
        <Hand view={view} />
        <div className="bottom-right">
          <Rope />
          <MainButton view={view} />
        </div>
      </div>
      <ActionPanel view={view} />
      {replay ? <ReplayBar /> : null}
      <Prompt view={view} />
      <CoinFlip />
      <Preview />
      <ZoneViewer view={view} />
      {replay || tutorial ? null : <EndOverlay view={view} />}
      <Coach />
      <DrawerToggle />
      <Sidebar />
    </div>
  );
}
