import { createContext, useContext, useEffect, useState } from "react";
import type { P1Quad } from "./p1Types.js";
import type { PdfRegion } from "./types.js";

export type TextSelectionResolver = (page: number, region: PdfRegion) => Promise<{ quads: P1Quad[]; text: string; lines?: number }>;
export const TileTextSelectContext = createContext<TextSelectionResolver | null>(null);

/** Text selection for server-rendered pages: drag to pick text, see the lines picked, copy them. */
export function useTileTextSelect(page: number, active: boolean) {
  const resolve = useContext(TileTextSelectContext);
  const [picked, setPicked] = useState<{ quads: P1Quad[]; text: string; end: [number, number] } | null>(null);
  useEffect(() => { if (!active) setPicked(null); }, [active]);
  return {
    enabled: Boolean(resolve) && active,
    clear: () => setPicked(null),
    picked,
    async pick(region: PdfRegion, end: [number, number]) {
      if (!resolve) return;
      try {
        const result = await resolve(page, region);
        setPicked(result.quads.length ? { ...result, end } : null);
      } catch { setPicked(null); }
    },
  };
}

export function TileTextSelection({ state }: { state: ReturnType<typeof useTileTextSelect> }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => setCopied(false), [state.picked]);
  const { picked } = state;
  if (!picked) return null;
  return <>
    <svg aria-hidden="true" viewBox="0 0 100 100" preserveAspectRatio="none"
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}>
      {picked.quads.map((quad, index) => <polygon key={index} points={quad.map((p) => p.x + "," + p.y).join(" ")} fill="#2167e7" opacity={0.3} />)}
    </svg>
    <span className="tpdf-vertex-actions" style={{ left: picked.end[0] + "%", top: picked.end[1] + "%" }}
      onPointerDown={(event) => event.stopPropagation()} onPointerUp={(event) => event.stopPropagation()}>
      <button type="button" onClick={() => { void navigator.clipboard?.writeText(picked.text).then(() => setCopied(true)).catch(() => undefined); }}>{copied ? "Copied" : "Copy"}</button>
      <button type="button" aria-label="Clear selection" onClick={state.clear}>×</button>
    </span>
  </>;
}
