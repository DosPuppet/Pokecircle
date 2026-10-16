/**
 * A Pokémon in play: its top card, rotated as on a real table for Asleep (left), Paralyzed (right) and Confused
 * (upside down); damage, HP, Poison and Burn markers, attached Energy and Tools, evolution stack.
 */
import type { GameView, PokemonId } from "@pocketmate/engine";
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
  const pk = view.pokemon[id];
  if (!pk) return null;
  const top = pk.cards[pk.cards.length - 1] ?? "";
  const defId = view.faces[top];
  const rot = pk.cond.rotating;
  const left = Math.max(0, pk.hp - pk.damage);
  const energyTypes = pk.energy.map((e) => view.faces[e]);
  return (
    <button
      type="button"
      className={`pokemon${active ? " active" : ""}${targetable ? " targetable" : ""}${selected ? " selected" : ""}`}
      onClick={onClick}
      onMouseEnter={() => defId && showPreview({ defId, ...(view.prints[top] ? { print: view.prints[top] } : {}) })}
      onMouseLeave={() => showPreview(null)}
      data-pokemon={id}
    >
      <div className={`pk-card${rot ? ` rot-${rot}` : ""}`}>
        {pk.cards.length > 1 ? <div className="pk-stack" style={{ "--n": pk.cards.length - 1 } as React.CSSProperties} /> : null}
        <CardImage defId={defId} {...(view.prints[top] ? { print: view.prints[top] } : {})} />
      </div>
      {pk.damage > 0 ? <div className="pk-damage">{pk.damage}</div> : null}
      <div className="pk-hp" title={t("HP")}>
        {left}/{pk.hp}
      </div>
      <div className="pk-markers">
        {pk.cond.poisoned ? <span className="marker poison" title={loc(CONDITION_LABEL.poisoned)} /> : null}
        {pk.cond.burned ? <span className="marker burn" title={loc(CONDITION_LABEL.burned)} /> : null}
        {rot ? <span className={`marker cond-${rot}`}>{loc(CONDITION_LABEL[rot])}</span> : null}
      </div>
      <div className="pk-energy">
        {energyTypes.map((d, i) => (
          <EnergyIconFor key={i} defId={d} />
        ))}
      </div>
      {pk.tools.length ? (
        <div className="pk-tools">
          {pk.tools.map((c) => (
            <div
              key={c}
              className="pk-tool"
              onMouseEnter={(e) => {
                e.stopPropagation();
                const d = view.faces[c];
                if (d) showPreview({ defId: d });
              }}
            >
              <CardImage defId={view.faces[c]} />
            </div>
          ))}
        </div>
      ) : null}
    </button>
  );
}

function EnergyIconFor({ defId }: { defId?: string }) {
  const d = defOf(defId);
  const type = d?.energy?.basic ? (d.energy.provides[0]?.[0] ?? "C") : "special";
  return <EnergyIcon type={type} small />;
}
