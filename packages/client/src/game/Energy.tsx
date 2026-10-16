/** Energy symbols: a colored disc per type, with its initial in the interface language. */
import type { EType } from "@pocketmate/engine";
import { TYPE_LABEL } from "../i18n";
import { useLoc } from "../localize";

export function EnergyIcon({ type, small = false }: { type: EType | string; small?: boolean }) {
  const loc = useLoc();
  const label = TYPE_LABEL[type] ? loc(TYPE_LABEL[type] as string) : type;
  return (
    <span className={`energy e-${type}${small ? " small" : ""}`} title={label}>
      {type === "C" ? "" : label.charAt(0)}
    </span>
  );
}

export function Cost({ cost }: { cost: string[] }) {
  return (
    <span className="cost">
      {cost.length ? cost.map((t, i) => <EnergyIcon key={i} type={t} small />) : <EnergyIcon type="free" small />}
    </span>
  );
}
