import { useRef } from "react";
import type { PointerEvent } from "react";
import { normalizeRegion, type Mark } from "./history.js";
import { InlineTextEditor } from "./InlineTextEditor.js";
import { LiveDraft, useLiveDraft } from "./LiveDraft.js";
import { LegacyMarkPreview } from "./LegacyMarkPreview.js";
import { P1MarkPreview } from "./P1MarkPreview.js";
import { P2PlacementOverlay } from "./P2PlacementOverlay.js";
import type { P2Change } from "./p2Types.js";
import type { P3Change } from "./p3Types.js";
import { P3PendingOverlay } from "./P3PendingOverlay.js";
import type { PdfTool } from "./types.js";
import type { PdfRegion } from "./types.js";

export function TileOverlay({ number, selected, onRegion, pan, tool = "region", marks = [], assetUrl, p2Changes = [], p3Changes = [], pageSize }: {
  number: number; selected: PdfRegion | null;
  onRegion: (region: PdfRegion, points?: Array<[number, number]>) => void;
  pan: boolean; tool?: PdfTool; marks?: Mark[];
  assetUrl?: (id: string) => string; p2Changes?: P2Change[];
  p3Changes?:P3Change[]; pageSize?:{width:number;height:number};
}) {
  const live = useLiveDraft();
  const start = useRef<{ origin: [number, number]; points: Array<[number, number]> } | null>(null);
  function coords(event: PointerEvent<HTMLDivElement>): [number, number] {
    const rect = event.currentTarget.getBoundingClientRect();
    return [Math.max(0, Math.min(100, (event.clientX - rect.left) * 100 / rect.width)),
      Math.max(0, Math.min(100, (event.clientY - rect.top) * 100 / rect.height))];
  }
  return <div className="tpdf-page-overlay" aria-label={"Select area on page " + number}
    style={{ cursor: pan ? "grab" : "crosshair", touchAction: pan ? "auto" : "pan-y" }}
    onPointerDown={(event) => {
      if (pan || event.button !== 0 || event.pointerType === "touch" && !event.isPrimary) return;
      const origin = coords(event); start.current = { origin, points: [origin] }; live.begin(tool, origin);
      event.currentTarget.setPointerCapture(event.pointerId);
    }}
    onPointerMove={(event) => { if (!start.current) return;
      const at = coords(event); live.move(at);
      if (["draw","inkHighlight","polygon","polyline","perimeter","area"].includes(tool)) start.current.points.push(at); }}
    onPointerUp={(event) => {
      if (!start.current) return;
      live.clear();
      const last = coords(event);
      const origin = start.current.origin;
      const linear = tool === "distance" || tool === "calibrate";
      const x = linear && Math.abs(origin[0] - last[0]) < 0.2 ?
        (last[0] < 99.7 ? last[0] + 0.3 : last[0] - 0.3) : last[0];
      const y = linear && Math.abs(origin[1] - last[1]) < 0.2 ?
        (last[1] < 99.7 ? last[1] + 0.3 : last[1] - 0.3) : last[1];
      const region = normalizeRegion(number, ...origin, x, y);
      const points = start.current.points;
      start.current = null;
      if (region) onRegion(region,
        ["draw","inkHighlight","polygon","polyline","line","arrow","callout",
          "perimeter","area","distance","calibrate"].includes(tool)
          ? [...points, last] : undefined);
    }}
    onPointerCancel={() => { start.current = null; live.clear(); }}>
    {marks.filter((mark) => mark.region.page === number).map((mark, index) =>
      mark.schemaVersion === 1 ? <P1MarkPreview key={index} mark={mark} assetUrl={assetUrl}/> :
      <LegacyMarkPreview key={index} mark={mark}/>)}
    <LiveDraft draft={live.draft}/>
    <InlineTextEditor page={number}/>
    <P2PlacementOverlay changes={p2Changes} page={number}/>
    {pageSize && <P3PendingOverlay changes={p3Changes} page={number}
      width={pageSize.width} height={pageSize.height}/>}
    {selected?.page === number && <div className="tpdf-mark tpdf-mark-region"
      style={{ left: selected.x + "%", top: selected.y + "%",
        width: selected.width + "%", height: selected.height + "%" }} />}
  </div>;
}
