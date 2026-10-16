/** The zoomed card under the pointer: the large image, on the side of the screen away from the pointer. */
import { useEffect, useState } from "react";
import { useGame } from "../store";
import { CardImage } from "./CardImage";

export function Preview() {
  const p = useGame((s) => s.preview);
  const dragging = useGame((s) => s.dragging);
  const [right, setRight] = useState(false);
  useEffect(() => {
    const move = (e: PointerEvent) => setRight(e.clientX < innerWidth * 0.42);
    window.addEventListener("pointermove", move);
    return () => window.removeEventListener("pointermove", move);
  }, []);
  if (!p || dragging) return null;
  return (
    <div className={`preview${right ? " right" : ""}`}>
      <CardImage defId={p.defId} {...(p.print ? { print: p.print } : {})} quality="high" />
    </div>
  );
}
