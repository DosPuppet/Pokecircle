/**
 * One player's side of the table: Prize cards, Bench, Active Spot, deck and discard pile. The player's Active Spot and
 * Bench are drop zones for the hand (`data-zone`); during the setup they show the chosen Pokémon (click to take one
 * back).
 */
import type { GameView, PlayerId } from "@pokecircle/engine";
import { motion } from "motion/react";
import { useT } from "../localize";
import { useGame } from "../store";
import { CardBack, CardImage } from "./CardImage";
import { decisionOnTarget, directOption, myTurn, targetsOf } from "./interaction";
import { PokemonSlot } from "./PokemonSlot";

export function Side({ view, player, top }: { view: GameView; player: PlayerId; top?: boolean }) {
  const t = useT();
  const selected = useGame((s) => s.selected);
  const retreating = useGame((s) => s.retreating);
  const dragging = useGame((s) => s.dragging);
  const placing = useGame((s) => s.placing);
  const setPlacing = useGame((s) => s.setPlacing);
  const select = useGame((s) => s.select);
  const decide = useGame((s) => s.decide);
  const showZone = useGame((s) => s.showZone);
  const showPreview = useGame((s) => s.showPreview);
  const pending = view.pending;
  const ps = view.players[player];
  if (!ps) return null;
  const mine = player === view.me;
  const sel = dragging ? ({ kind: "card", id: dragging } as const) : selected;
  const targets = targetsOf(view, sel, retreating && !dragging);
  const promoting = pending?.kind === "choice" && pending.purpose === "promote" && pending.player === view.me;
  const setup = mine && pending?.kind === "setup" && pending.player === view.me;
  // A dragged card played anywhere on the table (a Basic Pokémon, an Item…): the player's side glows.
  const tableDrop = mine && !!dragging && (setup || (myTurn(view) && !!directOption(view, dragging)));
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
  // Setup: the Basic Pokémon chosen in the hand, shown in place.
  const placed = (c: string, active: boolean) => (
    <motion.button
      type="button"
      key={c}
      layoutId={`card-${c}`}
      className={`pokemon placing${active ? " active" : ""}`}
      onClick={() =>
        setPlacing(active ? { active: null, bench: placing.bench } : { ...placing, bench: placing.bench.filter((x) => x !== c) })
      }
      onMouseEnter={() => view.faces[c] && showPreview({ defId: view.faces[c] as string })}
      onMouseLeave={() => showPreview(null)}
    >
      <div className="pk-card">
        <CardImage defId={view.faces[c]} {...(view.prints[c] ? { print: view.prints[c] } : {})} />
      </div>
    </motion.button>
  );
  const benchIds = setup ? placing.bench : ps.bench;
  const benchSize = ps.benchSize;
  const bench = (
    <div
      className={`bench${tableDrop ? " drop" : ""}`}
      data-zone={mine ? "bench" : undefined}
      style={{ "--slots": benchSize } as React.CSSProperties}
    >
      {benchIds.map((id) => (setup ? placed(id, false) : slot(id, false)))}
      {Array.from({ length: Math.max(0, benchSize - benchIds.length) }, (_, i) => (
        <div key={`empty${i}`} className="slot-empty" />
      ))}
    </div>
  );
  const activeId = setup ? placing.active : ps.active;
  const active = (
    <div className={`active-spot${tableDrop ? " drop" : ""}`} data-zone={mine ? "active" : undefined}>
      {activeId ? setup ? placed(activeId, true) : slot(activeId, true) : <div className="slot-empty active" />}
    </div>
  );
  const discardTop = ps.discard[ps.discard.length - 1];
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
          {ps.deckCount > 1 ? (
            <div className="pile-depth" style={{ "--d": Math.min(6, Math.ceil(ps.deckCount / 10)) } as React.CSSProperties} />
          ) : null}
          <div className="zone-count">{ps.deckCount}</div>
        </div>
        <button
          type="button"
          className="pile discard"
          title={t("Discard pile")}
          onClick={() => showZone({ player, zone: "discard" })}
        >
          {discardTop ? (
            <motion.div layoutId={`card-${discardTop}`} className="pile-top">
              <CardImage defId={view.faces[discardTop]} />
            </motion.div>
          ) : (
            <div className="slot-empty" />
          )}
          <div className="zone-count">{ps.discard.length}</div>
        </button>
      </div>
    </section>
  );
}
