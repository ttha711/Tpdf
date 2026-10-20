"use client";
import dynamic from "next/dynamic";
import { StrictMode, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { TpdfPdfAdapter, PdfRegion } from "@tpdf/pdf-editor";
import { PDFArray, PDFDocument } from "pdf-lib";

const Editor = dynamic(() => import("@tpdf/pdf-editor").then((module) => module.TpdfPdfEditor),
  { ssr: false, loading: () => <p>Loading PDF editor…</p> });

export default function PdfOfficePage() {
  const params = useSearchParams();
  const tileMode = params.get("tiles") === "1";
  const appShell = params.get("shell") === "app";
  const tilesOnly = params.get("tileonly") === "1";
  const p1Mode = params.get("p1") === "1";
  const [saved, setSaved] = useState("");
  const [selected, setSelected] = useState<PdfRegion | null>(null);
  const [error, setError] = useState("");
  const [toolResult, setToolResult] = useState("");
  const [p1Payload, setP1Payload] = useState("");
  const [mountId, setMountId] = useState(0);
  const adapter = useMemo<TpdfPdfAdapter>(() => {
    const versions: Array<{ versionId: string; name: string; createdAt: string; bytes: Uint8Array }> = [];
    return {
      ...(tileMode ? { tiles: {
        async meta() {
          const response = await fetch("/api/tiles/meta");
          if (!response.ok) throw Error("Tile metadata unavailable");
          return response.json();
        },
        tileUrl(page: number, level: number, x: number, y: number) {
          return "/api/tiles/" + page + "/" + level + "/" + x + "/" + y + "?v=synthetic-a0-v1";
        },
      } } : {}),
      ...(p1Mode ? {
        resolveTextQuads: async (_page: number, r: { x:number;y:number;width:number;height:number }) => [[
          {x:r.x,y:r.y},{x:r.x+r.width,y:r.y},
          {x:r.x+r.width,y:r.y+r.height},{x:r.x,y:r.y+r.height},
        ]],
        selectAsset: async (kind: string) => ({assetId:"host-" + kind + "-fixture"}),
        assetUrl: (_id: string) => "/api/tiles/0/0.25/0/0?v=synthetic-a0-v1",
      } : {}),
      ...(appShell && tileMode ? {
        searchPages: async (query: string) => [{ page: 35,
          snippet: "Found " + query + " on drawing 35", score: 1 }],
        applyChanges: async (changes: unknown[], info: { name: string }) => {
          setSaved("applied=" + changes.length + " · " + info.name);
          setP1Payload(JSON.stringify(changes));
          return { versionId: "remote-" + Date.now(), name: info.name };
        },
      } : {}),
      async loadDocument() {
        // Next serves public/fixture.pdf from the host application's own disk.
        return { url: "/fixture.pdf", name: appShell ? "Nghi-quyet-91-NQ-ban-ve-A0.pdf" : "building-plan.pdf",
          size: tileMode ? 461_000_000 : undefined };
      },
      async saveVersion(bytes, { name, baseVersionId }) {
        const pdf = await PDFDocument.load(bytes);
        if (pdf.getPageCount() !== 2) throw Error("Expected two PDF pages.");
        const original = new Uint8Array(await (await fetch("/fixture.pdf")).arrayBuffer());
        const changed = bytes.length !== original.length || bytes.some((b, i) => b !== original[i]);
        const beforePdf = await PDFDocument.load(original);
        const streamCount = (doc: PDFDocument) => {
          const content = doc.getPage(0).node.Contents();
          return content instanceof PDFArray ? content.size() : (content ? 1 : 0);
        };
        const annotated = streamCount(pdf) > streamCount(beforePdf);
        if (!changed || !annotated) throw Error("Editor save must add an annotation drawing stream.");
        const versionId = "local-v" + (versions.length + 1);
        versions.push({ versionId, name, createdAt: new Date().toISOString(), bytes: new Uint8Array(bytes) });
        setSaved(versionId + " · " + bytes.length + " bytes · changed=" + changed +
          " · annotation=" + annotated + " · from=" + (baseVersionId || "original"));
        return { versionId, name };
      },
      async listVersions() {
        return versions.map(({ versionId, name, createdAt }) => ({ versionId, name, createdAt }));
      },
    };
  }, [tileMode, appShell, p1Mode]);
  const hostTools = useMemo(() => [
    { id: "page-numbers", label: "Page numbers", group: "Edit PDF",
      run: (context: { page: number }) => setToolResult("page-numbers page " + context.page) },
    { id: "watermark", label: "Watermark", group: "Edit PDF",
      run: (context: { page: number }) => setToolResult("watermark page " + context.page) },
    { id: "compress", label: "Compress", group: "Optimize",
      run: () => setToolResult("compress") },
    { id: "pdf-to-word", label: "PDF to Word", group: "Convert",
      run: () => setToolResult("pdf-to-word") },
  ], []);
  return <main style={{ height: "100dvh", display: "flex", flexDirection: "column" }}>
    {!appShell && <header style={{ padding: "8px 12px", background: "#edf4ff", color: "#132844" }}>
      <strong>360i-style PDF office example</strong>
      <span data-testid="saved" style={{ marginLeft: 14 }}>{saved || "Not saved"}</span>
      <span data-testid="region" style={{ marginLeft: 14 }}>
        {selected ? "page " + selected.page + ": " + selected.x.toFixed(1) + "%," + selected.y.toFixed(1) + "%" : ""}
      </span>
      {error && <span role="alert">{error}</span>}
      {tileMode && <button type="button" data-testid="remount-tile-viewer"
        onClick={() => setMountId((value) => value + 1)}
        style={{ marginLeft: 12 }}>Remount tile viewer</button>}
    </header>}
    <span data-testid="tool-run" style={{ display: "none" }}>{toolResult}</span>
    <span data-testid="host-saved" style={{ display: "none" }}>{saved}</span>
    <span data-testid="p1-payload" style={{ display: "none" }}>{p1Payload}</span>
    <div style={{ flex: 1, minHeight: 0 }}>
      <StrictMode><Editor key={mountId} adapter={adapter} renderMode={tileMode ? "tiles" : "auto"}
        shell={appShell ? "app" : "classic"} tools={appShell ? hostTools : undefined}
        tilesOnly={tilesOnly} locale="en" density="office" assets={{
        workerUrl: "/tpdf-assets/pdf.worker.min.mjs",
      }} onRegionSelected={setSelected}
        onError={(issue) => setError(issue.code + ": " + issue.message)} /></StrictMode>
    </div>
  </main>;
}
