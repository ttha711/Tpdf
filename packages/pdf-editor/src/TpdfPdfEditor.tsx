import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { usePdfEngine } from "./usePdfEngine.js";
import { PageSurface } from "./PageSurface.js";
import { TileViewer } from "./TileViewer.js";
import { TileGrid } from "./TileGrid.js";
import { AppShell } from "./AppShell.js";
import { buildP1Mark } from "./p1Marks.js";
import { DEFAULT_P1_STYLE, P1_TOOLS, TEXT_MARKUP, ASSET_TOOL,
  type P1Asset, type P1Point, type P1Quad, type P1Style } from "./p1Types.js";
import { validMeta, tileLevel } from "./tiles.js";
import type { PdfTileMeta } from "./types.js";
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
  const [tileMeta, setTileMeta] = useState<PdfTileMeta | null>(null);
  const [tileError, setTileError] = useState("");
  const [dpr, setDpr] = useState(1);
  const [tool, setTool] = useState<PdfTool>("region");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PdfSearchHit[]>([]);
  const [note, setNote] = useState("");
  const [p1Style, setP1Style] = useState<P1Style>(DEFAULT_P1_STYLE);
  const [region, setRegion] = useState<PdfRegion | null>(null);
  const [fields, setFields] = useState<string[] | null>(null);
  const [versions, setVersions] = useState<PdfVersion[] | null>(null);
  const text = { ...words[props.locale || "vi"], ...props.messages };
  const pageWidth = tileMeta?.pages[0]?.width || 612;
  const scale = engine.zoom === "fit" ? Math.max(0.05,
    Math.min(16 / dpr, (viewWidth - (props.shell === "app" ? 24 : 42)) / pageWidth)) : Math.min(engine.zoom, 16 / dpr);
  const oversized = tileMeta && tileMeta.pages.some((page) => page.width * page.height * scale * scale * dpr * dpr > 8_000_000);
  const sourceSize = engine.source && ("size" in engine.source ? engine.source.size :
    "bytes" in engine.source ? engine.source.bytes.byteLength : undefined);
  const useTiles = Boolean(props.adapter.tiles && tileMeta &&
    (props.tilesOnly || props.renderMode === "tiles" || (props.renderMode !== "canvas" &&
      ((sourceSize || 0) > (props.largeFileBytes ?? 30_000_000) || oversized))));
  useEffect(() => { setDpr(window.devicePixelRatio || 1); }, []);
  useEffect(() => {
    if (!props.adapter.tiles || (props.renderMode === "canvas" && !props.tilesOnly)) {
      setTileMeta(null);
      if (props.tilesOnly && !props.adapter.tiles) props.onError?.({ code: "tiles",
        message: "tilesOnly requires adapter.tiles", retryable: false });
      return;
    }
    let alive = true;
    props.adapter.tiles.meta().then(validMeta).then((value) => {
      if (alive) { setTileMeta(value); setTileError(""); }
    }).catch((error) => {
      if (alive) { setTileError(String(error)); props.onError?.({
        code: "tiles", message: String(error), retryable: true }); }
    });
    return () => { alive = false; };
  }, [props.adapter, props.renderMode, props.tilesOnly]);
  const marks: Mark[] = engine.history.current.filter((op) => op.kind === "mark").map((op) => op.mark);
  useEffect(() => {
    setScrollNode(scroller.current);
    if (!scroller.current) return;
    const observer = new ResizeObserver(([entry]) => setViewWidth(entry.contentRect.width));
    observer.observe(scroller.current);
    return () => observer.disconnect();
  }, []);
  function goto(n: number) {
    if ((!engine.pdf && !tileMeta) || !Number.isInteger(n)) return;
    const page = Math.max(1, Math.min(tileMeta?.pages.length || engine.pdf!.numPages, n));
    engine.setPage(page); setGrid(false);
    requestAnimationFrame(() => {
      const node = scroller.current;
      if (!node) return;
      if (useTiles && tileMeta) {
        node.scrollTop = tileMeta.pages.slice(0, page - 1)
          .reduce((sum, item) => sum + item.height * scale + 16, 0);
      } else node.querySelector('[data-tpdf-page="' + page + '"]')?.scrollIntoView({ block: "start" });
    });
  }
  function setZoom(value: number | "fit") {
    engine.setZoom(value === "fit" ? "fit" : Math.max(0.05, Math.min(16 / dpr, value)));
  }
  useImperativeHandle(ref, () => ({
    save: engine.save, goToPage: goto, setZoom,
    highlightRegion: (value) => {
      if (validRegion(value, tileMeta?.pages.length || engine.pdf?.numPages || 0)) {
        setRegion(value); goto(value.page);
      }
    }, undo: engine.undo, redo: engine.redo,
  }));
  useEffect(() => { props.onPageChange?.(engine.page); }, [engine.page, props.onPageChange]);
  const canEdit = !props.readOnly && (!useTiles || Boolean(props.adapter.applyChanges));
  const canSave = canEdit && engine.dirty && !engine.busy &&
    Boolean(props.adapter.saveVersion || props.adapter.applyChanges);
  function selected(value: PdfRegion, points?: Array<[number, number]>) {
    setRegion(value); props.onRegionSelected?.(value);
    if (!canEdit || tool === "region") return;
    const legacy: Array<PdfTool> = ["highlight","note","draw","cover","signature"];
    const useP1 = P1_TOOLS.includes(tool as typeof P1_TOOLS[number]) &&
      !(tool === "highlight" && !props.adapter.resolveTextQuads) &&
      !(tool === "signature" && !props.adapter.selectAsset);
    if (!useP1) {
      if (!legacy.includes(tool)) return;
      const oldType = tool as "highlight" | "note" | "draw" | "cover" | "signature";
      engine.record({ kind: "mark", mark: { type: oldType, region: value,
        value: tool === "note" || tool === "signature" ? note : undefined, points } });
      return;
    }
    void (async () => {
      try {
        const p1Tool = tool as typeof P1_TOOLS[number];
        const quads: P1Quad[] | undefined =
          TEXT_MARKUP.includes(p1Tool as typeof TEXT_MARKUP[number])
            ? await props.adapter.resolveTextQuads?.(value.page, value) : undefined;
        const asset = ASSET_TOOL.includes(p1Tool as P1Asset)
          ? await props.adapter.selectAsset?.(p1Tool as P1Asset) : undefined;
        if (ASSET_TOOL.includes(p1Tool as P1Asset) && !asset) return;
        const path: P1Point[] = (points || [[value.x, value.y],
          [value.x + value.width, value.y + value.height]])
          .map(([x,y]) => ({ x, y }));
        const mark = buildP1Mark({ tool: p1Tool, region: value, style: p1Style,
          path, text: note, quads, assetId: asset?.assetId });
        engine.record({ kind: "mark", mark });
      } catch (error) { engine.report("p1-mark", error, false); }
    })();
  }
  function builtIn(id: string) {
    if (id === "pages") { setGrid((value) => !value); return; }
    if (id === "fit") { setZoom("fit"); return; }
    if (id.startsWith("zoom")) {
      const percent = Number(id.slice(4));
      if (Number.isFinite(percent) && percent >= 25 && percent <= 800) setZoom(percent / 100);
      return;
    }
    if (id === "form") { void engine.formFields().then(setFields); return; }
    if (!canEdit) return;
    if (id === "rotate" || id === "delete" || id === "insert") {
      engine.record({ kind: id, page: engine.page }); return;
    }
    if (id === "moveUp" || id === "moveDown") engine.record({
      kind: "move", page: engine.page, to: Math.max(1,
        engine.page + (id === "moveUp" ? -1 : 1)),
    });
  }
  function keyboard(event: React.KeyboardEvent<HTMLDivElement>) {
    if (useTiles && ["+", "=","-"].includes(event.key) && !event.ctrlKey && !event.metaKey) {
      event.preventDefault(); setZoom(scale * (event.key === "-" ? 0.8 : 1.25)); return;
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
      event.preventDefault(); void engine.save();
    } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z" && !props.readOnly) {
      event.preventDefault(); if (event.shiftKey) engine.redo(); else engine.undo();
    }
  }
  function scroll() {
    if (!scroller.current || !engine.pdf || grid || useTiles) return;
    const center = scroller.current.getBoundingClientRect().top + scroller.current.clientHeight / 2;
    let nearest = { index: engine.page, distance: Infinity };
    for (const el of scroller.current.querySelectorAll<HTMLElement>("[data-tpdf-page]")) {
      const rect = el.getBoundingClientRect(), distance = Math.abs((rect.top + rect.bottom) / 2 - center);
      if (distance < nearest.distance) nearest = { index: Number(el.dataset.tpdfPage), distance };
    }
    if (nearest.index !== engine.page) engine.setPage(nearest.index);
  }
  function wheelZoom(event: Event) {
    const data = (event as CustomEvent<{ next: number; x: number; y: number }>).detail;
    if (!scroller.current) return;
    const node = scroller.current, old = scale;
    const left = node.scrollLeft + data.x, top = node.scrollTop + data.y;
    setZoom(data.next);
    requestAnimationFrame(() => {
      node.scrollLeft = left * data.next / old - data.x;
      node.scrollTop = top * data.next / old - data.y;
    });
  }
  useEffect(() => {
    const node = scroller.current;
    if (!node) return;
    node.addEventListener("tpdf-tile-zoom", wheelZoom);
    return () => node.removeEventListener("tpdf-tile-zoom", wheelZoom);
  });
  const viewer = <>
    {tileError && <div className="tpdf-error" role="alert">{tileError}</div>}
    {engine.busy && <div className="tpdf-status" role="status">{text.loading}</div>}
    {engine.error && <div className="tpdf-error" role="alert">{engine.error}</div>}
    {fields && <div className="tpdf-inline-panel">{fields.map((field) =>
      <label key={field}>{field}<input disabled={!canEdit} aria-label={field}
        onChange={(e) => engine.record({ kind: "field", field, value: e.target.value })} /></label>)}</div>}
    {versions && <div className="tpdf-inline-panel">{versions.map((v) =>
      <span key={v.versionId}>{v.name} · {v.createdAt}</span>)}</div>}
    {props.shell !== "app" && results.length > 0 && <div className="tpdf-inline-panel">
      {results.map((r) => <button key={r.page} onClick={() => goto(r.page)}>
        {r.page}: {r.snippet.slice(0, 75)}</button>)}
    </div>}
    <div ref={scroller} className="tpdf-scroll" onScroll={scroll}>
      {grid ? (useTiles && tileMeta && props.adapter.tiles
        ? <TileGrid adapter={props.adapter.tiles} meta={tileMeta} parent={scrollNode}
            currentPage={engine.page} onGoto={goto} />
        : <div className="tpdf-page-grid">{Array.from({ length: engine.pdf?.numPages || 0 }, (_, i) =>
            <button type="button" key={i} onClick={() => goto(i + 1)}>{text.pages} {i + 1}</button>)}</div>)
        : useTiles && tileMeta && props.adapter.tiles ? <TileViewer tiles={props.adapter.tiles} meta={tileMeta}
          zoom={scale} parent={scrollNode} selected={region} onRegion={selected} tool={tool} marks={marks}
          onPage={(value) => { if (value !== engine.page) engine.setPage(value); }} />
        : engine.pdf && Array.from({ length: engine.pdf.numPages }, (_, i) =>
          <PageSurface key={i} pdf={engine.pdf!} number={i + 1} scale={scale} parent={scrollNode}
            tool={tool} marks={marks} highlight={region} onRegion={selected}
            readOnly={Boolean(props.readOnly) && tool !== "region"} />)}
    </div>
    {props.children}
  </>;
  return <div ref={root} className={"tpdf-editor " + (props.className || "")}
    data-theme={props.theme || "system"} data-density={props.density || "office"}
    data-shell={props.shell || "classic"}
    onKeyDown={keyboard} tabIndex={0} role="region" aria-label="TPDF PDF editor">
    {props.shell === "app" ? <AppShell locale={props.locale || "vi"} text={text}
      name={engine.source?.name || "Document.pdf"} dirty={engine.dirty} busy={engine.busy}
      page={engine.page} total={tileMeta?.pages.length || engine.pdf?.numPages || 0}
      zoom={scale} tile={useTiles} canEdit={canEdit} canForms={!useTiles && Boolean(engine.pdf)}
      canSave={canSave} undoEnabled={canEdit && engine.history.past.length > 0}
      redoEnabled={canEdit && engine.history.future.length > 0} tool={tool}
      query={query} results={results} note={note} selection={region}
      tools={props.tools || []} onTool={setTool} onNote={setNote}
      canText={Boolean(props.adapter.resolveTextQuads)} canAsset={Boolean(props.adapter.selectAsset)}
      style={p1Style} onStyle={setP1Style}
      onSearchQuery={setQuery} onSearch={() => void engine.search(query).then(setResults)}
      onGoto={goto} onBuiltin={builtIn} onSave={() => void engine.save()}
      onUndo={engine.undo} onRedo={engine.redo}
      onToolError={(error) => engine.report("host-tool", error)}>{viewer}</AppShell>
      : <><div className="tpdf-toolbar" role="toolbar" aria-label="PDF controls">
      <button type="button" onClick={() => setGrid(!grid)}>{text.pages}</button>
      <button type="button" aria-label="Previous page" onClick={() => goto(engine.page - 1)}>‹</button>
      <span aria-live="polite">{engine.page}/{(useTiles ? tileMeta?.pages.length : engine.pdf?.numPages) || "…"}</span>
      <button type="button" aria-label="Next page" onClick={() => goto(engine.page + 1)}>›</button>
      <select aria-label="Zoom" value={String(engine.zoom)}
        onChange={(event) => setZoom(event.target.value === "fit" ? "fit" : Number(event.target.value))}>
        <option value="fit">{text.fit}</option>
        {[0.25, 0.5, 1, 2, 4, 8].filter((n) => !useTiles || n * dpr <= 16).map((n) => <option key={n} value={n}>{n * 100}%</option>)}
      </select>
      <input aria-label={text.search} value={query} placeholder={text.search}
        onChange={(event) => setQuery(event.target.value)}
        onKeyDown={(event) => { if (event.key === "Enter") void engine.search(query).then(setResults); }} />
      <button type="button" onClick={() => void engine.search(query).then(setResults)}>{text.search}</button>
      <select aria-label="Annotation tool" value={tool}
        onChange={(event) => setTool(event.target.value as PdfTool)}>
        {((useTiles && !props.adapter.applyChanges ? ["region"] : ["region", "highlight", "note", "draw", "cover", "signature"]) as PdfTool[])
          .map((name) => <option key={name} value={name}>{text[name]}</option>)}
      </select>
      {(tool === "note" || tool === "signature") && <input aria-label={text[tool]}
        value={note} onChange={(event) => setNote(event.target.value)} maxLength={160} />}
      {canEdit && <>
        <button type="button" onClick={engine.undo} disabled={!engine.history.past.length}>{text.undo}</button>
        <button type="button" onClick={engine.redo} disabled={!engine.history.future.length}>{text.redo}</button>
        <button type="button" onClick={() => engine.record({ kind: "rotate", page: engine.page })}>{text.rotate}</button>
        <button type="button" onClick={() => engine.record({ kind: "delete", page: engine.page })}>{text.delete}</button>
        <button type="button" onClick={() => engine.record({ kind: "insert", page: engine.page })}>{text.insert}</button>
        <button type="button" onClick={() => engine.record({ kind: "move", page: engine.page, to: Math.max(1, engine.page - 1) })}>{text.moveUp}</button>
        <button type="button" onClick={() => engine.record({ kind: "move", page: engine.page, to: engine.page + 1 })}>{text.moveDown}</button>
        <button type="button" onClick={() => void engine.formFields().then(setFields)}>{text.form}</button>
        {props.adapter.runOcr && <button type="button" onClick={() => void engine.ocr()}>{text.ocr}</button>}
        <button type="button" disabled={!canSave} onClick={() => void engine.save()}>{text.save}{engine.dirty ? " ●" : ""}</button>
      </>}
      {props.adapter.listVersions && <button type="button" onClick={() => void props.adapter.listVersions!().then(setVersions).catch(
        (err) => engine.report("versions", err))}>{text.versions}</button>}
    </div>{viewer}</>}
  </div>;
});
