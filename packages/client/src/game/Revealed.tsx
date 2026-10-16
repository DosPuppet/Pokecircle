/** Cards the opponent reveals (their hand, a searched card, a random card): shown over the board for a moment. */
import { useT } from "../localize";
import { useGame } from "../store";
import { CardImage } from "./CardImage";

export function Revealed() {
  const t = useT();
  const revealed = useGame((s) => s.revealed);
  if (!revealed) return null;
  return (
    <div className="reveal-layer" key={revealed.key}>
      <div className="reveal-title">{t("Your opponent reveals")}</div>
      <div className="reveal-cards">
        {revealed.defIds.slice(0, 12).map((d, i) => (
          <CardImage key={i} defId={d} className="reveal-card" />
        ))}
      </div>
    </div>
  );
}
