import { createContext, useContext, useEffect, useRef, useState } from "react";
import type { PdfRegion } from "./types.js";

export interface InlineTextState { region: PdfRegion; initial?: string; commit(text: string): void; cancel(): void }
export const InlineTextContext = createContext<InlineTextState | null>(null);

function Field({ state }: { state: InlineTextState }) {
  const [value, setValue] = useState(state.initial ?? "");
  const settled = useRef(false);
  const field = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { const input = field.current; input?.focus(); if (state.initial) input?.select(); }, [state.initial]);
  const settle = (keep: boolean) => {
    if (settled.current) return;
    settled.current = true;
    if (keep && value.trim()) state.commit(value); else state.cancel();
  };
  const { x, y, width, height } = state.region;
  return <textarea ref={field} aria-label="Text on page" className="tpdf-inline-text" value={value} maxLength={2000}
    style={{ left: x + "%", top: y + "%", width: Math.max(width, 20) + "%", minHeight: Math.max(height, 4) + "%" }}
    onChange={(event) => setValue(event.target.value)} onPointerDown={(event) => event.stopPropagation()}
    onKeyDown={(event) => {
      if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); settle(true); }
      else if (event.key === "Escape") { event.preventDefault(); settle(false); }
    }}
    onBlur={() => settle(true)} />;
}

/** Type the new text right where it will be placed: Enter or leaving the box keeps it, Escape drops it. */
export function InlineTextEditor({ page }: { page: number }) {
  const state = useContext(InlineTextContext);
  if (!state || state.region.page !== page) return null;
  return <Field key={`${state.region.x}:${state.region.y}:${state.initial ?? ""}`} state={state} />;
}
