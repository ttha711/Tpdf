import { useEffect, useRef, useState, type ReactNode } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { TileGrid } from "./TileGrid.js";
import type { PdfTileMeta, PdfTileAdapter, PdfSearchHit, PdfHostTool } from "./types.js";
import type { PdfBookmark } from "./usePdfBookmarks.js";

export type SidebarTab = "pages" | "bookmarks" | "search" | "comments";
export function DesktopSidebar(p: {
  tab:SidebarTab; onTab:(next:SidebarTab)=>void; current:number; total:number;
  onGoto:(page:number)=>void; tiles?:PdfTileAdapter; meta?:PdfTileMeta|null;
  pdf?:PDFDocumentProxy|null; bookmarks:PdfBookmark[];
  results:PdfSearchHit[]; query:string; onQuery:(value:string)=>void;
  onSearch:()=>void; commentsPanel?:ReactNode; tools:PdfHostTool[]; onToolError:(error:unknown)=>void;
}) {
  const [node,setNode]=useState<HTMLDivElement|null>(null);
  const comments=p.tools.filter(tool=>tool.group.toLowerCase().includes("comment"));
  return <aside className="tpdf-desktop-sidebar" data-testid="desktop-sidebar">
    <nav className="tpdf-desktop-side-tabs" aria-label="Navigation panels">
      {(["pages","bookmarks"] as const).map(tab=>
        <button type="button" key={tab} aria-label={tab+" panel"}
          aria-pressed={p.tab===tab} onClick={()=>p.onTab(tab)}>
          {tab==="pages"?"Pages":tab==="bookmarks"?"Bookmarks":
            tab==="search"?"Find":"Comments"}</button>)}
    </nav>
    <div className="tpdf-desktop-sidebar-scroll" ref={setNode}>
      {p.tab==="pages" && p.tiles && p.meta ?
        <TileGrid adapter={p.tiles} meta={p.meta} parent={node}
          currentPage={p.current} onGoto={p.onGoto}/> : null}
      {p.tab==="pages" && (!p.tiles||!p.meta) &&
        <div className="tpdf-desktop-canvas-thumbs">
          {Array.from({length:p.total},(_,i)=><button key={i} type="button"
            aria-label={"Open page "+(i+1)} data-current={p.current===i+1}
            onClick={()=>p.onGoto(i+1)}>
            {p.pdf?<CanvasThumb pdf={p.pdf} page={i+1} root={node}/>:null}
            <span>Page {i+1}</span>
          </button>)}
        </div>}
      {p.tab==="bookmarks" && (p.bookmarks.length ? p.bookmarks.map((bookmark,i)=>
        <button type="button" className="tpdf-desktop-nav-result" key={i}
          onClick={()=>p.onGoto(bookmark.page)}>
          {bookmark.title} <small>p. {bookmark.page}</small></button>)
        : <p className="tpdf-desktop-side-empty">No bookmarks available for this document.</p>)}
      {p.tab==="search" && <div className="tpdf-desktop-find">
        <form onSubmit={event=>{event.preventDefault();p.onSearch();}}>
          <input aria-label="Find in PDF" value={p.query}
            onChange={event=>p.onQuery(event.target.value)}
            placeholder="Search document"/>
          <button type="submit">Find</button>
        </form>
        <div role="list" data-testid="desktop-search-results">
          {p.results.map((hit,i)=><button className="tpdf-desktop-nav-result"
            key={i} type="button" onClick={()=>p.onGoto(hit.page)}>
            <strong>Page {hit.page}</strong> {hit.snippet}</button>)}
        </div>
      </div>}
      {p.tab==="comments" && p.commentsPanel}
      {p.tab==="comments" && !p.commentsPanel && (comments.length ? comments.map(item=>
        <button key={item.id} className="tpdf-desktop-nav-result"
          type="button" onClick={()=>Promise.resolve(
            item.run({page:p.current})).catch(p.onToolError)}>{item.label}</button>)
        : <p className="tpdf-desktop-side-empty">Comments require a connected host tool.</p>)}
    </div>
  </aside>;
}
export function CanvasThumb({pdf,page,root}: {
  pdf:PDFDocumentProxy; page:number; root:HTMLElement|null;
}) {
  const canvas=useRef<HTMLCanvasElement>(null);
  const [visible,setVisible]=useState(false);
  useEffect(()=>{
    const node=canvas.current;
    if(!node || !root)return;
    const observer=new IntersectionObserver(entries=>
      setVisible(entries.some(entry=>entry.isIntersecting)),
      {root,rootMargin:"200px"});
    observer.observe(node);return()=>observer.disconnect();
  },[root]);
  useEffect(()=>{
    if(!visible || !canvas.current)return;
    let alive=true;
    let task:{cancel():void}|undefined;
    void pdf.getPage(page).then(pdfPage=>{
      if(!alive||!canvas.current)return;
      const base=pdfPage.getViewport({scale:1});
      const viewport=pdfPage.getViewport({scale:Math.min(1,120/base.width)});
      const canvasEl=canvas.current,ctx=canvasEl.getContext("2d");
      if(!ctx)return;
      canvasEl.width=Math.max(1,Math.round(viewport.width));
      canvasEl.height=Math.max(1,Math.round(viewport.height));
      task=pdfPage.render({canvasContext:ctx,viewport});
    }).catch(()=>{});
    return()=>{alive=false;task?.cancel();};
  },[pdf,page,visible]);
  return <canvas ref={canvas} width={100} height={130} aria-hidden="true"
    className="tpdf-desktop-thumb-canvas"/>;
}
