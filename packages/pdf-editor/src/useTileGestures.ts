import { useEffect } from "react";

export function useTileGestures(parent: HTMLElement | null, zoom: number, dpr: number) {
  useEffect(() => {
    if (!parent) return;
    const fingers = new Map<number, { x: number; y: number }>();
    let base = 0, ratio = 1, focal = { x: 0, y: 0 };
    let previous: { x: number; y: number } | null = null;
    function distance() {
      const [a, b] = Array.from(fingers.values());
      return Math.hypot(a.x - b.x, a.y - b.y);
    }
    function down(event: PointerEvent) {
      if (event.pointerType !== "touch") return;
      fingers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (fingers.size === 1) previous = { x: event.clientX, y: event.clientY };
      if (fingers.size === 2) {
        base = distance(); ratio = 1;
        const [a, b] = Array.from(fingers.values());
        const rect = parent!.getBoundingClientRect();
        focal = { x: (a.x + b.x) / 2 - rect.left, y: (a.y + b.y) / 2 - rect.top };
        previous = null;
      }
    }
    function move(event: PointerEvent) {
      if (!fingers.has(event.pointerId)) return;
      event.preventDefault();
      fingers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (fingers.size === 1 && previous) {
        parent!.scrollLeft -= event.clientX - previous.x;
        parent!.scrollTop -= event.clientY - previous.y;
        previous = { x: event.clientX, y: event.clientY };
      }
      if (fingers.size === 2 && base > 0) {
        ratio = Math.max(0.25 / zoom, Math.min(16 / dpr / zoom, distance() / base));
        const doc = parent!.querySelector<HTMLElement>(".tpdf-tile-document");
        if (doc) {
          doc.style.transformOrigin = (parent!.scrollLeft + focal.x) + "px " +
            (parent!.scrollTop + focal.y) + "px";
          doc.style.transform = "scale(" + ratio + ")";
        }
      }
    }
    function end(event: PointerEvent) {
      if (!fingers.has(event.pointerId)) return;
      fingers.delete(event.pointerId);
      if (base && ratio !== 1) {
        const next = zoom * ratio;
        parent!.dispatchEvent(new CustomEvent("tpdf-tile-zoom", { detail: {
          next, x: focal.x, y: focal.y,
        } }));
      }
      base = 0; ratio = 1; previous = null;
      // The real tile layout replaces this short-lived CSS preview on the next paint.
      requestAnimationFrame(() => requestAnimationFrame(() => {
        const doc = parent!.querySelector<HTMLElement>(".tpdf-tile-document");
        if (doc) { doc.style.transform = ""; doc.style.transformOrigin = ""; }
      }));
      if (fingers.size === 1) previous = Array.from(fingers.values())[0];
    }
    parent.addEventListener("pointerdown", down);
    parent.addEventListener("pointermove", move);
    parent.addEventListener("pointerup", end);
    parent.addEventListener("pointercancel", end);
    return () => {
      parent.removeEventListener("pointerdown", down);
      parent.removeEventListener("pointermove", move);
      parent.removeEventListener("pointerup", end);
      parent.removeEventListener("pointercancel", end);
    };
  }, [parent, zoom, dpr]);
}
