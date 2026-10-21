import { useEffect, useState } from "react";
import { MobilePageFilmstrip } from "./MobilePageFilmstrip.js";
import { usePdfBookmarks } from "./usePdfBookmarks.js";
import type { PDFDocumentProxy } from "pdfjs-dist";
import type { PdfTileAdapter, PdfTileMeta } from "./types.js";
export function MobileNavigationSheet(p:{
  page:number;total:number;onGoto:(page:number)=>void;onClose:()=>void;
  tiles?:PdfTileAdapter;meta?:PdfTileMeta|null;pdf?:PDFDocumentProxy|null;
  listBookmarks?:()=>Promise<Array<{title:string;page:number}>>;
}) {
  const [tab,setTab]=useState<"pages"|"outline">("pages");
  const bookmarks=usePdfBookmarks(p.pdf||null,p.listBookmarks);
  useEffect(()=>{
    const close=(e:KeyboardEvent)=>{if(e.key==="Escape")p.onClose();};
    window.addEventListener("keydown",close);return()=>window.removeEventListener("keydown",close);
  },[p.onClose]);
  return <section className="tpdf-mobile-nav-sheet" role="dialog"
    aria-modal="true" aria-label="PDF navigation">
    <header><strong>Navigation</strong>
      <button type="button" aria-label="Close navigation" onClick={p.onClose}>×</button>
    </header>
    <nav role="tablist" aria-label="Navigation tabs">
      <button type="button" role="tab" aria-selected={tab==="pages"}
        onClick={()=>setTab("pages")}>Thumbnails</button>
      <button type="button" role="tab" aria-selected={tab==="outline"}
        onClick={()=>setTab("outline")}>Outline</button>
    </nav>
    {tab==="pages"?
      <MobilePageFilmstrip {...p}/>:
      <div className="tpdf-mobile-nav-outline">
        {bookmarks.length?bookmarks.map((item,i)=><button type="button" key={i}
          onClick={()=>{p.onGoto(item.page);p.onClose();}}>
          {item.title} <small>p. {item.page}</small>
        </button>):<p>No outline available</p>}
      </div>}
  </section>;
}
