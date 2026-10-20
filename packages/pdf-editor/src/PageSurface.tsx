import { useEffect, useRef, useState } from "react";
import type { PointerEvent } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { normalizeRegion } from "./history.js";
import type { Mark } from "./history.js";
import type { PdfRegion, PdfTool } from "./types.js";

type PageSize = { width: number; height: number };
export function PageSurface({ pdf, number, scale, parent, tool, marks, highlight, onRegion, readOnly,
  firstPageSize = { width: 612, height: 792 }, rasterEnabled, onVisibility }: {
  pdf: PDFDocumentProxy; number: number; scale: number; parent: HTMLElement | null; tool: PdfTool;
  marks: Mark[]; highlight: PdfRegion | null; firstPageSize?: PageSize;
  onRegion: (value: PdfRegion, points?: Array<[number, number]>) => void; readOnly: boolean;
  rasterEnabled?: boolean; onVisibility?: (page: number, near: boolean) => void;
}) {
  const element = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const gesture = useRef<{ start: [number, number]; points: Array<[number, number]> } | null>(null);
  const [near, setNear] = useState(false);
  const [painted, setPainted] = useState(false);
  const [size, setSize] = useState(firstPageSize);
  useEffect(() => setSize(firstPageSize), [pdf, firstPageSize.width, firstPageSize.height]);
  useEffect(() => {
    if (!element.current || !parent) return;
    const observer = new IntersectionObserver(([entry]) => {
      setNear(entry.isIntersecting);
      onVisibility?.(number, entry.isIntersecting);
    }, { root: parent, rootMargin: "550px 0px" });
    observer.observe(element.current);
    return () => { observer.disconnect(); onVisibility?.(number, false); };
  }, [parent, number, onVisibility]);
  const renderNow = near && (rasterEnabled ?? true);
  useEffect(() => {
    if (!renderNow || !canvas.current) { setPainted(false); return; }
    let cancelled = false;
    let task: ReturnType<Awaited<ReturnType<PDFDocumentProxy["getPage"]>>["render"]> | undefined;
    let pageRef: Awaited<ReturnType<PDFDocumentProxy["getPage"]>> | undefined;
    setPainted(false);
    void pdf.getPage(number).then(async (page) => {
      pageRef = page;
      if (cancelled || !canvas.current) return;
      const viewport = page.getViewport({ scale });
      setSize({ width: viewport.width / scale, height: viewport.height / scale });
      const target = canvas.current;
      target.width = Math.ceil(viewport.width);
      target.height = Math.ceil(viewport.height);
      const ctx = target.getContext("2d");
      if (!ctx) return;
      task = page.render({ canvasContext: ctx, viewport });
      await task.promise;
      if (!cancelled) setPainted(true);
    }).catch((error) => {
      if (!cancelled && error?.name !== "RenderingCancelledException") console.error("PDF page", error);
    }).finally(() => { pageRef?.cleanup(); });
    return () => { cancelled = true; task?.cancel(); };
  }, [pdf, number, scale, renderNow]);
  function coords(e: PointerEvent<HTMLDivElement>): [number, number] {
    const rect = e.currentTarget.getBoundingClientRect();
    return [
      Math.max(0, Math.min(100, (e.clientX - rect.left) * 100 / rect.width)),
      Math.max(0, Math.min(100, (e.clientY - rect.top) * 100 / rect.height)),
    ];
  }
  function finish(e: PointerEvent<HTMLDivElement>) {
    const state = gesture.current;
    gesture.current = null;
    if (!state) return;
    const end = coords(e);
    const region = normalizeRegion(number, ...state.start, ...end);
    if (region) onRegion(region, tool === "draw" ? [...state.points, end] : undefined);
  }
  return <div ref={element} data-tpdf-page={number} role="group" aria-label={"PDF page " + number}
    className="tpdf-page" style={{ width: size.width * scale, height: size.height * scale }}>
    {renderNow && <canvas ref={canvas} data-tpdf-painted={painted ? "true" : undefined}
      className="tpdf-page-canvas" aria-hidden="true" />}
    <div className="tpdf-page-overlay" aria-label={"Select area on page " + number}
      onPointerDown={(e) => { if (readOnly) return; e.currentTarget.setPointerCapture(e.pointerId);
        const start = coords(e); gesture.current = { start, points: [start] }; }}
      onPointerMove={(e) => { if (gesture.current && tool === "draw") gesture.current.points.push(coords(e)); }}
      onPointerUp={finish} onPointerCancel={() => { gesture.current = null; }}
      style={{ cursor: readOnly ? "default" : "crosshair", touchAction: readOnly ? "auto" : "none" }}>
      {marks.filter((m) => m.region.page === number).map((mark, i) =>
        <div key={i} className={"tpdf-mark tpdf-mark-" + mark.type}
          style={{ left: mark.region.x + "%", top: mark.region.y + "%",
            width: mark.region.width + "%", height: mark.region.height + "%" }}>
          {(mark.type === "note" || mark.type === "signature") && <span>{mark.value || mark.region.note}</span>}
        </div>)}
      {highlight?.page === number && <div className="tpdf-mark tpdf-mark-region" style={{
        left: highlight.x + "%", top: highlight.y + "%",
        width: highlight.width + "%", height: highlight.height + "%" }} />}
    </div>
  </div>;
}
