/**
 * A player's panel: avatar, name, whose turn it is, Prize cards left (the score), deck, hand, discard pile and Lost
 * Zone counts. The opponent's hand is shown as a fan of card backs at the top edge.
 */
import type { GameView, PlayerId } from "@pokecircle/engine";
import { motion } from "motion/react";
import { useT } from "../localize";
import { useGame } from "../store";
import { CardBack } from "./CardImage";

const initials = (name: string) =>
  name
    .split(/\s+/)
    .map((w) => w.charAt(0))
    .join("")
    .slice(0, 2)
    .toUpperCase() || "?";

export function PlayerBar({ view, player }: { view: GameView; player: PlayerId }) {
  const t = useT();
  const showZone = useGame((s) => s.showZone);
  const ps = view.players[player];
  if (!ps) return null;
  const mine = player === view.me;
  const turn = view.flow !== "setup" && !view.over && view.turn.active === player;
  return (
    <div className={`player-bar${mine ? " me" : " opp"}${turn ? " turn" : ""}`} data-player={player}>
      <div className="avatar">
        <span>{initials(ps.name)}</span>
        <motion.span
          key={ps.prizes}
          className="prize-pill"
          title={t("{n} Prize card(s) left", { n: ps.prizes })}
          initial={{ scale: 1.7, color: "#ffd84d" }}
          animate={{ scale: 1, color: "#ffffff" }}
          transition={{ duration: 0.6 }}
        >
          {ps.prizes}
        </motion.span>
      </div>
      <div className="pb-info">
        <div className="pb-name">
          {ps.name}
          {turn ? <span className="turn-chip">{mine ? t("Your turn") : t("Their turn")}</span> : null}
        </div>
        <div className="pb-counters">
          <span className="counter" title={t("Deck")}>
            <i className="ic ic-deck" />
            {ps.deckCount}
          </span>
          <span className="counter" title={t("Hand")}>
            <i className="ic ic-hand" />
            {ps.handCount}
          </span>
          <button
            type="button"
            className="counter"
            title={t("Discard pile")}
            onClick={() => showZone({ player, zone: "discard" })}
          >
            <i className="ic ic-discard" />
            {ps.discard.length}
          </button>
          {ps.lostZone.length ? (
            <button
              type="button"
              className="counter"
              title={t("Lost Zone")}
              onClick={() => showZone({ player, zone: "lostZone" })}
            >
              <i className="ic ic-lost" />
              {ps.lostZone.length}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/** The opponent's hand: card backs fanned at the top edge of the screen. */
export function OpponentHand({ view, player }: { view: GameView; player: PlayerId }) {
  const n = view.players[player]?.handCount ?? 0;
  const shown = Math.min(n, 12);
  return (
    <div className="opp-hand" aria-hidden>
      {Array.from({ length: shown }, (_, i) => {
        const k = i - (shown - 1) / 2;
        return (
          <div
            key={i}
            className="opp-hand-card"
            style={{ transform: `translateX(${k * 22}px) rotate(${-k * 3}deg) translateY(${Math.abs(k) * 2}px)` }}
          >
            <CardBack />
          </div>
        );
      })}
    </div>
  );
}
