import { useEffect, useRef, useState } from "react";
import type { PointerEvent } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { selectedRegion, type PdfRegion } from "../embed/agentWebRegion";

export function AgentWebEmbedPage({
  pdf, number, scale, scrollRoot, region, onSelect,
}: {
  pdf: PDFDocumentProxy;
  number: number;
  scale: number;
  scrollRoot: HTMLDivElement | null;
  region: PdfRegion | null;
  onSelect: (region: PdfRegion) => void;
}) {
  const holder = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const drag = useRef<{ x: number; y: number } | null>(null);
  const [visible, setVisible] = useState(false);
  const [size, setSize] = useState({ width: 612, height: 792 });
  useEffect(() => {
    if (!holder.current || !scrollRoot) return;
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), {
      root: scrollRoot, rootMargin: "650px 0px",
    });
    observer.observe(holder.current);
    return () => observer.disconnect();
  }, [scrollRoot]);
  useEffect(() => {
    if (!visible || !canvas.current) return;
    let cancelled = false;
    let task: { cancel: () => void; promise: Promise<unknown> } | null = null;
    void pdf.getPage(number).then(async (page) => {
      if (cancelled || !canvas.current) return;
      const viewport = page.getViewport({ scale });
      setSize({ width: viewport.width / scale, height: viewport.height / scale });
      const c = canvas.current;
      c.width = Math.ceil(viewport.width);
      c.height = Math.ceil(viewport.height);
      const ctx = c.getContext("2d");
      if (!ctx) return;
      task = page.render({ canvasContext: ctx, viewport });
      await task.promise;
      page.cleanup();
    }).catch((cause) => {
      if (!cancelled && cause?.name !== "RenderingCancelledException") console.error("PDF page render", cause);
    });
    return () => { cancelled = true; task?.cancel(); };
  }, [pdf, number, scale, visible]);
  function percent(event: PointerEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(100, (event.clientX - rect.left) * 100 / rect.width)),
      y: Math.max(0, Math.min(100, (event.clientY - rect.top) * 100 / rect.height)),
    };
  }
  function finish(event: PointerEvent<HTMLDivElement>) {
    if (!drag.current) return;
    const start = drag.current, end = percent(event);
    drag.current = null;
    const region = selectedRegion(number, start, end);
    if (region) onSelect(region);
  }
  return <div ref={holder} data-agent-page={number}
    style={{ width: size.width * scale, height: size.height * scale, position: "relative",
      margin: "0 auto 18px", background: "white", boxShadow: "0 2px 7px #0002" }}>
    {visible ? <canvas ref={canvas} style={{ display: "block", width: "100%", height: "100%" }} /> : null}
    <div role="application" aria-label={"Select PDF region on page " + number}
      style={{ position: "absolute", inset: 0, cursor: "crosshair", touchAction: "none" }}
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId);
        drag.current = percent(event);
      }}
      onPointerUp={finish}
      onPointerCancel={() => { drag.current = null; }}>
      {region?.page === number ? <div style={{ pointerEvents: "none", position: "absolute",
        left: region.x + "%", top: region.y + "%", width: region.width + "%",
        height: region.height + "%", border: "2px solid #ef4444",
        background: "#ef444422", boxSizing: "border-box" }} /> : null}
    </div>
  </div>;
}
