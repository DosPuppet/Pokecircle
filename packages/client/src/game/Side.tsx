/** One player's side of the table: Prize cards, Bench, Active Spot, deck and discard pile. */
import type { GameView, PlayerId } from "@pocketmate/engine";
import { useT } from "../localize";
import { useGame } from "../store";
import { CardBack, CardImage } from "./CardImage";
import { decisionOnTarget, myTurn, targetsOf } from "./interaction";
import { PokemonSlot } from "./PokemonSlot";

export function Side({ view, player, top }: { view: GameView; player: PlayerId; top?: boolean }) {
  const t = useT();
  const selected = useGame((s) => s.selected);
  const retreating = useGame((s) => s.retreating);
  const select = useGame((s) => s.select);
  const decide = useGame((s) => s.decide);
  const showZone = useGame((s) => s.showZone);
  const pending = view.pending;
  const ps = view.players[player];
  if (!ps) return null;
  const mine = player === view.me;
  const targets = targetsOf(view, selected, retreating);
  const promoting = pending?.kind === "choice" && pending.purpose === "promote" && pending.player === view.me;
  const click = (id: string) => {
    if (!myTurn(view)) return;
    const d = decisionOnTarget(view, selected, retreating, id);
    if (d) decide(d);
    else if (mine) select(selected?.kind === "pokemon" && selected.id === id ? null : { kind: "pokemon", id });
  };
  const slot = (id: string, active: boolean) => (
    <PokemonSlot
      key={id}
      view={view}
      id={id}
      active={active}
      targetable={targets.has(id) || (promoting && mine && !active)}
      selected={selected?.kind === "pokemon" && selected.id === id}
      onClick={() => click(id)}
    />
  );
  const discardTop = ps.discard[ps.discard.length - 1];
  const bench = (
    <div className="bench" style={{ "--slots": ps.benchSize } as React.CSSProperties}>
      {ps.bench.map((id) => slot(id, false))}
      {Array.from({ length: Math.max(0, ps.benchSize - ps.bench.length) }, (_, i) => (
        <div key={`empty${i}`} className="slot-empty" />
      ))}
    </div>
  );
  const active = <div className="active-spot">{ps.active ? slot(ps.active, true) : <div className="slot-empty active" />}</div>;
  return (
    <section className={`side ${top ? "top" : "bottom"}${mine ? " mine" : ""}`} data-player={player}>
      <div className="side-left">
        <div className="prizes" title={t("Prize cards")}>
          {Array.from({ length: view.prizeCount }, (_, i) => (
            <div key={i} className={`prize${i < ps.prizes ? "" : " taken"}`}>
              {i < ps.prizes ? <CardBack /> : null}
            </div>
          ))}
          <div className="zone-count">{t("{n} Prize card(s)", { n: ps.prizes })}</div>
        </div>
      </div>
      <div className="side-main">
        {top ? (
          <>
            {bench}
            {active}
          </>
        ) : (
          <>
            {active}
            {bench}
          </>
        )}
      </div>
      <div className="side-right">
        <div className="pile deck" title={t("Deck")}>
          {ps.deckCount ? <CardBack /> : <div className="slot-empty" />}
          <div className="zone-count">{ps.deckCount}</div>
        </div>
        <button
          type="button"
          className="pile discard"
          title={t("Discard pile")}
          onClick={() => showZone({ player, zone: "discard" })}
        >
          {discardTop ? <CardImage defId={view.faces[discardTop]} /> : <div className="slot-empty" />}
          <div className="zone-count">{ps.discard.length}</div>
        </button>
        {!mine ? <div className="opp-hand">{t("{n} card(s) in hand", { n: ps.handCount })}</div> : null}
      </div>
    </section>
  );
}
