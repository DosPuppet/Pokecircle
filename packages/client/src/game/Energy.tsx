/**
 * Energy symbols: the printed symbols, cropped from real cards (`public/energy/<type>.png`, `tools/energy-icons.ts`).
 * "*" (any type) is drawn as a rainbow disc; a free attack shows a dash.
 */
import type { EType } from "@pokecircle/engine";
import { Fragment } from "react";
import { TYPE_LABEL } from "../i18n";
import { useLoc } from "../localize";

const SYMBOLS = new Set(["G", "R", "W", "L", "P", "F", "D", "M", "C", "N"]);

export function EnergyIcon({
  type,
  small = false,
  special = false,
}: {
  type: EType | string;
  small?: boolean;
  special?: boolean;
}) {
  const loc = useLoc();
  const label = TYPE_LABEL[type] ? loc(TYPE_LABEL[type] as string) : type;
  const cls = `energy${small ? " small" : ""}${special ? " special" : ""}`;
  if (SYMBOLS.has(type)) return <img className={cls} src={`/energy/${type}.png`} alt={label} title={label} draggable={false} />;
  return <span className={`${cls} e-${type === "*" ? "any" : "free"}`} title={label} />;
}

export function Cost({ cost }: { cost: string[] }) {
  return (
    <span className="cost">
      {cost.length ? cost.map((t, i) => <EnergyIcon key={i} type={t} small />) : <EnergyIcon type="free" small />}
    </span>
  );
}

/** A text with Energy symbols (`{R}`) drawn as symbols and `**bold**` in bold (texts localized with `symbols`). */
export function RichText({ text }: { text: string }) {
  return (
    <>
      {text.split(/\*\*(.+?)\*\*/g).map((part, i) => {
        const inner = part
          .split(/\{([GRWLPFDMNC])\}/g)
          .map((p, k) => (k % 2 ? <EnergyIcon key={k} type={p} small /> : <Fragment key={k}>{p}</Fragment>));
        return i % 2 ? <strong key={i}>{inner}</strong> : <Fragment key={i}>{inner}</Fragment>;
      })}
    </>
  );
}
