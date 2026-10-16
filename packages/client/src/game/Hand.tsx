/**
 * The player's hand: a fan of cards at the bottom edge; hovering lifts a card, playable ones glow. A card is played by
 * dragging it onto its place (a Pokémon to evolve or to attach to, the table for a Basic Pokémon or a Trainer card, the
 * Active Spot or the Bench during the setup), or by clicking it (then its target, or "Play"). Released over the hand,
 * it goes back.
 */
import type { GameView } from "@pokecircle/engine";
import { motion } from "motion/react";
import { useLayoutEffect, useRef, useState } from "react";
import { defOf } from "../cards";
import { useGame } from "../store";
import { CardImage } from "./CardImage";
import { directOption, myTurn, optionsForCard } from "./interaction";

/** Where a card released at a point of the screen goes: a Pokémon, a zone of the player's side, or the table. */
function dropTarget(x: number, y: number): { pokemon?: string; zone?: "active" | "bench" | "table" } | null {
  const els = document.elementsFromPoint(x, y);
  const pk = els.map((el) => el.closest<HTMLElement>("[data-pokemon]")).find(Boolean);
  const zone = els.map((el) => el.closest<HTMLElement>("[data-zone]")).find(Boolean);
  const onTable = els.some((el) => el.closest(".table"));
  if (!pk && !zone && !onTable) return null;
  const out: { pokemon?: string; zone?: "active" | "bench" | "table" } = {};
  if (pk?.dataset.pokemon) out.pokemon = pk.dataset.pokemon;
  out.zone = (zone?.dataset.zone as "active" | "bench" | undefined) ?? "table";
  return out;
}

export function Hand({ view }: { view: GameView }) {
  const selected = useGame((s) => s.selected);
  const select = useGame((s) => s.select);
  const decide = useGame((s) => s.decide);
  const placing = useGame((s) => s.placing);
  const setPlacing = useGame((s) => s.setPlacing);
  const showPreview = useGame((s) => s.showPreview);
  const setDragging = useGame((s) => s.setDragging);
  const dropHandCard = useGame((s) => s.dropHandCard);
  const ref = useRef<HTMLDivElement>(null);
  const dragged = useRef(false);
  const [box, setBox] = useState({ width: 900, card: 110 });
  const setup = view.pending?.kind === "setup" && view.pending.player === view.me;
  // Setup: the Pokémon already placed are shown on the table, not in the hand.
  const hand = (view.players[view.me]?.hand ?? []).filter((c) => !setup || (placing.active !== c && !placing.bench.includes(c)));
  const n = hand.length;

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const card = (el.querySelector(".hand-card") as HTMLElement | null)?.offsetWidth ?? box.card;
      setBox({ width: el.clientWidth, card });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [box.card]);

  const click = (c: string) => {
    if (setup) {
      if (!placeable(view, c)) return;
      if (activeOnly(view, c) && placing.active && placing.active !== c) return;
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

  // The fan: cards overlap more as the hand grows, turn slightly and lower towards the ends.
  const { width, card } = box;
  const step = n > 1 ? Math.min(card * 0.72, Math.max(card * 0.16, (width - card - 16) / (n - 1))) : 0;
  const angle = Math.min(4, 26 / Math.max(1, n));
  const droop = Math.min(6, 30 / Math.max(1, n));
  const rise = card * 1.397 * 0.42;
  const mid = (n - 1) / 2;
  return (
    <div className="hand" ref={ref}>
      {hand.map((c, i) => {
        const playable = setup ? placeable(view, c) : myTurn(view) && optionsForCard(view, c).length > 0;
        const isSelected = selected?.kind === "card" && selected.id === c;
        const k = i - mid;
        const lifted = isSelected;
        return (
          <motion.button
            type="button"
            key={c}
            layoutId={`card-${c}`}
            className={`hand-card${playable ? " playable" : ""}${isSelected ? " selected" : ""}`}
            style={{ left: width / 2 - card / 2 + k * step, top: Math.abs(k) * droop, zIndex: lifted ? 40 : i + 1 }}
            initial={false}
            animate={{ rotate: lifted ? 0 : k * angle, y: lifted ? -rise * 0.6 : 0, scale: lifted ? 1.06 : 1 }}
            whileHover={{ y: -rise, rotate: 0, scale: 1.1, zIndex: 50 }}
            transition={{ type: "spring", stiffness: 420, damping: 34 }}
            drag={playable}
            dragSnapToOrigin
            dragMomentum={false}
            whileDrag={{ scale: 0.9, rotate: 0, zIndex: 80, cursor: "grabbing" }}
            onDragStart={() => {
              dragged.current = true;
              showPreview(null);
              setDragging(c);
            }}
            onDragEnd={(_, info) => {
              setDragging(null);
              setTimeout(() => {
                dragged.current = false;
              }, 0);
              // Page coordinates of the pointer; released over the hand: the card goes back.
              const x = info.point.x - scrollX;
              const y = info.point.y - scrollY;
              const handTop = ref.current?.getBoundingClientRect().top ?? innerHeight;
              if (y > handTop + 10) return;
              const target = dropTarget(x, y);
              if (target) dropHandCard(c, target);
            }}
            onClick={() => {
              if (!dragged.current) click(c);
            }}
            onMouseEnter={() => {
              const d = view.faces[c];
              if (d && !dragged.current) showPreview({ defId: d, ...(view.prints[c] ? { print: view.prints[c] } : {}) });
            }}
            onMouseLeave={() => showPreview(null)}
            data-card={c}
          >
            <CardImage defId={view.faces[c]} {...(view.prints[c] ? { print: view.prints[c] } : {})} />
          </motion.button>
        );
      })}
    </div>
  );
}

function placeable(view: GameView, c: string): boolean {
  const d = defOf(view.faces[c]);
  return (d?.category === "pokemon" && d.stage === "basic") || activeOnly(view, c);
}

/** Cinderace's Explosiveness: a Pokémon that may be put in the Active Spot during setup (never on the Bench). */
function activeOnly(view: GameView, c: string): boolean {
  const d = defOf(view.faces[c]);
  return d?.category === "pokemon" && d.stage !== "basic" && !!d.abilities?.some((a) => a.setupActive);
}
