import { useEffect, useRef, useState, type ReactNode } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { AppShellIcon } from "./AppShellIcon.js";
import { APP_WORDS } from "./appShellModel.js";
import { P1StyleBar } from "./P1StyleBar.js";
import { P3SaveToast } from "./P3SaveToast.js";
import { MobileAppHeader } from "./MobileAppHeader.js";
import { MobileToolStrip } from "./MobileToolStrip.js";
import { MobileToolsSheet } from "./MobileToolsSheet.js";
import { MobilePageFilmstrip } from "./MobilePageFilmstrip.js";
import { MobileNavigationSheet } from "./MobileNavigationSheet.js";
import { MOBILE_PDF_GROUPS, type MobilePdfMode } from "./mobilePdfToolCatalog.js";
import { webToolAction } from "./webToolCommands.js";
import type { WebToolCallbacks } from "./WebToolButton.js";
import type { P1Style } from "./p1Types.js";
import type { PdfHostTool, PdfOpenDocument, PdfRegion, PdfSearchHit,
  PdfTileAdapter, PdfTileMeta, PdfTool } from "./types.js";
import type { P3Availability } from "./appShellModel.js";

export type AppShellProps = {
  children:ReactNode;locale:"vi"|"en";text:Record<string,string>;
  name:string;dirty:boolean;busy:boolean;page:number;total:number;zoom:number;
  tile:boolean;canEdit:boolean;canForms:boolean;canSave:boolean;
  undoEnabled:boolean;redoEnabled:boolean;tool:PdfTool;
  query:string;results:PdfSearchHit[];note:string;selection:PdfRegion|null;
  tools:PdfHostTool[];canText?:boolean;canAsset?:boolean;canP1?:boolean;
  style?:P1Style;onStyle?:(value:P1Style)=>void;
  p2Panel?:ReactNode;p3Panel?:ReactNode;p3?:P3Availability;
  saveNotes?:string[];canP2?:boolean;canFill?:boolean;canAttachment?:boolean;
  adapter?:{tiles?:PdfTileAdapter;listBookmarks?:()=>Promise<Array<{title:string;page:number}>>};
  meta?:PdfTileMeta|null;pdf?:PDFDocumentProxy|null;
  openDocuments?:PdfOpenDocument[];activeDocumentId?:string;
  onOpenDocument?:(id:string)=>void;onCloseDocument?:(id:string)=>void;
  onOpenFile?:()=>void;onHome?:()=>void;showHomeButton?:boolean;
  onFitPage?:()=>void;
  onTool:(tool:PdfTool)=>void;onNote:(value:string)=>void;
  onSearchQuery:(value:string)=>void;onSearch:()=>void;
  onGoto:(page:number)=>void;onBuiltin:(id:string)=>void;
  onSave:()=>void;onUndo:()=>void;onRedo:()=>void;
  onToolError:(error:unknown)=>void;
};
export function AppShell(p:AppShellProps){
  const [mode,setMode]=useState<MobilePdfMode>("view");
  const [sheet,setSheet]=useState(false),[search,setSearch]=useState(false);
  const [pages,setPages]=useState(false),[navigation,setNavigation]=useState(false);
  const [styleOpen,setStyleOpen]=useState(false),[commentNotice,setCommentNotice]=useState(false);
  const [statusVisible,setStatusVisible]=useState(false);
  const root=useRef<HTMLDivElement>(null),idle=useRef<ReturnType<typeof setTimeout>|null>(null);
  const words:Record<string,string>={...APP_WORDS[p.locale],...p.text};
  useEffect(()=>{
    const scroll=(event:Event)=>{
      if(!(event.target instanceof Element)||!event.target.closest(".tpdf-scroll"))return;
      setStatusVisible(true);
      if(idle.current)clearTimeout(idle.current);
      idle.current=setTimeout(()=>setStatusVisible(false),3000);
    };
    const node=root.current;node?.addEventListener("scroll",scroll,true);
    return()=>{node?.removeEventListener("scroll",scroll,true);
      if(idle.current)clearTimeout(idle.current);};
  },[]);
  useEffect(()=>{
    const group=MOBILE_PDF_GROUPS.find(g=>g.tools.some(t=>
      webToolAction(t).type==="tool"&&webToolAction(t).id===p.tool));
    if(group)setMode(group.id);
  },[p.tool]);
  useEffect(()=>{
    if(!search)return;
    root.current?.querySelector<HTMLInputElement>(".tpdf-app-search input")?.focus();
  },[search]);
  const showSearch=()=>{setSearch(true);setCommentNotice(false);};
  const showPages=()=>setPages(true);
  const showComments=()=>{
    const tool=p.tools.find(item=>item.group.toLowerCase()==="comments");
    if(tool)void Promise.resolve().then(()=>tool.run({page:p.page,
      selection:p.selection||undefined})).catch(p.onToolError);
    else setCommentNotice(value=>!value);
  };
  const actions:WebToolCallbacks={showSearch,showPages,showComments,
    showStyle:()=>setStyleOpen(true)};
  return <div className="tpdf-app-shell" ref={root} data-tpdf-shell="app">
    <MobileAppHeader name={p.name} page={p.page} total={p.total}
      busy={p.busy} dirty={p.dirty} documents={p.openDocuments}
      currentId={p.activeDocumentId} tiles={p.adapter?.tiles} meta={p.meta}
      actions={{showHome:p.showHomeButton!==false,home:p.onHome,
        openFile:p.onOpenFile,onOpenDocument:p.onOpenDocument,
        onCloseDocument:p.onCloseDocument,onSearch:showSearch,
        onPages:showPages,onTools:()=>setSheet(true),onSave:p.onSave}}/>
    <MobileToolStrip mode={mode} setMode={setMode} shell={p}
      actions={actions} openTools={()=>setSheet(true)}/>
    <div className="tpdf-mobile-chrome-actions" role="toolbar"
      aria-label="PDF navigation actions">
      <button type="button" aria-label="PDF menu" onClick={()=>setSheet(true)}>
        <AppShellIcon name="tools"/></button>
      <button type="button" aria-label="Pages and outline" onClick={()=>setNavigation(true)}>
        <AppShellIcon name="pages"/></button>
      <button type="button" aria-label="More PDF tools" onClick={()=>setSheet(true)}>
        <AppShellIcon name="more"/></button>
      <button type="button" aria-label="Search" onClick={showSearch}>
        <AppShellIcon name="search"/></button>
      <button type="button" aria-label="Comments" onClick={showComments}>
        <AppShellIcon name="comments"/></button>
    </div>
    {search&&<div className="tpdf-app-search" data-testid="shell-search">
      <input aria-label={words.search} value={p.query} placeholder={words.search}
        onChange={e=>p.onSearchQuery(e.target.value)}
        onKeyDown={e=>{if(e.key==="Enter")p.onSearch();}}/>
      <button type="button" onClick={p.onSearch}>Search</button>
      <button type="button" aria-label="Close search" onClick={()=>setSearch(false)}>×</button>
      {!!p.results.length&&<div className="tpdf-app-results">
        {p.results.map((hit,i)=><button key={i} type="button"
          onClick={()=>{p.onGoto(hit.page);setSearch(false);}}>
          Page {hit.page}: {hit.snippet.slice(0,100)}</button>)}
      </div>}
    </div>}
    {commentNotice&&<div className="tpdf-app-notice" role="status">
      Comments: Coming soon — host has not enabled P4.</div>}
    {styleOpen&&p.style&&p.onStyle&&<div className="tpdf-app-p1-style">
      <P1StyleBar style={p.style} onChange={p.onStyle} locale={p.locale}/>
      <button type="button" onClick={()=>setStyleOpen(false)}>Done</button>
    </div>}
    {["note","signature","addText","insertText","callout"].includes(p.tool)&&
      <div className="tpdf-app-note"><input aria-label={p.tool} value={p.note}
        onChange={e=>p.onNote(e.target.value)} maxLength={160}/></div>}
    {p.p2Panel}{p.p3Panel}
    <div className="tpdf-app-viewer">{p.children}
      {p.tile&&<span className="tpdf-app-viewer-badge">{words.lightweight}</span>}
    </div>
    <nav className="tpdf-app-dock" aria-label="PDF bottom tools">
      {([
        ["select","pen",()=>{p.onTool("region");setMode("view");},true],
        ["undo","undo",p.onUndo,p.undoEnabled],
        ["redo","redo",p.onRedo,p.redoEnabled],
        ["tools","tools",()=>setSheet(true),true],
        ["save","save",p.onSave,p.canSave&&!p.busy]
      ] as const).map(([id,icon,run,enabled])=>
        <button type="button" key={id} disabled={!enabled}
          aria-label={id==="select"?"Select":id==="save"?"Save":id[0].toUpperCase()+id.slice(1)}
          onClick={run} className={id==="select"?"tpdf-app-dock-active":""}>
          <AppShellIcon name={icon} size={23}/>
          <span>{id==="select"?"Select":id==="save"?"Save":id[0].toUpperCase()+id.slice(1)}</span>
        </button>)}
    </nav>
    {statusVisible&&<div className="tpdf-mobile-dock-status" role="status">
      <button type="button" aria-label="Choose page" onClick={showPages}>
        Page {p.page} / {p.total||"…"}</button>
      <span aria-label={`Zoom ${Math.round(p.zoom*100)} percent`}>
        {Math.round(p.zoom*100)}%</span>
    </div>}
    {pages&&<MobilePageFilmstrip page={p.page} total={p.total}
      onGoto={p.onGoto} onClose={()=>setPages(false)}
      tiles={p.adapter?.tiles} meta={p.meta} pdf={p.pdf}/>}
    {navigation&&<MobileNavigationSheet page={p.page} total={p.total}
      onGoto={p.onGoto} onClose={()=>setNavigation(false)}
      tiles={p.adapter?.tiles} meta={p.meta} pdf={p.pdf}
      listBookmarks={p.adapter?.listBookmarks}/>}
    {sheet&&<MobileToolsSheet shell={p} actions={actions}
      onMode={setMode} onClose={()=>setSheet(false)}/>}
    <P3SaveToast notes={p.saveNotes||[]}/>
  </div>;
}
