import { useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { applyChanges, sourceBytes } from "./pdfChanges.js";
import { change, emptyHistory, redo, undo, type EditHistory, type PdfChange } from "./history.js";
import type { PdfSaved, PdfSearchHit, PdfSource, TpdfPdfEditorProps } from "./types.js";
import { chooseSaveRoute, DEFAULT_LARGE_FILE_BYTES, sizeForSave } from "./saveRoute.js";

export function usePdfEngine(props: TpdfPdfEditorProps) {
  const [source, setSource] = useState<PdfSource | null>(null);
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [firstPageSize, setFirstPageSize] = useState({ width: 612, height: 792 });
  const [history, setHistory] = useState<EditHistory>(emptyHistory);
  const [ocrDirty, setOcrDirty] = useState(false);
  const [revision, setRevision] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [page, setPage] = useState(1);
  const [zoom, setZoom] = useState<number | "fit">("fit");
  const [error, setError] = useState("");
  const locked = useRef(false);
  const dirty = history.current.length > 0 || ocrDirty;
  const threshold = props.largeFileBytes ?? DEFAULT_LARGE_FILE_BYTES;
  const knownSize = source && ("bytes" in source ? source.bytes.byteLength : source.size);
  const large = typeof knownSize === "number" && knownSize > threshold;
  const viewOnly = Boolean(props.readOnly || (large && !props.adapter.applyChanges));
  const report = (code: string, cause: unknown, retryable = true) => {
    const message = cause instanceof Error ? cause.message : String(cause);
    setError(message);
    props.onError?.({ code, message, retryable });
  };
  useEffect(() => { props.onDirtyChange?.(dirty); }, [dirty, props.onDirtyChange]);
  useEffect(() => {
    let disposed = false;
    setBusy(true);
    props.adapter.loadDocument().then((next) => {
      if (!disposed) { setSource(next); setHistory(emptyHistory()); setOcrDirty(false); }
    }).catch((cause) => { if (!disposed) report("load", cause); })
      .finally(() => { if (!disposed) setBusy(false); });
    return () => { disposed = true; };
  }, [props.adapter]);
  useEffect(() => {
    if (!source) return;
    if (!props.assets.workerUrl) {
      report("asset", new Error("assets.workerUrl is required for PDF.js rendering."), false);
      return;
    }
    let disposed = false;
    let task: ReturnType<typeof import("pdfjs-dist").getDocument> | null = null;
    setBusy(true);
    import("pdfjs-dist").then(({ getDocument, GlobalWorkerOptions }) => {
      if (disposed) return;
      GlobalWorkerOptions.workerSrc = props.assets.workerUrl;
      task = getDocument({
        ...("bytes" in source ? { data: new Uint8Array(source.bytes) } : { url: source.url }),
        withCredentials: false, rangeChunkSize: 262144, disableAutoFetch: true,
        disableStream: true,
        isEvalSupported: false,
      });
      return task.promise;
    }).then(async (loaded) => {
      if (disposed || !loaded) return;
      const first = await loaded.getPage(1);
      const { width, height } = first.getViewport({ scale: 1 });
      if (!disposed) { setFirstPageSize({ width, height }); setPdf(loaded); setPage(1); }
    })
      .catch((cause) => { if (!disposed) report("render", cause); })
      .finally(() => { if (!disposed) setBusy(false); });
    return () => { disposed = true; setPdf(null); void task?.destroy(); };
  }, [source, props.assets.workerUrl]);
  function record(edit: PdfChange) {
    if (!viewOnly && !locked.current) setHistory((before) => change(before, edit));
  }
  async function compose(): Promise<Uint8Array> {
    if (!source) throw Error("No PDF document is loaded.");
    return applyChanges(await sourceBytes(source), history.current);
  }
  async function save(): Promise<void> {
    if (viewOnly || locked.current || !source || !dirty) return;
    locked.current = true; setBusy(true);
    try {
      const bytesCount = await sizeForSave(source);
      const mode = chooseSaveRoute(bytesCount, Boolean(props.adapter.applyChanges), threshold);
      if (mode === "blocked") throw Error(
        "Full-file browser save is blocked for large/unknown-size PDFs. Provide adapter.applyChanges and a Range URL.");
      const info = { name: source.name, baseVersionId: revision };
      const savedBytes = mode === "bytes" ? await compose() : null;
      const saved: PdfSaved = mode === "changes"
        ? await props.adapter.applyChanges!(history.current, info)
        : await props.adapter.saveVersion(savedBytes!, info);
      if (!saved?.versionId || !saved.name) throw Error("Adapter must return a new versionId and name.");
      if (saved.versionId === revision) throw Error("Adapter returned the previous versionId.");
      if (mode === "changes") {
        // Load the host's *new* version URL; never materialize its PDF bytes.
        const next: PdfSource = saved.url
          ? { url: saved.url, name: saved.name, size: saved.size }
          : await props.adapter.loadDocument();
        if ("bytes" in next) throw Error("Large-file applyChanges must reload a URL, not bytes.");
        setSource(next);
      } else {
        setSource({ bytes: savedBytes!, name: saved.name });
      }
      setRevision(saved.versionId);
      setHistory(emptyHistory()); setOcrDirty(false); setError("");
      props.onSaved?.(saved);
    } catch (cause) { report("save", cause); }
    finally { locked.current = false; setBusy(false); }
  }
  async function ocr(): Promise<void> {
    if (!props.adapter.runOcr || viewOnly || large || locked.current || !source) return;
    locked.current = true; setBusy(true);
    try {
      const result = await props.adapter.runOcr({ bytes: await compose(), name: source.name });
      if (!(result?.bytes instanceof Uint8Array)) throw Error("Invalid OCR adapter result.");
      setSource({ bytes: result.bytes, name: source.name });
      setHistory(emptyHistory()); setOcrDirty(true);
    } catch (cause) { report("ocr", cause); }
    finally { locked.current = false; setBusy(false); }
  }
  async function search(query: string): Promise<PdfSearchHit[]> {
    if (!query.trim()) return [];
    try {
      if (props.adapter.searchPages) return await props.adapter.searchPages(query);
      if (!pdf) return [];
      const hits: PdfSearchHit[] = [];
      // On-demand sequential lookup; host adapter can provide indexed search.
      for (let p = 1; p <= pdf.numPages; p++) {
        const data = await (await pdf.getPage(p)).getTextContent();
        const text = data.items.map((item) => ("str" in item ? item.str : "")).join(" ");
        const pos = text.toLowerCase().indexOf(query.toLowerCase());
        if (pos >= 0) hits.push({ page: p, snippet: text.slice(Math.max(0, pos - 50), pos + 130), score: 1 });
        if (hits.length >= 100) break;
      }
      return hits;
    } catch (cause) { report("search", cause); return []; }
  }
  async function formFields(): Promise<string[]> {
    try {
      if (!source || large) return [];
      const { PDFDocument, PDFTextField } = await import("pdf-lib");
      const document = await PDFDocument.load(await sourceBytes(source));
      return document.getForm().getFields().filter((field) => field instanceof PDFTextField)
        .map((field) => field.getName()).slice(0, 150);
    } catch (cause) { report("form", cause); return []; }
  }
  return { source, pdf, firstPageSize, history, dirty, busy, large, viewOnly,
    page, setPage, zoom, setZoom, error,
    record, save, ocr, search, formFields, undo: () => setHistory(undo),
    redo: () => setHistory(redo), report };
}
