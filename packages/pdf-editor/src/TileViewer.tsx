import { useEffect, useMemo, useRef, useState } from "react";
import { useTileScheduler } from "./useTileScheduler.js";
import { pageBoxes, tileLevel, wantedTiles, fallbackTile, LEVELS } from "./tiles.js";
import { TileOverlay } from "./TileOverlay.js";
import { useTileGestures } from "./useTileGestures.js";
import type { PdfTileAdapter, PdfTileMeta, PdfTileLevel, PdfRegion, PdfTool } from "./types.js";
import type { Mark } from "./history.js";
import type { P2Change } from "./p2Types.js";
import type { P3Change } from "./p3Types.js";

export function TileViewer({ tiles, meta, zoom, parent, selected, onRegion, onPage,
  tool = "region", marks = [], assetUrl, p2Changes = [],p3Changes=[],forcePan=false }: {
  tiles: PdfTileAdapter; meta: PdfTileMeta; zoom: number; parent: HTMLElement | null;
  selected: PdfRegion | null; onRegion: (region: PdfRegion, points?: Array<[number, number]>) => void;
  onPage: (page: number) => void; tool?: PdfTool; marks?: Mark[];
  assetUrl?: (id: string) => string; p2Changes?: P2Change[]; p3Changes?:P3Change[];
  forcePan?:boolean;
}) {
  const [view, setView] = useState({ left: 0, top: 0, width: 800, height: 700 });
  const [pan, setPan] = useState(forcePan);
  useEffect(()=>setPan(forcePan),[forcePan]);
  const [decoded, setDecoded] = useState<Set<string>>(() => new Set());
  const drag = useRef<{ x: number; y: number; left: number; top: number } | null>(null);
  const boxes = useMemo(() => pageBoxes(meta, zoom), [meta, zoom]);
  const padding = parent ? parent.ownerDocument.defaultView?.getComputedStyle(parent) : null;
  const insideWidth = Math.max(1, view.width - (padding ?
    (parseFloat(padding.paddingLeft) || 0) + (parseFloat(padding.paddingRight) || 0) : 0));
  const contentWidth = Math.max(...boxes.map((p) => p.width), insideWidth);
  const height = boxes.length ? boxes[boxes.length - 1].top + boxes[boxes.length - 1].height : 0;
  const dpr = typeof window === "undefined" ? 1 : window.devicePixelRatio || 1;
  const level = tileLevel(zoom, dpr);
  useTileGestures(parent, zoom, dpr);
  const needed = useMemo(() => wantedTiles(tiles, meta, zoom, dpr,
    { ...view, width: insideWidth }), [tiles, meta, zoom, dpr, view, insideWidth]);
  const { scheduler, revision } = useTileScheduler(tiles, meta.versionId, needed);
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
  useEffect(() => {
    const mid = view.top + Math.min(view.height / 2, 120);
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
    const up = (event: KeyboardEvent) => { if (event.code === "Space") setPan(forcePan); };
    window.addEventListener("keydown", down); window.addEventListener("keyup", up);
    return () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); };
  }, [forcePan]);
  void revision;
  const nearPages = boxes.map((box, i) => ({ box, i })).filter(({ box }) =>
    box.top <= view.top + view.height + 512 && box.top + box.height >= view.top - 512);
  return <div className="tpdf-tile-document" data-tpdf-level={level} data-tpdf-active={scheduler?.active ?? 0}
    data-tpdf-cache={scheduler?.cacheSize ?? 0} data-tpdf-wanted={needed.length} style={{ position: "relative", minWidth: contentWidth, height, touchAction: "none" }}>
    {nearPages.map(({ box, i }) => <div key={i} className="tpdf-page"
      data-tpdf-page={i + 1} style={{ position: "absolute", top: box.top,
        left: (contentWidth - box.width) / 2, width: box.width, height: box.height, margin: 0,
        overflow: "hidden" }}>
      {!needed.some((tile) => tile.page === i && decoded.has(tile.key)) &&
        <div className="tpdf-tile-skeleton" role="status" aria-label="Đang vẽ trang..."
          style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
          <span>Đang vẽ trang...</span>
        </div>}
      {needed.filter((t) => t.page === i).map((tile) => {
        let source = scheduler?.get(tile.key), display = tile;
        if (!source) for (const coarse of [...LEVELS].reverse().filter((n) => n < level)) {
          const candidate = fallbackTile(tile, coarse as PdfTileLevel, tiles, meta.versionId);
          const cached = scheduler?.get(candidate.key);
          if (cached) { source = cached; display = candidate; break; }
        }
        if (!source) return null;
        return <div key={tile.key} style={{ position: "absolute", overflow: "hidden", pointerEvents: "none",
          left: tile.left * zoom, top: tile.top * zoom, width: tile.width * zoom, height: tile.height * zoom }}>
          <img src={source} alt="" draggable={false} data-tpdf-tile={tile.key}
            onLoad={() => setDecoded((before) => {
              if (before.has(tile.key)) return before;
              const next = new Set(before); next.add(tile.key);
              if (next.size > 128) { const first = next.values().next().value; if (first) next.delete(first); }
              return next;
            })}
            style={{ position: "absolute", maxWidth: "none",
              left: (display.left - tile.left) * zoom, top: (display.top - tile.top) * zoom,
              width: display.width * zoom, height: display.height * zoom }} />
        </div>;
      })}
      <TileOverlay number={i + 1} selected={selected} pan={pan} onRegion={onRegion}
        tool={tool} marks={marks} assetUrl={assetUrl} p2Changes={p2Changes}
        p3Changes={p3Changes} pageSize={meta.pages[i]} />
    </div>)}
  </div>;
}
