/** The game screen: the opponent's side, the center line (Stadium, turn), the player's side, the hand and the bars. */

import { LangToggle } from "../LangToggle";
import { useLoc, useT } from "../localize";
import { useGame } from "../store";
import { ActionBar } from "./ActionBar";
import { CardImage } from "./CardImage";
import { CoinFlip } from "./CoinFlip";
import { EndOverlay } from "./EndOverlay";
import { Hand } from "./Hand";
import { LogPanel } from "./LogPanel";
import { MatchScore, OpponentStatus, Rope } from "./OnlineBits";
import { Preview } from "./Preview";
import { Prompt } from "./Prompt";
import { SetupBar } from "./SetupBar";
import { Side } from "./Side";
import { ZoneViewer } from "./ZoneViewer";

export function GameScreen() {
  const t = useT();
  const loc = useLoc();
  const view = useGame((s) => s.view);
  const error = useGame((s) => s.error);
  const quit = useGame((s) => s.quitGame);
  const decide = useGame((s) => s.decide);
  const showPreview = useGame((s) => s.showPreview);
  if (!view) return <div className="loading">{t("Shuffling the decks…")}</div>;
  const opp = view.order.find((p) => p !== view.me) as string;
  const stadiumDef = view.stadium ? view.faces[view.stadium] : undefined;
  return (
    <div className="game">
      <header className="game-top">
        <button type="button" className="btn small" onClick={quit}>
          {t("Home")}
        </button>
        <div className="turn-info">
          {view.turn.number ? t("Turn {n}", { n: view.turn.number }) : t("Setup")} <MatchScore />
        </div>
        <LangToggle />
        {!view.over ? (
          <button type="button" className="btn small danger" onClick={() => decide({ type: "concede" })}>
            {t("Concede")}
          </button>
        ) : null}
      </header>
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
          {error ? <div className="error-toast">{loc(error)}</div> : null}
          <OpponentStatus />
        </div>
        <Side view={view} player={view.me} />
      </main>
      <div className="bars">
        <Rope />
        <SetupBar view={view} />
        <ActionBar view={view} />
      </div>
      <Hand view={view} />
      <Prompt view={view} />
      <CoinFlip />
      <LogPanel />
      <Preview />
      <ZoneViewer view={view} />
      <EndOverlay view={view} />
    </div>
  );
}
