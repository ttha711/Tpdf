import { useRef } from "react";
import type { PointerEvent } from "react";
import { normalizeRegion } from "./history.js";
import type { PdfRegion } from "./types.js";

export function TileOverlay({ number, selected, onRegion, pan }: {
  number: number; selected: PdfRegion | null; onRegion: (region: PdfRegion) => void; pan: boolean;
}) {
  const start = useRef<[number, number] | null>(null);
  function coords(event: PointerEvent<HTMLDivElement>): [number, number] {
    const rect = event.currentTarget.getBoundingClientRect();
    return [Math.max(0, Math.min(100, (event.clientX - rect.left) * 100 / rect.width)),
      Math.max(0, Math.min(100, (event.clientY - rect.top) * 100 / rect.height))];
  }
  return <div className="tpdf-page-overlay" aria-label={"Select area on page " + number}
    style={{ cursor: pan ? "grab" : "crosshair", touchAction: pan ? "auto" : "pan-y" }}
    onPointerDown={(event) => {
      if (pan || event.button !== 0 || event.pointerType === "touch" && !event.isPrimary) return;
      start.current = coords(event); event.currentTarget.setPointerCapture(event.pointerId);
    }}
    onPointerUp={(event) => {
      if (!start.current) return;
      const region = normalizeRegion(number, ...start.current, ...coords(event));
      start.current = null;
      if (region) onRegion(region);
    }}
    onPointerCancel={() => { start.current = null; }}>
    {selected?.page === number && <div className="tpdf-mark tpdf-mark-region"
      style={{ left: selected.x + "%", top: selected.y + "%",
        width: selected.width + "%", height: selected.height + "%" }} />}
  </div>;
}
