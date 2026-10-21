import { useCallback, useEffect, useRef, useState } from "react";
import { normalizeRegion } from "./history.js";
import type { PdfTool } from "./types.js";

export type DraftPoint = [number, number];
export interface Draft { tool: PdfTool; start: DraftPoint; end: DraftPoint; points: DraftPoint[] }

const TRACKED: string[] = ["draw", "inkHighlight", "polygon", "polyline", "perimeter", "area"];
const LINEAR: string[] = ["line", "arrow", "distance", "calibrate", "callout"];
const CLOSED: string[] = ["polygon", "area"];

/** Shapes traced by dragging, like freehand, then cleaned up to a few corner points when released. */
export const TRACED_SHAPES: string[] = ["polygon", "polyline", "perimeter", "area"];
export function shapePoints(tool: string, points: DraftPoint[]): DraftPoint[] | null {
  if (!TRACED_SHAPES.includes(tool)) return points;
  let simple = simplifyPath(points);
  const first = simple[0], last = simple[simple.length - 1];
  if ((tool === "polygon" || tool === "area") && simple.length > 3 && Math.hypot(first[0] - last[0], first[1] - last[1]) < 2) simple = simple.slice(0, -1);
  return simple.length >= (tool === "polygon" || tool === "area" ? 3 : 2) ? simple : null;
}
export const TEXT_MARKUP_TOOLS: string[] = ["highlight", "strikeout", "underline", "squiggly"];
/** A drag along one line of text is almost flat; give it the height of a text line so it still picks that line. */
export function textBand(page: number, a: DraftPoint, b: DraftPoint) {
  const flat = Math.abs(a[1] - b[1]) < 1.2 ? 0.9 : 0;
  return normalizeRegion(page, a[0], Math.min(a[1], b[1]) - flat, b[0], Math.max(a[1], b[1]) + flat);
}
export const VERTEX_TOOLS: string[] = [];

function farthest(points: DraftPoint[], from: number, to: number): [number, number] {
  const [ax, ay] = points[from], [bx, by] = points[to];
  const length = Math.hypot(bx - ax, by - ay);
  let index = from, best = 0;
  for (let i = from + 1; i < to; i++) {
    const distance = length < 1e-6 ? Math.hypot(points[i][0] - ax, points[i][1] - ay)
      : Math.abs((bx - ax) * (ay - points[i][1]) - (ax - points[i][0]) * (by - ay)) / length;
    if (distance > best) { best = distance; index = i; }
  }
  return [index, best];
}

/** Ramer-Douglas-Peucker: keeps the corners of a traced path (tolerance in page percent). */
export function simplifyPath(points: DraftPoint[], tolerance = 1.6): DraftPoint[] {
  if (points.length < 3) return points;
  const keep = new Set([0, points.length - 1]);
  const stack: Array<[number, number]> = [[0, points.length - 1]];
  while (stack.length) {
    const [from, to] = stack.pop()!;
    const [index, distance] = farthest(points, from, to);
    if (distance > tolerance) { keep.add(index); stack.push([from, index], [index, to]); }
  }
  return points.filter((_, i) => keep.has(i));
}

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
