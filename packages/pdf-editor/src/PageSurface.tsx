import { useEffect, useRef, useState } from "react";
import type { PointerEvent } from "react";
import { TextLayer, type PDFDocumentProxy } from "pdfjs-dist";
import { normalizeRegion } from "./history.js";
import type { Mark } from "./history.js";
import { CommentPins } from "./CommentPins.js";
import { InlineTextEditor } from "./InlineTextEditor.js";
import { LiveDraft, VERTEX_TOOLS, VertexDraft, useLiveDraft } from "./LiveDraft.js";
import { LegacyMarkPreview } from "./LegacyMarkPreview.js";
import { P1MarkPreview } from "./P1MarkPreview.js";
import { P2PlacementOverlay } from "./P2PlacementOverlay.js";
import type { P2Change } from "./p2Types.js";
import type { P3Change } from "./p3Types.js";
import { P3PendingOverlay } from "./P3PendingOverlay.js";
import type { PdfRegion, PdfTool } from "./types.js";

export function PageSurface({ pdf, number, scale, parent, tool, marks, highlight, onRegion, readOnly, assetUrl, p2Changes = [], p3Changes=[],pan=false }: {
  pdf: PDFDocumentProxy; number: number; scale: number; parent: HTMLElement | null; tool: PdfTool;
  marks: Mark[]; highlight: PdfRegion | null;
  onRegion: (value: PdfRegion, points?: Array<[number, number]>) => void; readOnly: boolean;
  assetUrl?: (id: string) => string; p2Changes?: P2Change[]; p3Changes?:P3Change[]; pan?:boolean;
}) {
  const live = useLiveDraft(tool);
  const element = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const textLayer = useRef<HTMLDivElement>(null);
  const drag=useRef<{x:number;y:number;left:number;top:number}|null>(null);
  const gesture = useRef<{ start: [number, number]; points: Array<[number, number]> } | null>(null);
  const [near, setNear] = useState(false);
  const [size, setSize] = useState({ width: 612, height: 792 });
  useEffect(() => {
    if (!element.current || !parent) return;
    const observer = new IntersectionObserver(([entry]) => setNear(entry.isIntersecting),
      { root: parent, rootMargin: "550px 0px" });
    observer.observe(element.current);
    return () => observer.disconnect();
  }, [parent]);
  useEffect(() => {
    if (!near || !canvas.current) return;
    let cancelled = false;
    let task: ReturnType<Awaited<ReturnType<PDFDocumentProxy["getPage"]>>["render"]> | undefined;
    void pdf.getPage(number).then(async (page) => {
      if (cancelled || !canvas.current) return;
      const viewport = page.getViewport({ scale });
      setSize({ width: viewport.width / scale, height: viewport.height / scale });
      const target = canvas.current;
      const dpr = window.devicePixelRatio || 1;
      const ratio = Math.min(dpr, Math.sqrt(8_000_000 / Math.max(1, viewport.width * viewport.height)));
      target.width = Math.max(1, Math.ceil(viewport.width * ratio));
      target.height = Math.max(1, Math.ceil(viewport.height * ratio));
      const ctx = target.getContext("2d");
      if (!ctx) return;
      task = page.render({ canvasContext: ctx, viewport,
        transform: [ratio, 0, 0, ratio, 0, 0] });
      try { await task.promise; } finally { page.cleanup(); }
    }).catch((error) => {
      if (!cancelled && error?.name !== "RenderingCancelledException") console.error("PDF page", error);
    });
    return () => { cancelled = true; task?.cancel(); };
  }, [pdf, number, scale, near]);
  useEffect(() => {
    if (!near || !textLayer.current) return;
    let cancelled = false;
    let layer: TextLayer | undefined;
    void pdf.getPage(number).then(async (page) => {
      const container = textLayer.current;
      if (cancelled || !container) return;
      container.replaceChildren();
      for (const name of ["--scale-factor", "--total-scale-factor"]) container.style.setProperty(name, String(scale));
      container.style.setProperty("--user-unit", "1");
      layer = new TextLayer({ textContentSource: page.streamTextContent(), container, viewport: page.getViewport({ scale }) });
      await layer.render();
    }).catch(() => undefined);
    return () => { cancelled = true; layer?.cancel(); };
  }, [pdf, number, scale, near]);
  function coords(e: PointerEvent<HTMLDivElement>): [number, number] {
    const rect = e.currentTarget.getBoundingClientRect();
    return [
      Math.max(0, Math.min(100, (e.clientX - rect.left) * 100 / rect.width)),
      Math.max(0, Math.min(100, (e.clientY - rect.top) * 100 / rect.height)),
    ];
  }
  const finishShape = () => {
    const points = live.vertices;
    const xs = points.map((p) => p[0]), ys = points.map((p) => p[1]);
    const region = normalizeRegion(number, Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys));
    live.resetVertices();
    if (region) onRegion(region, points);
  };
  function finish(e: PointerEvent<HTMLDivElement>) {
    const state = gesture.current;
    gesture.current = null;
    live.clear();
    if (!state) return;
    const end = coords(e);
    const linear = tool === "distance" || tool === "calibrate";
    const x = linear && Math.abs(state.start[0] - end[0]) < 0.2 ?
      (end[0] < 99.7 ? end[0] + 0.3 : end[0] - 0.3) : end[0];
    const y = linear && Math.abs(state.start[1] - end[1]) < 0.2 ?
      (end[1] < 99.7 ? end[1] + 0.3 : end[1] - 0.3) : end[1];
    if (VERTEX_TOOLS.includes(tool) && Math.hypot(end[0] - state.start[0], end[1] - state.start[1]) < 1.5) { live.tap(end); return; }
    live.resetVertices();
    if (tool === "comment") { onRegion({ page: number, x: end[0], y: end[1], width: 0, height: 0, note: "" }); return; }
    const region = normalizeRegion(number, ...state.start, x, y);
    if (!region) return;
    onRegion(region, ["draw","inkHighlight","polygon","polyline","line","arrow","callout",
      "perimeter","area","distance","calibrate"].includes(tool)
      ? [...state.points, end] : undefined);
  }
  return <div ref={element} data-tpdf-page={number} role="group" aria-label={"PDF page " + number}
    className="tpdf-page" style={{ width: size.width * scale, height: size.height * scale }}>
    {near && <canvas ref={canvas} className="tpdf-page-canvas" aria-hidden="true" />}
    <div ref={textLayer} className={"tpdf-text-layer" + (tool === "region" && !pan ? " tpdf-text-select" : "")} aria-hidden="true" />
    <div className="tpdf-page-overlay" aria-label={"Select area on page " + number}
      onPointerDown={(e) => {if(pan&&parent){drag.current={x:e.clientX,y:e.clientY,left:parent.scrollLeft,top:parent.scrollTop};e.currentTarget.setPointerCapture(e.pointerId);return;} if (readOnly) return; e.currentTarget.setPointerCapture(e.pointerId);
        const start = coords(e); gesture.current = { start, points: [start] }; live.begin(tool, start); }}
      onPointerMove={(e) => { if(pan&&parent&&drag.current){parent.scrollLeft=drag.current.left-(e.clientX-drag.current.x);parent.scrollTop=drag.current.top-(e.clientY-drag.current.y);return;} if (!gesture.current) return;
        const at = coords(e); live.move(at);
        if (["draw","inkHighlight","polygon","polyline","perimeter","area"].includes(tool)) gesture.current.points.push(at); }}
      onPointerUp={e=>{if(drag.current){drag.current=null;return;}finish(e);}} onPointerCancel={() => { gesture.current = null;drag.current=null; live.clear(); }}
      style={{ cursor:pan?"grab":readOnly?"default":"crosshair", touchAction: readOnly ? "auto" : "none", pointerEvents: tool === "region" && !pan ? "none" : undefined }}>
      {marks.filter((m) => m.region.page === number).map((mark, i) =>
        mark.schemaVersion === 1 ? <P1MarkPreview key={i} mark={mark} assetUrl={assetUrl}/> :
        <LegacyMarkPreview key={i} mark={mark}/>)}
      <LiveDraft draft={live.draft}/>
      <VertexDraft tool={tool} vertices={live.vertices} onFinish={finishShape} onCancel={live.resetVertices}/>
      <InlineTextEditor page={number}/>
      <CommentPins page={number}/>
      <P2PlacementOverlay changes={p2Changes} page={number}/>
      <P3PendingOverlay changes={p3Changes} page={number} width={size.width} height={size.height}/>
    {highlight?.page === number && <div className="tpdf-mark tpdf-mark-region" style={{
        left: highlight.x + "%", top: highlight.y + "%",
        width: highlight.width + "%", height: highlight.height + "%" }} />}
    </div>
  </div>;
}
