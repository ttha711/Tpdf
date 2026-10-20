import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { usePdfEngine } from "./usePdfEngine.js";
import { PageSurface } from "./PageSurface.js";
import { validRegion, type Mark } from "./history.js";
import type { PdfRegion, PdfSearchHit, PdfTool, PdfVersion, TpdfPdfEditorHandle, TpdfPdfEditorProps } from "./types.js";

const words = {
  vi: { save: "Lưu phiên bản", search: "Tìm", pages: "Trang", fit: "Vừa khung",
    undo: "Hoàn tác", redo: "Làm lại", region: "Chọn vùng", highlight: "Tô sáng",
    note: "Ghi chú", draw: "Vẽ", cover: "Che (không xóa chữ)",
    signature: "Chữ ký hiển thị", rotate: "Xoay", delete: "Xóa trang",
    insert: "Chèn trang", moveUp: "Trang trước", moveDown: "Trang sau",
    ocr: "OCR", form: "Biểu mẫu", versions: "Phiên bản", loading: "Đang xử lý…" },
  en: { save: "Save version", search: "Find", pages: "Pages", fit: "Fit",
    undo: "Undo", redo: "Redo", region: "Select region", highlight: "Highlight",
    note: "Note", draw: "Draw", cover: "Cover (not secure erase)",
    signature: "Visual signature", rotate: "Rotate", delete: "Delete page",
    insert: "Insert page", moveUp: "Move up", moveDown: "Move down",
    ocr: "OCR", form: "Form", versions: "Versions", loading: "Working…" },
};

