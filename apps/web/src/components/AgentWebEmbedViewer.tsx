import { useEffect, useRef, useState } from "react";
import { getDocument, GlobalWorkerOptions, type PDFDocumentProxy } from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { AgentWebEmbedPage, type PdfRegion } from "./AgentWebEmbedPage";

GlobalWorkerOptions.workerSrc = workerUrl;
type Command = { type: "goto-page" | "set-zoom" | "highlight-region"; page?: number;
  zoom?: number; region?: PdfRegion };
const base = "/api/tpdf/agent/v1";
function config() {
  const params = new URLSearchParams(window.location.search);
  return { documentId: params.get("file") || "", token: params.get("token") || "" };
}

export function AgentWebEmbedViewer() {
  const initial = useRef(config());
  const handshake = useRef<Promise<{ key: string; origin: string }> | null>(null);
  const scrollRoot = useRef<HTMLDivElement>(null);
  const targetPage = useRef<number | null>(null);
  const [session, setSession] = useState("");
  const [origin, setOrigin] = useState("");
  const [error, setError] = useState("");
  const [documentId, setDocumentId] = useState(initial.current.documentId);
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [page, setPage] = useState(1);
  const [zoom, setZoom] = useState<number | "fit">("fit");
  const [viewWidth, setViewWidth] = useState(850);
  const [grid, setGrid] = useState(false);
  const [query, setQuery] = useState("");
  const [region, setRegion] = useState<PdfRegion | null>(null);
  const [previous, setPrevious] = useState<PdfRegion | null>(null);
  const scale = zoom === "fit" ? Math.max(0.25, Math.min(2, (viewWidth - 45) / 612)) : zoom;
  const send = (type: string, values: Record<string, unknown> = {}) => {
    if (origin && window.parent !== window) window.parent.postMessage({ type, ...values }, origin);
  };

  useEffect(() => {
    if (!initial.current.token || !/^[0-9a-f-]{36}$/i.test(initial.current.documentId)) {
      setError("A PDF document ID and signed token are required.");
      return;
    }
    let cancelled = false;
    // One HTTP request even under React.StrictMode double effect invocation.
    if (!handshake.current) {
      const token = initial.current.token;
      history.replaceState(null, "", "/embed/viewer");
      handshake.current = fetch(base + "/embed/session", {
        headers: { "x-tpdf-agent-web-identity": token }, cache: "no-store",
      }).then(async (response) => {
        if (!response.ok) throw Error("Unable to authorize embedded viewer.");
        return response.json() as Promise<{ key: string; origin: string }>;
      });
    }
    void handshake.current.then((data) => {
      if (!cancelled) { setSession(data.key); setOrigin(data.origin); }
    }).catch((cause) => { if (!cancelled) setError(String(cause)); });
    return () => { cancelled = true; };
  }, []);
  useEffect(() => {
    if (!session || !documentId) return;
    let cancelled = false;
    const task = getDocument({ url: base + "/documents/" + documentId + "/file",
      httpHeaders: { "x-tpdf-embed-session": session }, disableAutoFetch: true,
      withCredentials: false, rangeChunkSize: 65536 });
    void task.promise.then((value) => { if (!cancelled) setPdf(value); })
      .catch((cause) => { if (!cancelled) setError(String(cause)); });
    return () => { cancelled = true; setPdf(null); void task.destroy(); };
  }, [session, documentId]);
  useEffect(() => {
    if (!scrollRoot.current) return;
    const observer = new ResizeObserver(([entry]) => setViewWidth(entry.contentRect.width));
    observer.observe(scrollRoot.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!origin || !pdf) return;
    send("ready", { pageCount: pdf.numPages, documentId });
    const listener = (event: MessageEvent<Command>) => {
      if (event.source !== window.parent || event.origin !== origin || !event.data) return;
      if (event.data.type === "goto-page" && Number.isInteger(event.data.page)) goto(event.data.page!);
      if (event.data.type === "set-zoom" && Number.isFinite(event.data.zoom)) {
        setZoom(Math.max(0.25, Math.min(2, event.data.zoom!)));
      }
      if (event.data.type === "highlight-region" && validRegion(event.data.region, pdf.numPages)) {
        setRegion(event.data.region!);
        goto(event.data.region!.page);
      }
    };
    window.addEventListener("message", listener);
    return () => window.removeEventListener("message", listener);
  }, [origin, pdf, documentId]);
  useEffect(() => { if (pdf) send("page-changed", { page }); }, [page, pdf, origin]);
  useEffect(() => {
    if (grid || targetPage.current === null) return;
    const number = targetPage.current;
    targetPage.current = null;
    requestAnimationFrame(() => scrollRoot.current?.querySelector(
      '[data-agent-page="' + number + '"]')?.scrollIntoView({ block: "start" }));
  }, [page, grid]);
  function goto(number: number) {
    if (!pdf || !Number.isInteger(number)) return;
    const next = Math.max(1, Math.min(pdf.numPages, number));
    targetPage.current = next;
    setGrid(false);
    setPage(next);
  }
  function onScroll() {
    const root = scrollRoot.current;
    if (!root) return;
    const center = root.getBoundingClientRect().top + root.clientHeight / 2;
    let best = { page, distance: Infinity };
    for (const element of root.querySelectorAll<HTMLElement>("[data-agent-page]")) {
      const rect = element.getBoundingClientRect();
      const distance = Math.abs((rect.top + rect.bottom) / 2 - center);
      if (distance < best.distance) best = { page: Number(element.dataset.agentPage), distance };
    }
    if (best.page !== page) setPage(best.page);
  }
  function selected(next: PdfRegion) {
    setPrevious(region); setRegion(next); send("region-selected", next);
  }
  async function save() {
    if (!region) return;
    try {
      const response = await fetch(base + "/documents/" + documentId + "/operations", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-tpdf-embed-session": session },
        body: JSON.stringify({ type: "mark-region", region }),
      });
      if (!response.ok) throw Error("Unable to save marked region.");
      const data = await response.json();
      setDocumentId(data.document.id);
      setRegion(null);
      send("document-saved", { url: data.document.url, documentId: data.document.id });
    } catch (cause) { setError(String(cause)); }
  }
  async function search() {
    if (!pdf || !query.trim()) return;
    for (let number = 1; number <= Math.min(pdf.numPages, 1500); number++) {
      const content = await (await pdf.getPage(number)).getTextContent();
      if (content.items.some((item) => "str" in item && item.str.toLowerCase().includes(query.toLowerCase()))) {
        goto(number); return;
      }
    }
    setError("No matching text found.");
  }
  return <main style={{ height: "100vh", display: "flex", flexDirection: "column",
    background: "#e5e7eb", fontFamily: "sans-serif" }}>
    <header style={{ background: "white", display: "flex", alignItems: "center",
      padding: 8, gap: 7, flexWrap: "wrap" }}>
      <button onClick={() => setGrid(!grid)} aria-label="Page grid">Pages</button>
      <button onClick={() => goto(page - 1)}>←</button>
      <span>{page} / {pdf?.numPages || "…"}</span>
      <button onClick={() => goto(page + 1)}>→</button>
      <select aria-label="Zoom" value={String(zoom)} onChange={(event) =>
        setZoom(event.target.value === "fit" ? "fit" : Number(event.target.value))}>
        <option value="fit">Fit</option>
        <option value="0.25">25%</option>
        <option value="0.5">50%</option>
        <option value="1">100%</option>
        <option value="2">200%</option>
      </select>
      <input aria-label="Search PDF" value={query} onChange={(event) => setQuery(event.target.value)}
        onKeyDown={(event) => { if (event.key === "Enter") void search(); }} />
      <button onClick={() => void search()}>Find</button>
      {region && <input aria-label="Region note" placeholder="Note" value={region.note}
        onChange={(event) => selected({ ...region, note: event.target.value.slice(0, 500) })} />}
      <button disabled={!region} onClick={() => { setRegion(previous); setPrevious(null); }}>Undo</button>
      <button disabled={!region} onClick={() => void save()}>Save new version</button>
    </header>
    {error ? <div role="alert" style={{ color: "#b91c1c", padding: 8 }}>{error}</div> : null}
    <div ref={scrollRoot} onScroll={onScroll} style={{ flex: 1, overflow: "auto", padding: 16 }}>
      {grid ? <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {Array.from({ length: pdf?.numPages || 0 }, (_, index) =>
          <button key={index} onClick={() => goto(index + 1)}>Page {index + 1}</button>)}
      </div> : pdf ? Array.from({ length: pdf.numPages }, (_, index) =>
        <AgentWebEmbedPage key={index} pdf={pdf} number={index + 1}
          scrollRoot={scrollRoot.current} scale={scale}
          region={region} onSelect={selected} />) : null}
    </div>
  </main>;
}
function validRegion(value: PdfRegion | undefined, count: number) {
  return Boolean(value && Number.isInteger(value.page) && value.page > 0 && value.page <= count &&
    [value.x, value.y, value.width, value.height].every((n) => Number.isFinite(n) && n >= 0 && n <= 100) &&
    value.width > 0 && value.height > 0 && value.x + value.width <= 100 && value.y + value.height <= 100);
}
