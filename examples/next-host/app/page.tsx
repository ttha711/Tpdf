"use client";
import dynamic from "next/dynamic";
import { StrictMode, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { TpdfPdfAdapter, PdfRegion } from "@tpdf/pdf-editor";
import { PDFArray, PDFDocument } from "pdf-lib";

const Editor = dynamic(() => import("@tpdf/pdf-editor").then((module) => module.TpdfPdfEditor),
  { ssr: false, loading: () => <p>Loading PDF editor…</p> });

export default function PdfOfficePage() {
  const tileMode = useSearchParams().get("tiles") === "1";
  const [saved, setSaved] = useState("");
  const [selected, setSelected] = useState<PdfRegion | null>(null);
  const [error, setError] = useState("");
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
      async loadDocument() {
        // Next serves public/fixture.pdf from the host application's own disk.
        return { url: "/fixture.pdf", name: "building-plan.pdf" };
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
  }, [tileMode]);
  return <main style={{ height: "100dvh", display: "flex", flexDirection: "column" }}>
    <header style={{ padding: "8px 12px", background: "#edf4ff", color: "#132844" }}>
      <strong>360i-style PDF office example</strong>
      <span data-testid="saved" style={{ marginLeft: 14 }}>{saved || "Not saved"}</span>
      <span data-testid="region" style={{ marginLeft: 14 }}>
        {selected ? "page " + selected.page + ": " + selected.x.toFixed(1) + "%," + selected.y.toFixed(1) + "%" : ""}
      </span>
      {error && <span role="alert">{error}</span>}
      {tileMode && <button type="button" data-testid="remount-tile-viewer"
        onClick={() => setMountId((value) => value + 1)}
        style={{ marginLeft: 12 }}>Remount tile viewer</button>}
    </header>
    <div style={{ flex: 1, minHeight: 0 }}>
      <StrictMode><Editor key={mountId} adapter={adapter} renderMode={tileMode ? "tiles" : "auto"} locale="en" density="office" assets={{
        workerUrl: "/tpdf-assets/pdf.worker.min.mjs",
      }} onRegionSelected={setSelected}
        onError={(issue) => setError(issue.code + ": " + issue.message)} /></StrictMode>
    </div>
  </main>;
}
