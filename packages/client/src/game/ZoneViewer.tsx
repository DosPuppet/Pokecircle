/** A discard pile (or Lost Zone) shown in full. */
import type { GameView } from "@pocketmate/engine";
import { useT } from "../localize";
import { useGame } from "../store";
import { CardImage } from "./CardImage";

export function ZoneViewer({ view }: { view: GameView }) {
  const t = useT();
  const z = useGame((s) => s.zone);
  const close = useGame((s) => s.showZone);
  const showPreview = useGame((s) => s.showPreview);
  if (!z) return null;
  const ps = view.players[z.player];
  const cards = (z.zone === "discard" ? ps?.discard : ps?.lostZone) ?? [];
  const title =
    z.player === view.me
      ? z.zone === "discard"
        ? t("Your discard pile")
        : t("Your Lost Zone")
      : z.zone === "discard"
        ? t("The opponent's discard pile")
        : t("The opponent's Lost Zone");
  return (
    <div className="modal" onClick={() => close(null)} onKeyDown={() => close(null)} role="presentation">
      <div className="modal-box" onClick={(e) => e.stopPropagation()} onKeyDown={() => undefined} role="dialog">
        <div className="modal-title">
          {title} ({cards.length})
        </div>
        <div className="options">
          {cards.map((c) => (
            <div
              key={c}
              className="opt-card"
              onMouseEnter={() => view.faces[c] && showPreview({ defId: view.faces[c] as string })}
              onMouseLeave={() => showPreview(null)}
            >
              <CardImage defId={view.faces[c]} />
            </div>
          ))}
        </div>
        <button type="button" className="btn" onClick={() => close(null)}>
          {t("Close")}
        </button>
      </div>
    </div>
  );
}
