import { useEffect, useRef, useState } from "react";
import { DesktopRibbon } from "./DesktopRibbon.js";
import { DesktopSidebar, type SidebarTab } from "./DesktopSidebar.js";
import { P1StyleBar } from "./P1StyleBar.js";
import { P3SaveToast } from "./P3SaveToast.js";
import { usePdfBookmarks } from "./usePdfBookmarks.js";
import type { AppShellProps } from "./AppShell.js";
import type { ShellLayout } from "./useContainerLayout.js";
import type { PdfTileMeta, TpdfPdfAdapter } from "./types.js";
import type { PDFDocumentProxy } from "pdfjs-dist";

export type DesktopShellProps = AppShellProps & {
  layout:Exclude<ShellLayout,"mobile">; adapter:TpdfPdfAdapter;
  meta:PdfTileMeta|null; pdf:PDFDocumentProxy|null;
  onZoom:(value:number)=>void; onFitWidth:()=>void; onFitPage:()=>void;
};
const inspectorTools = new Set(["redact","replaceText","calibrate","distance",
  "perimeter","area","textField","checkbox","dropdown","listBox","fill","link","attachment"]);
export function DesktopShell(p:DesktopShellProps) {
  const [sidebarOpen,setSidebarOpen]=useState(p.layout==="desktop");
  const [inspectorOpen,setInspectorOpen]=useState(p.layout==="desktop");
  const [sidebarTab,setSidebarTab]=useState<SidebarTab>("pages");
  const [sidebarWidth,setSidebarWidth]=useState(220);
  const [ribbonCompact,setRibbonCompact]=useState(p.layout==="tablet");
  const resizing=useRef(false);
  const shell=useRef<HTMLDivElement>(null);
  const bookmarks=usePdfBookmarks(p.pdf,p.adapter.listBookmarks);
  useEffect(()=>{
    setRibbonCompact(p.layout==="tablet");
    setSidebarOpen(p.layout==="desktop");
    setInspectorOpen(p.layout==="desktop"||inspectorTools.has(p.tool));
  },[p.layout]);
  useEffect(()=>{
    if(inspectorTools.has(p.tool))setInspectorOpen(true);
  },[p.tool]);
  useEffect(()=>{
    const handler=(event:Event)=>{
      if(shell.current?.parentElement!==event.target)return;
      setSidebarOpen(true);setSidebarTab("search");
      requestAnimationFrame(()=>shell.current?.querySelector<HTMLInputElement>(
        ".tpdf-desktop-find input")?.focus());
    };
    window.addEventListener("tpdf-desktop-find",handler);
    return()=>window.removeEventListener("tpdf-desktop-find",handler);
  },[]);
  useEffect(()=>{
    if(!resizing.current)return;
    const move=(event:PointerEvent)=>{
      const left=shell.current?.getBoundingClientRect().left??0;
      setSidebarWidth(Math.min(370,Math.max(180,event.clientX-left)));
    };
    const up=()=>{resizing.current=false;};
    window.addEventListener("pointermove",move);
    window.addEventListener("pointerup",up);
    return()=>{window.removeEventListener("pointermove",move);
      window.removeEventListener("pointerup",up);};
  },[sidebarWidth]);
  return <div ref={shell} className="tpdf-desktop-shell"
    data-testid="desktop-shell" data-tpdf-layout={p.layout}
    style={{"--tpdf-sidebar-width":sidebarWidth+"px"} as React.CSSProperties}>
    <DesktopRibbon {...p} compact={ribbonCompact}
      onStylePanel={()=>setInspectorOpen(true)}
      onSearchPanel={()=>{setSidebarOpen(true);setSidebarTab("search");}}/>
    <div className="tpdf-desktop-workspace">
      {sidebarOpen&&<>
        <div className="tpdf-desktop-sidebar-wrap">
          <DesktopSidebar tab={sidebarTab} onTab={setSidebarTab}
            current={p.page} total={p.total} onGoto={p.onGoto}
            tiles={p.adapter.tiles} meta={p.meta} pdf={p.pdf}
            bookmarks={bookmarks} results={p.results} query={p.query}
            onQuery={p.onSearchQuery} onSearch={p.onSearch}
            tools={p.tools} onToolError={p.onToolError}/>
        </div>
        <div className="tpdf-desktop-resizer" role="separator"
          tabIndex={0} aria-orientation="vertical" aria-label="Resize sidebar"
          aria-valuemin={180} aria-valuemax={370} aria-valuenow={sidebarWidth}
          onPointerDown={(event)=>{resizing.current=true;
            event.currentTarget.setPointerCapture(event.pointerId);}}
          onPointerMove={(event)=>{
            if(!resizing.current)return;
            const left=shell.current?.getBoundingClientRect().left||0;
            setSidebarWidth(Math.min(370,Math.max(180,event.clientX-left)));
          }}
          onPointerUp={()=>{resizing.current=false;}}
          onKeyDown={(event)=>{
            if(event.key==="ArrowRight"||event.key==="ArrowLeft"){
              event.preventDefault();setSidebarWidth(n=>Math.min(370,
                Math.max(180,n+(event.key==="ArrowRight"?16:-16))));
            }
          }}/>
      </>}
      <section className="tpdf-desktop-center" aria-label="PDF page reader">
        <div className="tpdf-desktop-workbench-controls">
          <button type="button" aria-label={sidebarOpen?"Close sidebar":"Open sidebar"}
            onClick={()=>setSidebarOpen(x=>!x)}>{sidebarOpen?"Hide":"Show"} navigation</button>
          <button type="button" onClick={()=>{
            setSidebarOpen(true);setSidebarTab("search");
          }}>Find</button>
          <button type="button" aria-label={inspectorOpen?"Close inspector":"Open inspector"}
            onClick={()=>setInspectorOpen(x=>!x)}>
            {inspectorOpen?"Hide":"Show"} inspector</button>
        </div>
        <div className="tpdf-app-viewer">{p.children}
          {p.tile&&<span className="tpdf-app-viewer-badge">Lightweight viewer</span>}
        </div>
      </section>
      {inspectorOpen&&<aside className="tpdf-desktop-inspector" data-testid="desktop-inspector">
        <div className="tpdf-desktop-inspector-head">
          <strong>Inspector</strong>
          <button type="button" aria-label="Close inspector"
            onClick={()=>setInspectorOpen(false)}>×</button>
        </div>
        <div className="tpdf-desktop-inspector-body">
          {p.canEdit&&p.style&&p.onStyle&&
            <section className="tpdf-desktop-inspector-section">
              <h3>Annotation style</h3>
              <P1StyleBar style={p.style} onChange={p.onStyle} locale={p.locale}/>
            </section>}
          {p.p2Panel}{p.p3Panel}
          {!p.p2Panel&&!p.p3Panel&&<section className="tpdf-desktop-inspector-section">
            <h3>Selection</h3>
            {p.selection ? <p>Page {p.selection.page}: {p.selection.x.toFixed(1)}%,
              {p.selection.y.toFixed(1)}%</p> : <p>Select a tool or region to inspect.</p>}
          </section>}
        </div>
      </aside>}
    </div>
    <footer className="tpdf-desktop-statusbar">
      <label>Page <input type="number" aria-label="Go to page" min={1}
        max={p.total||1} value={p.page}
        onChange={event=>p.onGoto(Number(event.target.value))}/></label>
      <span>/ {p.total||"…"}</span>
      <label>Zoom <select aria-label="Desktop zoom" value="manual"
        onChange={event=>{
          const value=event.target.value;
          if(value==="width")p.onFitWidth();
          else if(value==="page")p.onFitPage();
          else p.onZoom(Number(value)/100);
        }}>
        <option value="manual">{Math.round(p.zoom*100)}%</option>
        <option value="width">Fit width</option>
        <option value="page">Fit page</option>
        {[50,75,100,125,150,200].map(n=><option value={n} key={n}>{n}%</option>)}
      </select></label>
      <span className="tpdf-desktop-save-state">{p.busy?"Saving…":p.dirty?"Unsaved":"Saved"}</span>
    </footer>
    <P3SaveToast notes={p.saveNotes||[]}/>
  </div>;
}
