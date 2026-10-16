/** The zoomed card under the pointer: the large image (French by default). */
import { useGame } from "../store";
import { CardImage } from "./CardImage";

export function Preview() {
  const p = useGame((s) => s.preview);
  if (!p) return null;
  return (
    <div className="preview">
      <CardImage defId={p.defId} {...(p.print ? { print: p.print } : {})} quality="high" />
    </div>
  );
}
