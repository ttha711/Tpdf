import { useEffect, useRef, useState } from "react";
import { getDocument, GlobalWorkerOptions, type PDFDocumentProxy } from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

GlobalWorkerOptions.workerSrc = workerUrl;

type Region = { page: number; x: number; y: number; width: number; height: number; note: string };
type Command = { type: "goto-page" | "set-zoom" | "highlight-region"; page?: number; zoom?: number; region?: Region };

function getConfig() {
  const params = new URLSearchParams(location.search);
  return { documentId: params.get("file") || "", token: params.get("token") || "" };
}

export function AgentWebEmbedViewer() {
  const initial = useRef(getConfig());
  const [session, setSession] = useState("");
  const [origin, setOrigin] = useState("");
  const [error, setError] = useState("");
  const [documentId, setDocumentId] = useState(initial.current.documentId);
  const [document, setDocument] = useState<PDFDocumentProxy | null>(null);
  const [page, setPage] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [grid, setGrid] = useState(false);
  const [query, setQuery] = useState("");
  const [region, setRegion] = useState<Region | null>(null);
  const [previous, setPrevious] = useState<Region | null>(null);
  const [drawing, setDrawing] = useState<{ x: number; y: number } | null>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const pane = useRef<HTMLDivElement>(null);
  const [pageSize, setPageSize] = useState({ width: 600, height: 800 });
  const base = "/api/tpdf/agent/v1";
  const send = (type: string, values: Record<string, unknown> = {}) => {
    if (origin && window.parent !== window) window.parent.postMessage({ type, ...values }, origin);
  };
  useEffect(() => {
    if (!initial.current.token || !/^[0-9a-f-]{36}$/i.test(initial.current.documentId)) {
      setError("Valid document id and signed token are required.");
      return;
    }
    // Do not retain signed identity in the visible URL or browser history.
    const token = initial.current.token;
    history.replaceState(null, "", "/embed/viewer");
    fetch(base + "/embed/session", { headers: { "x-tpdf-agent-web-identity": token }, cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Unable to authorize embedded viewer.");
        return response.json();
      })
      .then((payload) => { setSession(payload.key); setOrigin(payload.origin); })
      .catch((cause) => setError(String(cause)));
  }, []);
  useEffect(() => {
    if (!session || !documentId) return;
    const task = getDocument({
      url: `${base}/documents/${documentId}/file`,
      httpHeaders: { "x-tpdf-embed-session": session },
      withCredentials: false, disableAutoFetch: true, rangeChunkSize: 65536,
    });
    task.promise.then(setDocument).catch((cause) => setError(String(cause)));
    return () => { void task.destroy(); setDocument(null); };
  }, [session, documentId]);

  useEffect(() => {
    if (!document || !canvas.current) return;
    let cancelled = false;
    let render: { cancel: () => void; promise: Promise<unknown> } | null = null;
    void document.getPage(page).then((pdfPage) => {
      if (cancelled || !canvas.current) return;
      const viewport = pdfPage.getViewport({ scale: zoom * 1.2 });
      const element = canvas.current;
      element.width = Math.ceil(viewport.width);
      element.height = Math.ceil(viewport.height);
      setPageSize({ width: viewport.width, height: viewport.height });
      const context = element.getContext("2d");
      if (!context) return;
      render = pdfPage.render({ canvasContext: context, canvas: element, viewport });
      return render.promise;
    }).catch((cause) => { if (!cancelled && cause?.name !== "RenderingCancelledException") setError(String(cause)); });
    return () => { cancelled = true; render?.cancel(); };
  }, [document, page, zoom]);

  useEffect(() => {
    if (!origin || !document) return;
    send("ready", { pageCount: document.numPages, documentId });
    const receive = (event: MessageEvent<Command>) => {
      if (event.source !== window.parent || event.origin !== origin || !event.data) return;
      if (event.data.type === "goto-page" && Number.isInteger(event.data.page)) {
        setPage(Math.max(1, Math.min(document.numPages, event.data.page!)));
      }
      if (event.data.type === "set-zoom" && Number.isFinite(event.data.zoom)) {
        setZoom(Math.min(4, Math.max(0.4, event.data.zoom!)));
      }
      if (event.data.type === "highlight-region" && event.data.region) setRegion(event.data.region);
    };
    window.addEventListener("message", receive);
    return () => window.removeEventListener("message", receive);
  }, [origin, document, documentId]);

  useEffect(() => { if (document) send("page-changed", { page }); }, [page, document]);
  const toPercent = (event: React.PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: Math.min(100, Math.max(0, (event.clientX - rect.left) * 100 / rect.width)),
      y: Math.min(100, Math.max(0, (event.clientY - rect.top) * 100 / rect.height)),
    };
  };
  const select = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!drawing) return;
    const end = toPercent(event);
    const selected = { page, x: Math.min(drawing.x, end.x), y: Math.min(drawing.y, end.y),
      width: Math.abs(end.x - drawing.x), height: Math.abs(end.y - drawing.y), note: "" };
    setPrevious(region);
    setRegion(selected);
    setDrawing(null);
    send("region-selected", selected);
  };
  async function save() {
    if (!region) return;
    try {
      const response = await fetch(`${base}/documents/${documentId}/operations`, {
        method: "POST", headers: { "Content-Type": "application/json", "x-tpdf-embed-session": session },
        body: JSON.stringify({ type: "mark-region", region }),
      });
      if (!response.ok) throw new Error("Saving marked region failed.");
      const result = await response.json();
      setDocumentId(result.document.id);
      setRegion(null);
      send("document-saved", { url: result.document.url, documentId: result.document.id });
    } catch (cause) { setError(String(cause)); }
  }
  async function search() {
    if (!document || !query.trim()) return;
    for (let i = 1; i <= document.numPages; i++) {
      const contents = await (await document.getPage(i)).getTextContent();
      if (contents.items.some((item) => "str" in item && item.str.toLowerCase().includes(query.toLowerCase()))) {
        setPage(i); return;
      }
    }
    setError("No matches found.");
  }
  return <main style={{ height: "100vh", display: "flex", flexDirection: "column", fontFamily: "sans-serif", background: "#e5e7eb" }}>
    <header style={{ display: "flex", gap: 8, padding: 8, flexWrap: "wrap", background: "white" }}>
      <button onClick={() => setGrid(!grid)}>Pages</button>
      <button onClick={() => setPage(Math.max(1, page - 1))}>←</button>
      <span>{page} / {document?.numPages || "…"}</span>
      <button onClick={() => setPage(Math.min(document?.numPages || 1, page + 1))}>→</button>
      <button onClick={() => setZoom(Math.max(0.4, zoom / 1.25))}>−</button>
      <span>{Math.round(zoom * 100)}%</span>
      <button onClick={() => setZoom(Math.min(4, zoom * 1.25))}>+</button>
      <input aria-label="Search PDF" value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void search(); }} />
      <button onClick={() => void search()}>Find</button>
      <button disabled={!region} onClick={() => { setRegion(previous); setPrevious(null); }}>Undo</button>
      <button disabled={!region} onClick={() => void save()}>Save as new PDF</button>
    </header>
    {error && <div role="alert" style={{ padding: 8, color: "#b91c1c" }}>{error}</div>}
    <section ref={pane} style={{ flex: 1, overflow: "auto", padding: 20, textAlign: "center" }}>
      {grid ? <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {Array.from({ length: document?.numPages || 0 }, (_, i) => <button key={i} onClick={() => { setPage(i + 1); setGrid(false); }}>Page {i + 1}</button>)}
      </div> : <div style={{ display: "inline-block", position: "relative", background: "white" }}>
        <canvas ref={canvas} style={{ display: "block", maxWidth: "100%" }} />
        <div role="application" aria-label="Select a PDF region" onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId); setDrawing(toPercent(e));
        }} onPointerUp={select}
          style={{ position: "absolute", inset: 0, cursor: "crosshair", touchAction: "none" }}>
          {region?.page === page && <div style={{ position: "absolute", pointerEvents: "none",
            left: region.x + "%", top: region.y + "%", width: region.width + "%", height: region.height + "%",
            border: "2px solid #ef4444", background: "#ef444422" }} />}
        </div>
      </div>}
    </section>
  </main>;
}
