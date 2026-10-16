/** Setup (R-SETUP-4): choose the Active Pokémon and the Benched Pokémon among the Basic Pokémon of the hand. */
import type { GameView } from "@pocketmate/engine";
import { useEffect } from "react";
import { defOf } from "../cards";
import { useT } from "../localize";
import { useGame } from "../store";

export function SetupBar({ view }: { view: GameView }) {
  const t = useT();
  const placing = useGame((s) => s.placing);
  const setPlacing = useGame((s) => s.setPlacing);
  const decide = useGame((s) => s.decide);
  const queue = useGame((s) => s.queue.length);
  const mine = view.pending?.kind === "setup" && view.pending.player === view.me && !queue;
  const hand = view.players[view.me]?.hand ?? [];
  useEffect(() => {
    if (!mine) return;
    // Suggestion: the sturdiest Basic Pokémon as Active.
    if (!placing.active || !hand.includes(placing.active)) {
      const basics = hand.filter((c) => {
        const d = defOf(view.faces[c]);
        return d?.category === "pokemon" && d.stage === "basic";
      });
      basics.sort((a, b) => (defOf(view.faces[b])?.hp ?? 0) - (defOf(view.faces[a])?.hp ?? 0));
      setPlacing({ active: basics[0] ?? null, bench: [] });
    }
  }, [mine, hand, placing.active, setPlacing, view.faces]);
  if (!mine) {
    if (view.flow === "setup" && view.players[view.me]?.placed)
      return <div className="setup-bar">{t("Waiting for the opponent…")}</div>;
    return null;
  }
  return (
    <div className="setup-bar">
      <div className="setup-text">
        {t("Choose your Active Pokémon, then up to 5 Benched Pokémon (click the Basic Pokémon of your hand).")}
      </div>
      <div className="setup-sum">
        {placing.active ? t("Active: 1 · Bench: {n}", { n: placing.bench.length }) : t("No Active Pokémon chosen")}
      </div>
      <button
        type="button"
        className="btn primary"
        disabled={!placing.active}
        onClick={() => placing.active && decide({ type: "setup", active: placing.active, bench: placing.bench })}
      >
        {t("Confirm")}
      </button>
    </div>
  );
}
