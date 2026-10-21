import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { usePdfEngine } from "./usePdfEngine.js";
import { InlineTextContext } from "./InlineTextEditor.js";
import { PageSurface } from "./PageSurface.js";
import { TileViewer } from "./TileViewer.js";
import { TileGrid } from "./TileGrid.js";
import { ResponsivePdfShell } from "./ResponsivePdfShell.js";
import { useContainerLayout } from "./useContainerLayout.js";
import { handleDesktopKeys } from "./desktopKeys.js";
import { useP2Editor } from "./useP2Editor.js";
import { useP3Editor } from "./useP3Editor.js";
import { useP3SaveGuard } from "./useP3SaveGuard.js";
import { useCanvasPageGeometry } from "./useCanvasPageGeometry.js";
import { useCanvasWheelGesture } from "./useCanvasWheelGesture.js";
import { recordP1Selection } from "./recordP1Selection.js";
import { DEFAULT_P1_STYLE, type P1Style } from "./p1Types.js";
import { validMeta, tileLevel } from "./tiles.js";
import { validRegion, type Mark } from "./history.js";
import type { PdfTileMeta, PdfRegion, PdfSearchHit, PdfTool, PdfVersion, TpdfPdfEditorHandle, TpdfPdfEditorProps } from "./types.js";
import { words } from "./editorWords.js";
export const TpdfPdfEditor = forwardRef<TpdfPdfEditorHandle, TpdfPdfEditorProps>(function TpdfPdfEditor(props, ref) {
  const engine = usePdfEngine(props);
  const root = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const measuredLayout = useContainerLayout(root);
  const layout = props.shell === "app" ? measuredLayout : "mobile";
  const [scrollNode, setScrollNode] = useState<HTMLElement | null>(null);
  const [viewWidth, setViewWidth] = useState(800);
  const [grid, setGrid] = useState(false), [tileMeta, setTileMeta] = useState<PdfTileMeta | null>(null);
  const [tileError, setTileError] = useState(""), [dpr, setDpr] = useState(1);
  const [tool, setTool] = useState<PdfTool>("region"), [panMode,setPanMode] = useState(false);
  const [query, setQuery] = useState(""), [results, setResults] = useState<PdfSearchHit[]>([]);
  const [note, setNote] = useState(""), [p1Style, setP1Style] = useState<P1Style>(DEFAULT_P1_STYLE);
  const [region, setRegion] = useState<PdfRegion | null>(null);
  const [fields, setFields] = useState<string[] | null>(null), [versions, setVersions] = useState<PdfVersion[] | null>(null);
  const text = { ...words[props.locale || "vi"], ...props.messages };
  const canvasGeometry = useCanvasPageGeometry(engine.pdf,engine.page);
  const pageWidth = tileMeta?.pages[0]?.width || canvasGeometry.sizes[0]?.width || 612;
  const scale = engine.zoom === "fit" ? Math.max(0.05,
    Math.min(16 / dpr, layout === "mobile" ? 16 : layout === "desktop" ? 1.05 : 1.25,
      (viewWidth - (props.shell === "app" ? 24 : 42)) / pageWidth)) : Math.min(engine.zoom, 16 / dpr);
  const oversized = tileMeta && tileMeta.pages.some((page) => page.width * page.height * scale * scale * dpr * dpr > 8_000_000);
  const sourceSize = engine.source && ("size" in engine.source ? engine.source.size :
    "bytes" in engine.source ? engine.source.bytes.byteLength : undefined);
  const useTiles = Boolean(props.adapter.tiles && tileMeta &&
    (props.tilesOnly || props.renderMode === "tiles" || (props.renderMode !== "canvas" &&
      ((sourceSize || 0) > (props.largeFileBytes ?? 30_000_000) || oversized))));
  useCanvasWheelGesture(scroller,layout!=="mobile"&&!useTiles,scale,dpr);
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
  const p3Changes = engine.history.current.filter((op) => ["redact","measure.calibrate",
    "measure","text.replace"].includes(op.kind)) as import("./p3Types.js").P3Change[];
  const p2Changes = engine.history.current.filter((op) => ["form.create","form.fill",
    "link","attachment"].includes(op.kind)) as import("./p2Types.js").P2Change[];
  useEffect(() => {
    setScrollNode(scroller.current);
    if (!scroller.current) return;
    const observer = new ResizeObserver(([entry]) => setViewWidth(entry.contentRect.width));
    observer.observe(scroller.current);
    return () => observer.disconnect();
  }, [layout]);
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
    save: saveGuard.saveSafely, goToPage: goto, setZoom,
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
  const p2 = useP2Editor({ tool, adapter: props.adapter, region,
    changes: engine.history.current, record: engine.record, report: engine.report,
    versionId: tileMeta?.versionId, pageCount: tileMeta?.pages.length ||
      engine.pdf?.numPages || 0, readOnly: !canEdit, onPlaced: () => setRegion(null) });
  const p3=useP3Editor({adapter:props.adapter,tool,page:engine.page,
    pages:tileMeta?.pages||canvasGeometry.sizes, versionId:tileMeta?.versionId,
    changes:engine.history.current,readOnly:!canEdit,
    locale:props.locale||"vi",
    record:engine.record,report:engine.report,selection:region,
    clearSelection:()=>setRegion(null)});
  const saveGuard=useP3SaveGuard(engine.history.current,engine.save,
    props.adapter.p3Capabilities?.redact?.purgesHistory);
  const [inlineText, setInlineText] = useState<{ region: PdfRegion; points?: Array<[number, number]> } | null>(null);
  function commitSelection(value:PdfRegion,points:Array<[number,number]>|undefined,text:string) {
    void recordP1Selection({tool,region:value,points,adapter:props.adapter,
      note:text,style:p1Style,record:engine.record,report:engine.report,
      clearSelection:()=>setRegion(null)});
  }
  function selected(value:PdfRegion,points?:Array<[number,number]>) {
    setRegion(value);props.onRegionSelected?.(value);
    if(!canEdit||tool==="region")return;
    if(p3.onRegion(value,points))return;
    if(["addText","insertText","callout"].includes(tool)&&props.adapter.applyChanges){
      setInlineText({region:value,points});return;
    }
    commitSelection(value,points,note);
  }
  const inlineState = inlineText && {
    region: inlineText.region,
    commit: (text: string) => { commitSelection(inlineText.region, inlineText.points, text); setInlineText(null); },
    cancel: () => { setInlineText(null); setRegion(null); },
  };
  function builtIn(id: string) {
    if (id === "pages") { setGrid((value) => !value); return; }
    if (id === "fit") { setZoom("fit"); return; }
    if (id === "fitPage") { fitPage(); return; }
    if (id === "pan") { setPanMode(p=>!p); return; }
    if (id === "zoomIn" || id === "zoomOut") { setZoom(scale*(id==="zoomIn"?1.25:0.8)); return; }
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
  function fitPage() {
    const size=tileMeta?.pages[engine.page-1]||canvasGeometry.sizes[engine.page-1];
    if(!size)return setZoom("fit");
    setZoom(Math.max(0.05,Math.min(1.25,16/dpr,(viewWidth-32)/size.width,
      ((scroller.current?.clientHeight||700)-32)/size.height)));
  }
  function keyboard(event: React.KeyboardEvent<HTMLDivElement>) {
    if(handleDesktopKeys(event,layout,{root,goto,page:engine.page,
      redo:engine.redo,readOnly:Boolean(props.readOnly)}))return;
    const typing=Boolean((event.target as HTMLElement).closest("input,textarea,select"));
    if (!typing && (useTiles || layout!=="mobile") && ["+", "=","-"].includes(event.key) &&
      !event.ctrlKey && !event.metaKey) {
      event.preventDefault(); setZoom(scale * (event.key === "-" ? 0.8 : 1.25)); return;
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
      event.preventDefault(); void saveGuard.saveSafely().catch(()=>{});
    } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z" && !props.readOnly) {
      if (layout==="mobile"||!typing) { event.preventDefault(); if (event.shiftKey) engine.redo(); else engine.undo(); }
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
    {saveGuard.dialog}
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
          zoom={scale} parent={scrollNode} selected={region} forcePan={panMode} onRegion={selected} tool={tool} marks={marks} assetUrl={props.adapter.assetUrl} p2Changes={p2Changes}
          p3Changes={p3Changes} onPage={(value) => { if (value !== engine.page) engine.setPage(value); }} />
        : engine.pdf && Array.from({ length: engine.pdf.numPages }, (_, i) =>
          <PageSurface key={i} pdf={engine.pdf!} number={i + 1} scale={scale} parent={scrollNode}
            tool={tool} marks={marks} highlight={region} onRegion={selected} pan={panMode}
            readOnly={Boolean(props.readOnly) && tool !== "region"}
            assetUrl={props.adapter.assetUrl} p2Changes={p2Changes} p3Changes={p3Changes} />)}
    </div>
    {props.children}
  </>;
  return <InlineTextContext.Provider value={inlineState}><div ref={root} className={"tpdf-editor " + (props.className || "")}
    data-theme={props.theme || "system"} data-density={props.density || "office"}
    data-shell={props.shell || "classic"} data-tpdf-layout={layout}
    onKeyDown={keyboard} tabIndex={0} role="region" aria-label="TPDF PDF editor">
    {props.shell === "app" ? <ResponsivePdfShell layout={layout}
      adapter={props.adapter} meta={tileMeta} pdf={engine.pdf}
      openDocuments={props.openDocuments} activeDocumentId={props.activeDocumentId}
      onOpenDocument={props.onOpenDocument} onCloseDocument={props.onCloseDocument}
      onOpenFile={props.onOpenFile} onHome={props.onHome} showHomeButton={props.showHomeButton}
      compactTopBar={props.compactTopBar} topBarStart={props.topBarStart} topBarEnd={props.topBarEnd}
      onZoom={(value)=>setZoom(value)} onFitWidth={()=>setZoom("fit")} onFitPage={fitPage}
      locale={props.locale || "vi"} text={text}
      name={engine.source?.name || "Document.pdf"} dirty={engine.dirty} busy={engine.busy}
      page={engine.page} total={tileMeta?.pages.length || engine.pdf?.numPages || 0}
      zoom={scale} tile={useTiles} canEdit={canEdit} canForms={!useTiles && Boolean(engine.pdf)}
      canSave={canSave} undoEnabled={canEdit && engine.history.past.length > 0}
      redoEnabled={canEdit && engine.history.future.length > 0} tool={tool}
      query={query} results={results} note={note} selection={region}
      tools={props.tools || []} onTool={next=>{setPanMode(false);setInlineText(null);setTool(next);}} onNote={setNote}
      canText={Boolean(props.adapter.resolveTextQuads)} canAsset={Boolean(props.adapter.selectAsset)}
      canP1={Boolean(props.adapter.applyChanges) && canEdit}
      canP2={p2.canP2} canFill={p2.canFill} canAttachment={p2.canAttachment}
      p2Panel={p2.p2Panel} p3Panel={p3.panel}
      p3={{ caps:props.adapter.p3Capabilities,enabled:canEdit,
        count:Boolean(props.adapter.countTextMatches),calibrated:p3.calibrated }}
      saveNotes={engine.saveNotes}
      style={p1Style} onStyle={setP1Style}
      onSearchQuery={setQuery} onSearch={() => void engine.search(query).then(setResults)}
      onGoto={goto} onBuiltin={builtIn} onSave={() => { void saveGuard.saveSafely().catch(()=>{}); }}
      onUndo={engine.undo} onRedo={engine.redo}
      onToolError={(error) => engine.report("host-tool", error)}>{viewer}</ResponsivePdfShell>
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
          .map((name) => <option key={name} value={name}>{text[name as keyof typeof text] || name}</option>)}
      </select>
      {(tool === "note" || tool === "signature") && <input aria-label={text[tool as keyof typeof text] || tool}
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
        <button type="button" disabled={!canSave} onClick={() => { void saveGuard.saveSafely().catch(()=>{}); }}>{text.save}{engine.dirty ? " ●" : ""}</button>
      </>}
      {props.adapter.listVersions && <button type="button" onClick={() => void props.adapter.listVersions!().then(setVersions).catch(
        (err) => engine.report("versions", err))}>{text.versions}</button>}
    </div>{viewer}</>}
  </div></InlineTextContext.Provider>;
});
