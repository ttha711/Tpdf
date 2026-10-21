import { useEffect, useRef, useState } from "react";
import { TileGrid } from "./TileGrid.js";
import { CanvasThumb } from "./DesktopSidebar.js";
import type { PDFDocumentProxy } from "pdfjs-dist";
import type { PdfTileAdapter, PdfTileMeta } from "./types.js";
export function MobilePageFilmstrip(p:{
  page:number;total:number;onGoto:(page:number)=>void;onClose:()=>void;
  tiles?:PdfTileAdapter;meta?:PdfTileMeta|null;pdf?:PDFDocumentProxy|null;
}) {
  const [jump,setJump]=useState(String(p.page));
  const [node,setNode]=useState<HTMLDivElement|null>(null);
  const container=useRef<HTMLDivElement>(null);
  const range=p.total<=200?Array.from({length:p.total},(_,i)=>i+1):
    Array.from({length:Math.min(p.total,21)},(_,i)=>
      Math.max(1,Math.min(p.page-10,p.total-20))+i);
  useEffect(()=>setJump(String(p.page)),[p.page]);
  useEffect(()=>{
    const close=(event:KeyboardEvent)=>{if(event.key==="Escape")p.onClose();};
    window.addEventListener("keydown",close);
    const target=container.current?.querySelector<HTMLElement>(
      '[aria-current="page"]');
    target?.scrollIntoView({block:"nearest",inline:"center"});
    return()=>window.removeEventListener("keydown",close);
  },[p.page,p.onClose]);
  function goto(page:number){
    if(!Number.isInteger(page)||page<1||page>p.total)return;
    p.onGoto(page);p.onClose();
  }
  return <div className="tpdf-mobile-filmstrip" data-tpdf-mobile-filmstrip="true"
    role="dialog" aria-modal="true" aria-label="Page previews">
    <header className="tpdf-mobile-filmstrip-header">
      <strong>Pages</strong><span>{p.page} / {p.total}</span>
      <form onSubmit={event=>{event.preventDefault();goto(Number(jump));}}>
        <input type="number" min={1} max={p.total} aria-label="Jump to page"
          value={jump} onChange={event=>setJump(event.target.value)}/>
        <button type="submit">Go</button>
      </form>
      <button type="button" aria-label="Close page previews" onClick={p.onClose}>×</button>
    </header>
    <div className="tpdf-mobile-filmstrip-scroll" ref={element=>{
      container.current=element;setNode(before=>before===element?before:element);
    }}>
      {p.tiles&&p.meta?
        <TileGrid adapter={p.tiles} meta={p.meta} parent={node}
          pageNumbers={range} currentPage={p.page} onGoto={goto}/>:
        <div className="tpdf-mobile-filmstrip-numbers">
          {range.map(page=><button key={page} type="button"
            aria-current={page===p.page?"page":undefined}
            data-tpdf-page-thumb={page} onClick={()=>goto(page)}>
            {p.pdf&&<CanvasThumb pdf={p.pdf} page={page} root={node}/>}
            <span>Page {page}</span></button>)}
        </div>}
    </div>
  </div>;
}
