import { useEffect, useMemo, useRef, useState } from "react";
import { TileScheduler } from "./tileScheduler.js";
import { pageBoxes, tileLevel, wantedTiles, fallbackTile, LEVELS } from "./tiles.js";
import { TileOverlay } from "./TileOverlay.js";
import { useTileGestures } from "./useTileGestures.js";
import type { PdfTileAdapter, PdfTileMeta, PdfTileLevel, PdfRegion } from "./types.js";

export function TileViewer({ tiles, meta, zoom, parent, selected, onRegion, onPage, register }: {
  tiles: PdfTileAdapter; meta: PdfTileMeta; zoom: number; parent: HTMLElement | null;
  selected: PdfRegion | null; onRegion: (region: PdfRegion) => void; onPage: (page: number) => void;
  register?: (api: { zoomAt: (next: number, x: number, y: number) => void }) => void;
}) {
  const scheduler = useMemo(() => new TileScheduler(), [tiles, meta.versionId]);
  const [tick, setTick] = useState(0);
  const [view, setView] = useState({ left: 0, top: 0, width: 800, height: 700 });
  const [pan, setPan] = useState(false);
  const drag = useRef<{ x: number; y: number; left: number; top: number } | null>(null);
  const boxes = useMemo(() => pageBoxes(meta, zoom), [meta, zoom]);
  const contentWidth = Math.max(...boxes.map((p) => p.width), view.width);
  const height = boxes.length ? boxes[boxes.length - 1].top + boxes[boxes.length - 1].height : 0;
  const dpr = typeof window === "undefined" ? 1 : window.devicePixelRatio || 1;
  const level = tileLevel(zoom, dpr);
  useTileGestures(parent, zoom, dpr);
  const needed = useMemo(() => wantedTiles(tiles, meta, zoom, dpr, view), [tiles, meta, zoom, dpr, view]);
  function sync() {
    if (!parent) return;
    const next = { left: parent.scrollLeft, top: parent.scrollTop,
      width: parent.clientWidth, height: parent.clientHeight };
    setView((old) => Object.keys(next).every((key) =>
      old[key as keyof typeof next] === next[key as keyof typeof next]) ? old : next);
  }
  useEffect(() => { sync(); if (!parent) return;
    const observer = new ResizeObserver(sync); observer.observe(parent);
    parent.addEventListener("scroll", sync, { passive: true });
    return () => { observer.disconnect(); parent.removeEventListener("scroll", sync); };
  }, [parent]);
  useEffect(() => scheduler.subscribe(() => setTick((n) => n + 1)), [scheduler]);
  useEffect(() => { scheduler.setWanted(needed); }, [scheduler, needed]);
  useEffect(() => () => scheduler.dispose(), [scheduler]);
  useEffect(() => {
    const mid = view.top + view.height / 2;
    let nearest = 0;
    let min = Infinity;
    boxes.forEach((box, i) => {
      const distance = Math.abs(box.top + box.height / 2 - mid);
      if (distance < min) { min = distance; nearest = i; }
    });
    onPage(nearest + 1);
  }, [boxes, view.top, view.height, onPage]);
  useEffect(() => {
    if (!parent) return;
    const zoomGesture = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      const rect = parent.getBoundingClientRect();
      const next = Math.max(0.25, Math.min(16 / dpr, zoom * Math.exp(-event.deltaY * 0.008)));
      const fx = event.clientX - rect.left, fy = event.clientY - rect.top;
      parent.dispatchEvent(new CustomEvent("tpdf-tile-zoom", { detail: { next, x: fx, y: fy } }));
    };
    parent.addEventListener("wheel", zoomGesture, { passive: false });
    return () => parent.removeEventListener("wheel", zoomGesture);
  }, [parent, zoom, dpr]);
  useEffect(() => {
    if (!parent) return;
    const down = (event: PointerEvent) => {
      if (event.button !== 1 && !pan) return;
      event.preventDefault(); parent.setPointerCapture(event.pointerId);
      drag.current = { x: event.clientX, y: event.clientY, left: parent.scrollLeft, top: parent.scrollTop };
    };
    const move = (event: PointerEvent) => {
      if (!drag.current) return;
      parent.scrollLeft = drag.current.left - (event.clientX - drag.current.x);
      parent.scrollTop = drag.current.top - (event.clientY - drag.current.y);
    };
    const end = () => { drag.current = null; };
    parent.addEventListener("pointerdown", down); parent.addEventListener("pointermove", move);
    parent.addEventListener("pointerup", end); parent.addEventListener("pointercancel", end);
    return () => { parent.removeEventListener("pointerdown", down); parent.removeEventListener("pointermove", move);
      parent.removeEventListener("pointerup", end); parent.removeEventListener("pointercancel", end); };
  }, [parent, pan]);
  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      if (event.code === "Space" && !/input|textarea|select/i.test((event.target as Element)?.tagName || "")) {
        setPan(true); event.preventDefault();
      }
    };
    const up = (event: KeyboardEvent) => { if (event.code === "Space") setPan(false); };
    window.addEventListener("keydown", down); window.addEventListener("keyup", up);
    return () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); };
  }, []);
  void tick;
  const nearPages = boxes.map((box, i) => ({ box, i })).filter(({ box }) =>
    box.top <= view.top + view.height + 512 && box.top + box.height >= view.top - 512);
  return <div className="tpdf-tile-document" data-tpdf-level={level} data-tpdf-active={scheduler.active}
    data-tpdf-cache={scheduler.cacheSize} data-tpdf-wanted={needed.length} style={{ position: "relative", minWidth: contentWidth, height, touchAction: "none" }}>
    {nearPages.map(({ box, i }) => <div key={i} className="tpdf-page"
      data-tpdf-page={i + 1} style={{ position: "absolute", top: box.top,
        left: (contentWidth - box.width) / 2, width: box.width, height: box.height, margin: 0,
        overflow: "hidden" }}>
      {needed.filter((t) => t.page === i).map((tile) => {
        let source = scheduler.get(tile.key), display = tile;
        if (!source) for (const coarse of [...LEVELS].reverse().filter((n) => n < level)) {
          const candidate = fallbackTile(tile, coarse as PdfTileLevel, tiles, meta.versionId);
          const cached = scheduler.get(candidate.key);
          if (cached) { source = cached; display = candidate; break; }
        }
        if (!source) return null;
        return <div key={tile.key} style={{ position: "absolute", overflow: "hidden", pointerEvents: "none",
          left: tile.left * zoom, top: tile.top * zoom, width: tile.width * zoom, height: tile.height * zoom }}>
          <img src={source} alt="" draggable={false} data-tpdf-tile={tile.key}
            style={{ position: "absolute", maxWidth: "none",
              left: (display.left - tile.left) * zoom, top: (display.top - tile.top) * zoom,
              width: display.width * zoom, height: display.height * zoom }} />
        </div>;
      })}
      <TileOverlay number={i + 1} selected={selected} pan={pan} onRegion={onRegion} />
    </div>)}
  </div>;
}
