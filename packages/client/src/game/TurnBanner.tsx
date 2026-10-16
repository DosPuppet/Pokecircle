/** The banner at the start of each turn: "Your turn" (gold) or the opponent's turn (red). */
import type { GameView } from "@pokecircle/engine";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { useT } from "../localize";
import { useGame } from "../store";

export function TurnBanner({ view }: { view: GameView }) {
  const t = useT();
  const banner = useGame((s) => s.banner);
  const replay = useGame((s) => !!s.replay);
  const [shown, setShown] = useState<number | null>(null);
  useEffect(() => {
    if (!banner || replay) return;
    setShown(banner.key);
    const id = setTimeout(() => setShown(null), 1400);
    return () => clearTimeout(id);
  }, [banner, replay]);
  const mine = banner?.player === view.me;
  const name = banner ? view.players[banner.player]?.name : "";
  return (
    <AnimatePresence>
      {shown !== null && banner?.key === shown ? (
        <motion.div
          key={shown}
          className={`turn-banner${mine ? " mine" : " theirs"}`}
          initial={{ opacity: 0, scaleX: 0.6 }}
          animate={{ opacity: 1, scaleX: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
        >
          {mine ? t("Your turn to play") : t("{name}'s turn", { name: name ?? "" })}
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
