/** The player's hand: a fan of cards; playable ones are highlighted, the selected one is raised. */
import type { GameView } from "@pocketmate/engine";
import { defOf } from "../cards";
import { useGame } from "../store";
import { CardImage } from "./CardImage";
import { directOption, myTurn, optionsForCard } from "./interaction";

export function Hand({ view }: { view: GameView }) {
  const selected = useGame((s) => s.selected);
  const select = useGame((s) => s.select);
  const decide = useGame((s) => s.decide);
  const placing = useGame((s) => s.placing);
  const setPlacing = useGame((s) => s.setPlacing);
  const showPreview = useGame((s) => s.showPreview);
  const hand = view.players[view.me]?.hand ?? [];
  const setup = view.pending?.kind === "setup" && view.pending.player === view.me;
  const n = hand.length;
  const click = (c: string) => {
    if (setup) {
      const d = view.faces[c];
      const isBasic = !!d && placeable(view, c);
      if (!isBasic) return;
      if (placing.active === c) setPlacing({ active: null, bench: placing.bench });
      else if (placing.bench.includes(c)) setPlacing({ ...placing, bench: placing.bench.filter((x) => x !== c) });
      else if (!placing.active) setPlacing({ ...placing, active: c });
      else if (placing.bench.length < 5) setPlacing({ ...placing, bench: [...placing.bench, c] });
      return;
    }
    if (!myTurn(view)) return;
    if (selected?.kind === "card" && selected.id === c) {
      const d = directOption(view, c);
      if (d) decide(d);
      else select(null);
      return;
    }
    select(optionsForCard(view, c).length ? { kind: "card", id: c } : null);
  };
  return (
    <div className="hand" style={{ "--n": n } as React.CSSProperties}>
      {hand.map((c, i) => {
        const playable = setup ? placeable(view, c) : myTurn(view) && optionsForCard(view, c).length > 0;
        const placed = placing.active === c ? "active" : placing.bench.includes(c) ? "bench" : "";
        return (
          <button
            type="button"
            key={c}
            className={`hand-card${playable ? " playable" : ""}${selected?.kind === "card" && selected.id === c ? " selected" : ""}${placed ? ` placed-${placed}` : ""}`}
            style={{ "--i": i - (n - 1) / 2 } as React.CSSProperties}
            onClick={() => click(c)}
            onMouseEnter={() => {
              const d = view.faces[c];
              if (d) showPreview({ defId: d, ...(view.prints[c] ? { print: view.prints[c] } : {}) });
            }}
            onMouseLeave={() => showPreview(null)}
            data-card={c}
          >
            <CardImage defId={view.faces[c]} {...(view.prints[c] ? { print: view.prints[c] } : {})} />
          </button>
        );
      })}
    </div>
  );
}

function placeable(view: GameView, c: string): boolean {
  const d = defOf(view.faces[c]);
  return d?.category === "pokemon" && d.stage === "basic";
}
