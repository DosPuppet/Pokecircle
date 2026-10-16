/** Online game extras: the decision timer with its rope, the opponent's connection, the score of a best of three. */
import { useEffect, useState } from "react";
import { useT } from "../localize";
import { useGame } from "../store";

export function Rope() {
  const t = useT();
  const clock = useGame((s) => s.online.clock);
  const me = useGame((s) => s.online.room?.seat);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!clock) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [clock]);
  if (!clock) return null;
  const left = Math.max(0, clock.remainingMs - (now - clock.receivedAt));
  if (left > clock.ropeMs) return null;
  const mine = clock.player === me;
  return (
    <div className={`rope${mine ? " mine" : ""}`}>
      <div className="rope-bar" style={{ width: `${(100 * left) / clock.ropeMs}%` }} />
      <span>
        {mine ? t("Your time: {s} s", { s: Math.ceil(left / 1000) }) : t("Opponent's time: {s} s", { s: Math.ceil(left / 1000) })}
      </span>
    </div>
  );
}

export function OpponentStatus() {
  const t = useT();
  const opp = useGame((s) => s.online.opponent);
  if (!opp || opp.connected) return null;
  return (
    <div className="opp-status">
      {opp.remainingMs !== null
        ? t("Your opponent is disconnected: {s} s to come back", { s: Math.ceil(opp.remainingMs / 1000) })
        : t("Your opponent is disconnected")}
    </div>
  );
}

export function MatchScore() {
  const t = useT();
  const room = useGame((s) => s.online.room);
  if (!room || room.match.bestOf === 1) return null;
  const me = room.seat;
  const other = me === "p1" ? "p2" : "p1";
  return (
    <div className="match-score">
      {t("Game {n} · {a}–{b}", { n: room.match.game, a: room.match.wins[me] ?? 0, b: room.match.wins[other] ?? 0 })}
    </div>
  );
}
