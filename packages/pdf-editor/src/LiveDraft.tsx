import { useCallback, useEffect, useRef, useState } from "react";
import type { PdfTool } from "./types.js";

export type DraftPoint = [number, number];
export interface Draft { tool: PdfTool; start: DraftPoint; end: DraftPoint; points: DraftPoint[] }

const TRACKED: string[] = ["draw", "inkHighlight", "polygon", "polyline", "perimeter", "area"];
const LINEAR: string[] = ["line", "arrow", "distance", "calibrate", "callout"];
const CLOSED: string[] = ["polygon", "area"];

export const VERTEX_TOOLS: string[] = ["polygon", "polyline", "perimeter", "area"];

/** Live shape under the pointer while it is held down; one state update per frame, so long strokes stay smooth. */
export function useLiveDraft(tool?: PdfTool) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [vertices, setVertices] = useState<DraftPoint[]>([]);
  useEffect(() => { setVertices([]); }, [tool]);
  const latest = useRef<Draft | null>(null);
  const frame = useRef(0);
  const flush = useCallback(() => { frame.current = 0; setDraft(latest.current && { ...latest.current }); }, []);
  const schedule = useCallback(() => { if (!frame.current) frame.current = requestAnimationFrame(flush); }, [flush]);
  const begin = useCallback((tool: PdfTool, at: DraftPoint) => { latest.current = { tool, start: at, end: at, points: [at] }; schedule(); }, [schedule]);
  const move = useCallback((at: DraftPoint) => {
    const current = latest.current;
    if (!current) return;
    current.end = at;
    if (TRACKED.includes(current.tool)) current.points.push(at);
    schedule();
  }, [schedule]);
  const clear = useCallback(() => {
    latest.current = null;
    if (frame.current) { cancelAnimationFrame(frame.current); frame.current = 0; }
    setDraft(null);
  }, []);
  const tap = useCallback((at: DraftPoint) => setVertices((list) => [...list, at]), []);
  const resetVertices = useCallback(() => setVertices([]), []);
  useEffect(() => () => { if (frame.current) cancelAnimationFrame(frame.current); }, []);
  return { draft, begin, move, clear, vertices, tap, resetVertices };
}

const STROKE = { fill: "none", stroke: "#1d4ed8", strokeWidth: 2, vectorEffect: "non-scaling-stroke" as const, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

export function VertexDraft({ tool, vertices, onFinish, onCancel }: { tool: PdfTool; vertices: DraftPoint[]; onFinish(): void; onCancel(): void }) {
  if (!vertices.length) return null;
  const last = vertices[vertices.length - 1];
  const need = tool === "polygon" || tool === "area" ? 3 : 2;
  const path = vertices.map(([x, y]) => x + "," + y).join(" ");
  return <>
    <svg aria-hidden="true" className="tpdf-live-draft" viewBox="0 0 100 100" preserveAspectRatio="none"
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none", overflow: "visible" }}>
      <polyline {...STROKE} points={tool === "polygon" || tool === "area" ? path + " " + vertices[0][0] + "," + vertices[0][1] : path} strokeDasharray="4 3" />
    </svg>
    {vertices.map(([x, y], index) => <span key={index} className="tpdf-vertex-dot" style={{ left: x + "%", top: y + "%" }} />)}
    <span className="tpdf-vertex-actions" style={{ left: last[0] + "%", top: last[1] + "%" }}
      onPointerDown={(event) => event.stopPropagation()} onPointerUp={(event) => event.stopPropagation()}>
      <button type="button" disabled={vertices.length < need} onClick={onFinish}>Finish</button>
      <button type="button" aria-label="Cancel shape" onClick={onCancel}>×</button>
    </span>
  </>;
}

export function LiveDraft({ draft }: { draft: Draft | null }) {
  if (!draft) return null;
  const { tool, start, end, points } = draft;
  const path = points.map(([x, y]) => x + "," + y).join(" ");
  const x = Math.min(start[0], end[0]), y = Math.min(start[1], end[1]);
  const width = Math.abs(end[0] - start[0]), height = Math.abs(end[1] - start[1]);
  const ink = tool === "inkHighlight";
  return <svg aria-hidden="true" className="tpdf-live-draft" viewBox="0 0 100 100" preserveAspectRatio="none"
    style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none", overflow: "visible" }}>
    {TRACKED.includes(tool)
      ? <polyline {...STROKE} points={CLOSED.includes(tool) ? path + " " + start[0] + "," + start[1] : path}
        {...(ink ? { stroke: "#facc15", strokeWidth: 10, opacity: 0.45 } : {})} />
      : LINEAR.includes(tool)
        ? <line {...STROKE} x1={start[0]} y1={start[1]} x2={end[0]} y2={end[1]} />
        : tool === "circle"
          ? <ellipse {...STROKE} cx={x + width / 2} cy={y + height / 2} rx={width / 2} ry={height / 2} />
          : <rect {...STROKE} strokeDasharray="4 3" fill="rgba(29,78,216,.08)" x={x} y={y} width={width} height={height} />}
  </svg>;
}
