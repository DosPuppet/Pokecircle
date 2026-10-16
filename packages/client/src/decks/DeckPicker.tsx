/** A row of decks to choose from (preconstructed and the player's own; an unplayable one is shown dimmed). */
import { CardImage } from "../game/CardImage";
import { useT } from "../localize";
import { useGame } from "../store";
import { allDecks, playable, useDecks } from "./store";

export function DeckPicker({ value, onPick }: { value: string; onPick: (id: string) => void }) {
  const t = useT();
  const lang = useGame((s) => s.lang);
  useDecks((s) => s.decks);
  return (
    <div className="deck-list">
      {allDecks().map((p) => {
        const ok = playable(p.main);
        return (
          <button
            type="button"
            key={p.id}
            className={`deck-tile${value === p.id ? " chosen" : ""}${ok ? "" : " unplayable"}`}
            disabled={!ok}
            title={ok ? "" : t("This deck cannot be played yet")}
            onClick={() => onPick(p.id)}
          >
            <CardImage defId={p.cover} />
            <span>{lang === "fr" ? (p.fr ?? p.name) : p.name}</span>
          </button>
        );
      })}
    </div>
  );
}
