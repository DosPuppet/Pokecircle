/**
 * A Pokémon in play: its top card, rotated as on a real table for Asleep (left), Paralyzed (right) and Confused
 * (upside down); damage (it pops and the card shakes when it rises), HP, Poison and Burn markers, attached Energy
 * (the printed symbols) and Tools, evolution stack. Cards fly here from the hand (`layoutId`).
 */
import type { GameView, PokemonId } from "@pokecircle/engine";
import { motion, useAnimation } from "motion/react";
import { useEffect, useRef } from "react";
import { defOf } from "../cards";
import { CONDITION_LABEL } from "../i18n";
import { useLoc, useT } from "../localize";
import { useGame } from "../store";
import { CardImage } from "./CardImage";
import { EnergyIcon } from "./Energy";

export function PokemonSlot({
  view,
  id,
  active,
  onClick,
  targetable,
  selected,
}: {
  view: GameView;
  id: PokemonId;
  active?: boolean;
  onClick?: () => void;
  targetable?: boolean;
  selected?: boolean;
}) {
  const t = useT();
  const loc = useLoc();
  const showPreview = useGame((s) => s.showPreview);
  const shake = useAnimation();
  const pk = view.pokemon[id];
  const prev = useRef(pk?.damage ?? 0);
  const damage = pk?.damage ?? 0;
  useEffect(() => {
    if (damage > prev.current) void shake.start({ x: [0, -7, 7, -5, 5, 0], transition: { duration: 0.4 } });
    prev.current = damage;
  }, [damage, shake]);
  if (!pk) return null;
  const top = pk.cards[pk.cards.length - 1] ?? "";
  const defId = view.faces[top];
  const rot = pk.cond.rotating;
  const left = Math.max(0, pk.hp - pk.damage);
  return (
    <button
      type="button"
      className={`pokemon${active ? " active" : ""}${targetable ? " targetable" : ""}${selected ? " selected" : ""}`}
      onClick={onClick}
      onMouseEnter={() => defId && showPreview({ defId, ...(view.prints[top] ? { print: view.prints[top] } : {}) })}
      onMouseLeave={() => showPreview(null)}
      data-pokemon={id}
    >
      <motion.div animate={shake} className="pk-shake">
        <motion.div layoutId={`card-${top}`} className={`pk-card${rot ? ` rot-${rot}` : ""}`}>
          {pk.cards.length > 1 ? (
            <div className="pk-stack" style={{ "--n": pk.cards.length - 1 } as React.CSSProperties} />
          ) : null}
          <CardImage defId={defId} {...(view.prints[top] ? { print: view.prints[top] } : {})} />
        </motion.div>
      </motion.div>
      {pk.damage > 0 ? (
        <motion.div
          key={pk.damage}
          className="pk-damage"
          initial={{ scale: 1.9 }}
          animate={{ scale: 1 }}
          transition={{ duration: 0.35 }}
        >
          {pk.damage}
        </motion.div>
      ) : null}
      <div className={`pk-hp${left <= pk.hp / 4 ? " low" : ""}`} title={t("HP")}>
        {left}/{pk.hp}
      </div>
      <div className="pk-markers">
        {pk.cond.poisoned ? <span className="marker poison" title={loc(CONDITION_LABEL.poisoned)} /> : null}
        {pk.cond.burned ? <span className="marker burn" title={loc(CONDITION_LABEL.burned)} /> : null}
        {rot ? <span className={`marker cond-${rot}`}>{loc(CONDITION_LABEL[rot])}</span> : null}
      </div>
      <div className="pk-energy">
        {pk.energy.map((e) => (
          <motion.span key={e} layoutId={`card-${e}`} className="pk-energy-pip">
            <EnergyFor defId={view.faces[e]} />
          </motion.span>
        ))}
      </div>
      {pk.tools.length ? (
        <div className="pk-tools">
          {pk.tools.map((c) => (
            <motion.div
              key={c}
              layoutId={`card-${c}`}
              className="pk-tool"
              onMouseEnter={(e) => {
                e.stopPropagation();
                const d = view.faces[c];
                if (d) showPreview({ defId: d });
              }}
            >
              <CardImage defId={view.faces[c]} />
            </motion.div>
          ))}
        </div>
      ) : null}
    </button>
  );
}

/** An attached Energy card: its type's symbol (Special Energy: the first type it provides, ringed). */
function EnergyFor({ defId }: { defId?: string }) {
  const d = defOf(defId);
  const unit = d?.energy?.provides[0] ?? ["C"];
  const type = unit.length > 1 ? "*" : (unit[0] ?? "C");
  return <EnergyIcon type={type} small special={!d?.energy?.basic} />;
}