export const TpdfPdfEditor = forwardRef<TpdfPdfEditorHandle, TpdfPdfEditorProps>(function TpdfPdfEditor(props, ref) {
  const engine = usePdfEngine(props);
  const root = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const [scrollNode, setScrollNode] = useState<HTMLElement | null>(null);
  const [viewWidth, setViewWidth] = useState(800);
  const [grid, setGrid] = useState(false);
  const [tool, setTool] = useState<PdfTool>("region");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PdfSearchHit[]>([]);
  const [note, setNote] = useState("");
  const [region, setRegion] = useState<PdfRegion | null>(null);
  const [fields, setFields] = useState<string[] | null>(null);
  const [versions, setVersions] = useState<PdfVersion[] | null>(null);
  const text = { ...words[props.locale || "vi"], ...props.messages };
  const scale = engine.zoom === "fit" ? Math.max(0.25, Math.min(2, (viewWidth - 42) / 612)) : engine.zoom;
  const marks: Mark[] = engine.history.current.filter((op) => op.kind === "mark").map((op) => op.mark);
  useEffect(() => {
    setScrollNode(scroller.current);
    if (!scroller.current) return;
    const observer = new ResizeObserver(([entry]) => setViewWidth(entry.contentRect.width));
    observer.observe(scroller.current);
    return () => observer.disconnect();
  }, []);
  function goto(n: number) {
    if (!engine.pdf || !Number.isInteger(n)) return;
    const page = Math.max(1, Math.min(engine.pdf.numPages, n));
    engine.setPage(page); setGrid(false);
    requestAnimationFrame(() => scroller.current?.querySelector(
      '[data-tpdf-page="' + page + '"]')?.scrollIntoView({ block: "start" }));
  }
  function setZoom(value: number | "fit") {
    engine.setZoom(value === "fit" ? "fit" : Math.max(0.25, Math.min(2, value)));
  }
  useImperativeHandle(ref, () => ({
    save: engine.save, goToPage: goto, setZoom,
    highlightRegion: (value) => {
      if (validRegion(value, engine.pdf?.numPages || 0)) { setRegion(value); goto(value.page); }
    }, undo: engine.undo, redo: engine.redo,
  }));
  useEffect(() => { props.onPageChange?.(engine.page); }, [engine.page, props.onPageChange]);
  function selected(value: PdfRegion, points?: Array<[number, number]>) {
    setRegion(value); props.onRegionSelected?.(value);
    if (props.readOnly || tool === "region") return;
    engine.record({ kind: "mark", mark: { type: tool, region: value,
      value: tool === "note" || tool === "signature" ? note : undefined, points } });
  }
  function keyboard(event: React.KeyboardEvent<HTMLDivElement>) {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
      event.preventDefault(); void engine.save();
    } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z" && !props.readOnly) {
      event.preventDefault(); if (event.shiftKey) engine.redo(); else engine.undo();
    }
  }
  function scroll() {
    if (!scroller.current || !engine.pdf || grid) return;
    const center = scroller.current.getBoundingClientRect().top + scroller.current.clientHeight / 2;
    let nearest = { index: engine.page, distance: Infinity };
    for (const el of scroller.current.querySelectorAll<HTMLElement>("[data-tpdf-page]")) {
      const rect = el.getBoundingClientRect(), distance = Math.abs((rect.top + rect.bottom) / 2 - center);
      if (distance < nearest.distance) nearest = { index: Number(el.dataset.tpdfPage), distance };
    }
    if (nearest.index !== engine.page) engine.setPage(nearest.index);
  }
  return <div ref={root} className={"tpdf-editor " + (props.className || "")}
    data-theme={props.theme || "system"} data-density={props.density || "office"}
    onKeyDown={keyboard} tabIndex={0} role="region" aria-label="TPDF PDF editor">
    <div className="tpdf-toolbar" role="toolbar" aria-label="PDF controls">
      <button type="button" onClick={() => setGrid(!grid)}>{text.pages}</button>
      <button type="button" aria-label="Previous page" onClick={() => goto(engine.page - 1)}>‹</button>
      <span aria-live="polite">{engine.page}/{engine.pdf?.numPages || "…"}</span>
      <button type="button" aria-label="Next page" onClick={() => goto(engine.page + 1)}>›</button>
      <select aria-label="Zoom" value={String(engine.zoom)}
        onChange={(event) => setZoom(event.target.value === "fit" ? "fit" : Number(event.target.value))}>
        <option value="fit">{text.fit}</option>
        {[0.25, 0.5, 1, 2].map((n) => <option key={n} value={n}>{n * 100}%</option>)}
      </select>
      <input aria-label={text.search} value={query} placeholder={text.search}
        onChange={(event) => setQuery(event.target.value)}
        onKeyDown={(event) => { if (event.key === "Enter") void engine.search(query).then(setResults); }} />
      <button type="button" onClick={() => void engine.search(query).then(setResults)}>{text.search}</button>
      <select aria-label="Annotation tool" value={tool}
        onChange={(event) => setTool(event.target.value as PdfTool)}>
        {(["region", "highlight", "note", "draw", "cover", "signature"] as PdfTool[])
          .map((name) => <option key={name} value={name}>{text[name]}</option>)}
      </select>
      {(tool === "note" || tool === "signature") && <input aria-label={text[tool]}
        value={note} onChange={(event) => setNote(event.target.value)} maxLength={160} />}
      {!props.readOnly && <>
        <button type="button" onClick={engine.undo} disabled={!engine.history.past.length}>{text.undo}</button>
        <button type="button" onClick={engine.redo} disabled={!engine.history.future.length}>{text.redo}</button>
        <button type="button" onClick={() => engine.record({ kind: "rotate", page: engine.page })}>{text.rotate}</button>
        <button type="button" onClick={() => engine.record({ kind: "delete", page: engine.page })}>{text.delete}</button>
        <button type="button" onClick={() => engine.record({ kind: "insert", page: engine.page })}>{text.insert}</button>
        <button type="button" onClick={() => engine.record({ kind: "move", page: engine.page, to: Math.max(1, engine.page - 1) })}>{text.moveUp}</button>
        <button type="button" onClick={() => engine.record({ kind: "move", page: engine.page, to: engine.page + 1 })}>{text.moveDown}</button>
        <button type="button" onClick={() => void engine.formFields().then(setFields)}>{text.form}</button>
        {props.adapter.runOcr && <button type="button" onClick={() => void engine.ocr()}>{text.ocr}</button>}
        <button type="button" disabled={!engine.dirty || engine.busy} onClick={() => void engine.save()}>{text.save}{engine.dirty ? " ●" : ""}</button>
      </>}
      {props.adapter.listVersions && <button type="button" onClick={() => void props.adapter.listVersions!().then(setVersions).catch(
        (err) => engine.report("versions", err))}>{text.versions}</button>}
    </div>
    {engine.busy && <div className="tpdf-status" role="status">{text.loading}</div>}
    {engine.error && <div className="tpdf-error" role="alert">{engine.error}</div>}
    {fields && <div className="tpdf-inline-panel">{fields.map((field) =>
      <label key={field}>{field}<input disabled={props.readOnly} aria-label={field}
        onChange={(e) => engine.record({ kind: "field", field, value: e.target.value })} /></label>)}</div>}
    {versions && <div className="tpdf-inline-panel">{versions.map((v) =>
      <span key={v.versionId}>{v.name} · {v.createdAt}</span>)}</div>}
    {results.length > 0 && <div className="tpdf-inline-panel">{results.map((r) =>
      <button key={r.page} onClick={() => goto(r.page)}>{r.page}: {r.snippet.slice(0, 75)}</button>)}</div>}
    <div ref={scroller} className="tpdf-scroll" onScroll={scroll}>
      {grid ? <div className="tpdf-page-grid">{Array.from({ length: engine.pdf?.numPages || 0 }, (_, i) =>
        <button type="button" key={i} onClick={() => goto(i + 1)}>{text.pages} {i + 1}</button>)}</div>
        : engine.pdf && Array.from({ length: engine.pdf.numPages }, (_, i) =>
          <PageSurface key={i} pdf={engine.pdf!} number={i + 1} scale={scale} parent={scrollNode}
            tool={tool} marks={marks} highlight={region} onRegion={selected}
            readOnly={Boolean(props.readOnly) && tool !== "region"} />)}
    </div>
    {props.children}
  </div>;
});
