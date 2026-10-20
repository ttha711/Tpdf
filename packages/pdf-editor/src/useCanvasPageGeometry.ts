import { useEffect, useState } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
export function useCanvasPageGeometry(pdf:PDFDocumentProxy|null,page:number) {
  const [state,setState]=useState<{doc:PDFDocumentProxy|null;
    sizes:Record<number,{width:number;height:number}>}>({doc:null,sizes:{}});
  useEffect(()=>{
    if(!pdf || page<1 || page>pdf.numPages)return;
    let live=true;
    void pdf.getPage(page).then(item=>{
      if(!live)return;
      const view=item.getViewport({scale:1}); // rotation applied by PDF.js
      setState(before=>({doc:pdf,sizes:{
        ...(before.doc===pdf?before.sizes:{}),
        [page]:{width:view.width,height:view.height},
      }}));
    }).catch(()=>{});
    return ()=>{live=false;};
  },[pdf,page]);
  const known=state.doc===pdf?state.sizes:{};
  return {sizes:pdf?Array.from({length:pdf.numPages},(_,i)=>
    known[i+1]||{width:612,height:792}):[],
    ready:!!known[page]};
}
