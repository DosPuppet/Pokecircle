/**
 * The zoomed card under the pointer: the large image, on the side of the screen away from the pointer. On a touch
 * screen (no hover), a long press on a card shows it the same way (`useLongPress`); lifting the finger hides it and the
 * press does not count as a tap.
 */
import { useEffect, useState } from "react";
import { useGame } from "../store";
import { justLongPressed } from "../touch";
import { CardImage } from "./CardImage";

const HOLD_MS = 380;
const SLOP_PX = 10;

/**
 * Touch long press → the element's own hover handlers: a synthetic `mouseover` starts React's `onMouseEnter` (the card
 * previews it sets), a `mouseout` on release ends it. Returns where the finger is (`top`: upper half), or null.
 */
function useLongPress(): "top" | "bottom" | null {
  const [held, setHeld] = useState<"top" | "bottom" | null>(null);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let target: Element | null = null;
    let start = { x: 0, y: 0 };
    let active = false;
    const swallow = (e: Event) => {
      e.preventDefault();
      e.stopPropagation();
    };
    const end = () => {
      clearTimeout(timer);
      if (active && target) {
        target.dispatchEvent(new MouseEvent("mouseout", { bubbles: true, relatedTarget: null }));
        // The release must not play the card: the click that follows is swallowed.
        window.addEventListener("click", swallow, { capture: true, once: true });
        setTimeout(() => window.removeEventListener("click", swallow, { capture: true }), 400);
      }
      active = false;
      target = null;
      setHeld(null);
    };
    const down = (e: PointerEvent) => {
      if (e.pointerType !== "touch") return;
      end();
      target = e.target instanceof Element ? e.target : null;
      // The deck builder has its own long press (TouchPreview, as on Planecircle).
      if (target?.closest(".builder")) target = null;
      start = { x: e.clientX, y: e.clientY };
      timer = setTimeout(() => {
        if (!target) return;
        active = true;
        target.dispatchEvent(new MouseEvent("mouseover", { bubbles: true, relatedTarget: null }));
        setHeld(start.y < innerHeight / 2 ? "top" : "bottom");
      }, HOLD_MS);
    };
    const move = (e: PointerEvent) => {
      if (e.pointerType !== "touch" || !target) return;
      if (Math.hypot(e.clientX - start.x, e.clientY - start.y) > SLOP_PX) end();
    };
    window.addEventListener("pointerdown", down, { passive: true });
    window.addEventListener("pointermove", move, { passive: true });
    window.addEventListener("pointerup", end, { passive: true });
    window.addEventListener("pointercancel", end, { passive: true });
    return () => {
      clearTimeout(timer);
      window.removeEventListener("pointerdown", down);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
    };
  }, []);
  return held;
}

export function Preview() {
  const p = useGame((s) => s.preview);
  const dragging = useGame((s) => s.dragging);
  const [right, setRight] = useState(false);
  const held = useLongPress();
  useEffect(() => {
    const move = (e: PointerEvent) => {
      if (e.pointerType !== "touch") setRight(e.clientX < innerWidth * 0.42);
    };
    window.addEventListener("pointermove", move);
    return () => window.removeEventListener("pointermove", move);
  }, []);
  if (!p || dragging) return null;
  // Touch: shown in the half of the screen away from the finger.
  const cls = held ? ` touch ${held === "top" ? "below" : "above"}` : right ? " right" : "";
  return (
    <div className={`preview${cls}`}>
      <CardImage defId={p.defId} {...(p.print ? { print: p.print } : {})} quality="high" />
    </div>
  );
}

/** Touch screen: the card enlarged by a long press or a tap on its name, overlaid; a tap anywhere closes it. */
export function TouchPreview() {
  const peek = useGame((s) => s.peek);
  const setPeek = useGame((s) => s.setPeek);
  if (!peek) return null;
  return (
    // The click that ends the long press lands on the overlay: it does not close it.
    <div
      className="touch-preview"
      onClick={() => !justLongPressed() && setPeek(null)}
      onKeyDown={(e) => e.key === "Escape" && setPeek(null)}
    >
      <div className="touch-preview-card">
        <CardImage defId={peek.defId} {...(peek.print ? { print: peek.print } : {})} quality="high" />
      </div>
    </div>
  );
}
