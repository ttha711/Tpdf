import { useEffect, useState, type ReactNode } from "react";
import { AppShellIcon } from "./AppShellIcon.js";
import { TileGrid } from "./TileGrid.js";
import type { PdfOpenDocument, PdfTileAdapter, PdfTileMeta } from "./types.js";
type Actions={home?:()=>void;showHome:boolean;openFile?:()=>void;
  onOpenDocument?:(id:string)=>void;onCloseDocument?:(id:string)=>void;
  onSearch:()=>void;onPages:()=>void;onTools:()=>void;onSave:()=>void};
export function MobileAppHeader(p:{
  name:string;page:number;total:number;busy:boolean;dirty:boolean;
  currentId?:string;documents?:PdfOpenDocument[];
  tiles?:PdfTileAdapter;meta?:PdfTileMeta|null;actions:Actions;
  /** One-row mode for hosts with their own header: slots at both ends, the chrome buttons inline, no Home/app menu, tab count only with several documents. */
  compact?:{start?:ReactNode;end?:ReactNode;left:ReactNode;right:ReactNode};
}) {
  const [overview,setOverview]=useState(false),[menu,setMenu]=useState(false);
  const docs=p.documents??[{id:"current",name:p.name,
    page:p.page,pages:p.total}];
  const current=p.currentId||docs.find(d=>d.name===p.name)?.id||docs[0]?.id;
  useEffect(()=>{
    if(!overview&&!menu)return;
    const close=(e:KeyboardEvent)=>{if(e.key==="Escape"){setOverview(false);setMenu(false);}};
    window.addEventListener("keydown",close);
    return()=>window.removeEventListener("keydown",close);
  },[overview,menu]);
  const count=<button type="button" aria-label={`Open tabs overview (${docs.length} tabs)`}
      className="tpdf-mobile-tab-count" onClick={()=>setOverview(true)}>{docs.length}</button>;
  const file=<div className="tpdf-app-file" title={p.name}>
      <strong>{p.name}</strong>
      <small data-testid="shell-save-status">{p.busy?"Saving…":p.dirty?"Unsaved":"Saved"}</small>
    </div>;
  return <header className={"tpdf-mobile-app-header"+(p.compact?" tpdf-mobile-top-compact":"")}
    data-testid="mobile-app-header">
    {p.compact?<>{p.compact.start}{p.compact.left}{docs.length>1&&count}{file}{p.compact.right}{p.compact.end}</>:<>
    {p.actions.showHome&&<button type="button" aria-label="Go to Home"
      disabled={!p.actions.home} onClick={p.actions.home}>
      <AppShellIcon name="file"/></button>}
    <button type="button" aria-label="Application menu" aria-expanded={menu}
      onClick={()=>setMenu(value=>!value)}><AppShellIcon name="more"/></button>
    {count}{file}</>}
    {menu&&<div className="tpdf-mobile-menu-popover" role="menu">
      {([["Find",p.actions.onSearch],["Pages",p.actions.onPages],
        ["All PDF tools",p.actions.onTools],["Save PDF",p.actions.onSave]] as const)
        .map(([name,run])=><button type="button" role="menuitem"
          key={name} onClick={()=>{setMenu(false);run();}}>{name}</button>)}
      {p.actions.openFile&&<button type="button" role="menuitem"
        onClick={()=>{setMenu(false);p.actions.openFile?.();}}>Open file</button>}
    </div>}
    {overview&&<section className="tpdf-mobile-tab-switcher" role="dialog"
      aria-label="Open documents" aria-modal="true">
      <header><strong>Open documents</strong><span>{docs.length}</span>
        <button type="button" aria-label="Close tab overview"
          onClick={()=>setOverview(false)}>×</button></header>
      <div className="tpdf-mobile-tab-grid">
        {docs.map(doc=><article key={doc.id} data-tpdf-tab-card={doc.id}>
          <button type="button" aria-label={"Open "+doc.name}
            aria-current={doc.id===current?"page":undefined}
            onClick={()=>{p.actions.onOpenDocument?.(doc.id);setOverview(false);}}>
            <span className="tpdf-mobile-tab-sheet">
              {doc.id===current&&p.tiles&&p.meta?
                <MiniTileThumb tiles={p.tiles} meta={p.meta} page={doc.page}/>:
                <AppShellIcon name="file" size={30}/>}
            </span>
            <span><strong>{doc.name}</strong><small>Page {doc.page} of {doc.pages}</small>
              {doc.id===current&&<em>Currently open</em>}</span>
          </button>
          {p.actions.onCloseDocument&&<button type="button"
            aria-label={"Close tab "+doc.name}
            onClick={()=>p.actions.onCloseDocument?.(doc.id)}>×</button>}
        </article>)}
      </div>
      <footer><button type="button" disabled={!p.actions.openFile}
        onClick={()=>p.actions.openFile?.()}>Open new file</button></footer>
    </section>}
  </header>;
}
function MiniTileThumb({tiles,meta,page}:{
  tiles:PdfTileAdapter;meta:PdfTileMeta;page:number;
}) {
  const [node,setNode]=useState<HTMLDivElement|null>(null);
  if(page<1||page>meta.pages.length)return <AppShellIcon name="file" size={30}/>;
  return <div className="tpdf-mobile-tab-thumbnail" ref={setNode} aria-hidden="true" {...{inert:""}}>
    <TileGrid adapter={tiles} meta={meta} parent={node}
      pageNumbers={[page]} currentPage={page} onGoto={()=>{}}/>
  </div>;
}
