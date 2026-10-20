import type { PdfRegion } from "./types.js";
import type { P1Mark } from "./p1Types.js";
import type { P2Change } from "./p2Types.js";
export type LegacyMark = { type: "region" | "highlight" | "note" | "draw" | "cover" | "signature";
  region: PdfRegion; value?: string; points?: Array<[number, number]>;
  schemaVersion?: never };
export type Mark = LegacyMark | P1Mark;
export type PdfChange = { kind: "mark"; mark: Mark } | { kind: "rotate" | "delete" | "insert"; page: number } |
  { kind: "move"; page: number; to: number } | { kind: "field"; field: string; value: string } | P2Change;
export type EditHistory = { past: PdfChange[][]; current: PdfChange[]; future: PdfChange[][] };
export const emptyHistory = (): EditHistory => ({ past: [], current: [], future: [] });
export function change(history: EditHistory, entry: PdfChange): EditHistory {
  return { past: [...history.past, history.current].slice(-50),
    current: [...history.current, entry], future: [] };
}
export function undo(history: EditHistory): EditHistory {
  if (!history.past.length) return history;
  return { current: history.past.at(-1)!, past: history.past.slice(0, -1),
    future: [history.current, ...history.future] };
}
export function redo(history: EditHistory): EditHistory {
  if (!history.future.length) return history;
  return { past: [...history.past, history.current], current: history.future[0],
    future: history.future.slice(1) };
}
export function normalizeRegion(page: number, x1: number, y1: number, x2: number, y2: number, note = ""): PdfRegion | null {
  if (![page, x1, y1, x2, y2].every(Number.isFinite) || !Number.isInteger(page) || page < 1) return null;
  const bound = (n: number) => Math.max(0, Math.min(100, n));
  const a = { x: bound(x1), y: bound(y1) }, b = { x: bound(x2), y: bound(y2) };
  const region = { page, x: Math.min(a.x, b.x), y: Math.min(a.y, b.y),
    width: Math.abs(a.x - b.x), height: Math.abs(a.y - b.y), note: note.slice(0, 2000) };
  return region.width > 0.1 && region.height > 0.1 ? region : null;
}
export function validRegion(value: PdfRegion, pageCount: number): boolean {
  return Number.isInteger(value.page) && value.page >= 1 && value.page <= pageCount &&
    [value.x, value.y, value.width, value.height].every((n) => Number.isFinite(n) && n >= 0 && n <= 100) &&
    value.width > 0 && value.height > 0 && value.x + value.width <= 100 && value.y + value.height <= 100;
}
