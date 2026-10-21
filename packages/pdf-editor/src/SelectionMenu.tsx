import { createContext, useContext, useEffect, useState } from "react";
import type { RefObject } from "react";
import { TEXT_MARKUP, type P1Quad, type P1TextMarkup } from "./p1Types.js";

export type TextMarkupAction = (page: number, tool: P1TextMarkup, quads: P1Quad[]) => void;
export const TextMarkupContext = createContext<TextMarkupAction | null>(null);

export type PickedText = { quads: P1Quad[]; text: string };
const LABEL: Record<P1TextMarkup, string> = { highlight: "Highlight", underline: "Underline", strikeout: "Strikeout", squiggly: "Squiggly" };
const SAMPLE: Record<P1TextMarkup, string> = { highlight: "H", underline: "U", strikeout: "S", squiggly: "~" };

/** Floating menu next to selected text: mark it up or copy it, like a desktop PDF viewer. */
export function SelectionMenu({ page, picked, onDone }: { page: number; picked: PickedText; onDone: () => void }) {
  const mark = useContext(TextMarkupContext);
  const [copied, setCopied] = useState(false);
  useEffect(() => setCopied(false), [picked]);
  const ys = picked.quads.flat().map((p) => p.y), xs = picked.quads.flat().map((p) => p.x);
  const above = Math.min(...ys) > 9;
  const left = Math.min(92, Math.max(8, (Math.min(...xs) + Math.max(...xs)) / 2));
  const keep = (event: { preventDefault(): void; stopPropagation(): void }) => { event.preventDefault(); event.stopPropagation(); };
  return <span className="tpdf-selection-menu" role="toolbar" aria-label="Selected text"
    style={{ left: left + "%", top: (above ? Math.min(...ys) : Math.max(...ys)) + "%", transform: above ? "translate(-50%,calc(-100% - 6px))" : "translate(-50%,6px)" }}
    onPointerDown={keep} onPointerUp={(event) => event.stopPropagation()} onMouseDown={keep}>
    {mark && TEXT_MARKUP.map((tool) => <button key={tool} type="button" title={LABEL[tool]} aria-label={LABEL[tool]}
      data-tpdf-markup={tool} className={"tpdf-selection-" + tool}
      onClick={() => { mark(page, tool, picked.quads); onDone(); }}>{SAMPLE[tool]}</button>)}
    <button type="button" onClick={() => { void navigator.clipboard?.writeText(picked.text).then(() => setCopied(true)).catch(() => undefined); }}>{copied ? "Copied" : "Copy"}</button>
    <button type="button" aria-label="Clear selection" onClick={onDone}>×</button>
  </span>;
}

/** Reads the browser's text selection inside one page's text layer as page-percent quads. */
export function useDomTextSelect(layer: RefObject<HTMLDivElement | null>, active: boolean) {
  const [picked, setPicked] = useState<PickedText | null>(null);
  useEffect(() => {
    if (!active) { setPicked(null); return; }
    let timer = 0;
    const read = () => {
      const root = layer.current, selection = window.getSelection();
      const page = root?.parentElement;
      if (!root || !page || !selection || selection.isCollapsed || !selection.rangeCount) return setPicked(null);
      const range = selection.getRangeAt(0);
      if (!range.intersectsNode(root)) return setPicked(null);
      const box = page.getBoundingClientRect();
      const quads: P1Quad[] = [];
      for (const span of Array.from(root.querySelectorAll("span"))) {
        if (!range.intersectsNode(span) || !span.firstChild) continue;
        const part = document.createRange();
        part.selectNodeContents(span);
        if (part.compareBoundaryPoints(Range.START_TO_START, range) < 0) part.setStart(range.startContainer, range.startOffset);
        if (part.compareBoundaryPoints(Range.END_TO_END, range) > 0) part.setEnd(range.endContainer, range.endOffset);
        const r = part.getBoundingClientRect();
        if (r.width < 1 || r.height < 1) continue;
        const x0 = (r.left - box.left) * 100 / box.width, x1 = (r.right - box.left) * 100 / box.width;
        const y0 = (r.top - box.top) * 100 / box.height, y1 = (r.bottom - box.top) * 100 / box.height;
        quads.push([{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }].map((p) => ({
          x: Math.max(0, Math.min(100, p.x)), y: Math.max(0, Math.min(100, p.y)) })) as P1Quad);
      }
      setPicked(quads.length ? { quads, text: selection.toString() } : null);
    };
    const later = () => { window.clearTimeout(timer); timer = window.setTimeout(read, 200); };
    document.addEventListener("selectionchange", later);
    return () => { window.clearTimeout(timer); document.removeEventListener("selectionchange", later); };
  }, [layer, active]);
  return { picked, clear: () => { window.getSelection()?.removeAllRanges(); setPicked(null); } };
}
