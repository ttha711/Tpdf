import { useState, type FormEvent } from "react";
import type { PdfRegion } from "./types.js";
import type { P2Change } from "./p2Types.js";
export function P2ActionPanel({ tool, region, onRecord, onError, selectAttachment,
  totalPages }: {
  tool: "link" | "attachment"; region: PdfRegion | null;
  onRecord: (change:P2Change)=>void; onError: (error:unknown)=>void;
  selectAttachment?: () => Promise<{assetId:string;size?:number}|null>;
  totalPages: number;
}) {
  const [target, setTarget] = useState<"url"|"page">("url");
  const [url, setUrl] = useState("");
  const [page, setPage] = useState(1);
  const [pointX, setPointX] = useState("");
  const [pointY, setPointY] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!region) { onError(Error("Select a placement on the displayed page")); return; }
    if (busy) return;
    setBusy(true);
    try {
      if (tool === "attachment") {
        if (!selectAttachment) throw Error("Host attachment picker is unavailable");
        const asset = await selectAttachment();
        if (!asset) return;
        if (asset.size !== undefined && (asset.size < 0 || asset.size > 10_000_000))
          throw Error("Attachment exceeds 10 MB");
        // Attachment uses icon point only, width/height are intentionally ignored.
        onRecord({kind:"attachment", schemaVersion:1,
          region:{...region,width:0,height:0}, assetId:asset.assetId});
      } else {
        if (target === "url") {
          onRecord({kind:"link",schemaVersion:1,region,target:{kind:"url",url}});
        } else {
          if ((pointX === "") !== (pointY === "")) throw Error("Provide both destination coordinates");
          onRecord({kind:"link",schemaVersion:1,region,target:{kind:"page",page,
            ...(pointX === "" ? {} : {point:{x:Number(pointX),y:Number(pointY)}})}});
        }
      }
    } catch (error) { onError(error); }
    finally { setBusy(false); }
  }
  return <form className="tpdf-p2-panel" data-testid="p2-action-panel" onSubmit={e=>void submit(e)}>
    <strong>{tool === "link" ? "Insert link" : "Attach host file"}</strong>
    <span className="tpdf-p2-hint">{region ?
      "Placement: page " + region.page + ", " + region.x.toFixed(1) + "% / " +
        region.y.toFixed(1) + "%" : "Drag to choose a location on the PDF page"}</span>
    {tool === "link" && <>
      <label>Destination
        <select aria-label="Link destination" value={target}
          onChange={e=>setTarget(e.target.value as "url"|"page")}>
          <option value="url">Web URL</option><option value="page">Page in document</option>
        </select>
      </label>
      {target === "url" ? <label>URL <input aria-label="Link URL" type="url"
        placeholder="https://example.com" required value={url}
        onChange={e=>setUrl(e.target.value)} /></label> : <>
        <label>Destination page <input type="number" aria-label="Destination page"
          min={1} max={totalPages || undefined} value={page}
          onChange={e=>setPage(Number(e.target.value))} /></label>
        <label>Point X % (optional) <input aria-label="Destination point X" type="number"
          min="0" max="100" step="any" value={pointX}
          onChange={e=>setPointX(e.target.value)} /></label>
        <label>Point Y % (optional) <input aria-label="Destination point Y" type="number"
          min="0" max="100" step="any" value={pointY}
          onChange={e=>setPointY(e.target.value)} /></label>
      </>}
    </>}
    {tool === "attachment" && <small>File from host board (any type, up to 10 MB).</small>}
    <button type="submit" disabled={!region || busy || (tool==="attachment" && !selectAttachment)}>
      {busy ? "Working…" : tool === "attachment" ? "Choose file and attach" : "Add link"}
    </button>
  </form>;
}
