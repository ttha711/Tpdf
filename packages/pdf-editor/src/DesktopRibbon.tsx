import { useState } from "react";
import { AppShellIcon } from "./AppShellIcon.js";
import { MOBILE_PDF_GROUPS, type MobilePdfMode } from "./mobilePdfToolCatalog.js";
import { WebToolButton, type WebToolCallbacks } from "./WebToolButton.js";
import { MobileToolsSheet } from "./MobileToolsSheet.js";
import type { AppShellProps } from "./AppShell.js";

export function DesktopRibbon(p:AppShellProps & {
  onStylePanel:()=>void;onSearchPanel:()=>void;onComments:()=>void;
  onToggleSidebar:()=>void;onShowInspector:()=>void;compact:boolean;
}) {
  const [tab,setTab]=useState<string>("view");
  const [sheet,setSheet]=useState(false);
  const hostGroups=[...new Set(p.tools.map(t=>t.group))];
  const group=MOBILE_PDF_GROUPS.find(item=>item.id===tab);
  const host=p.tools.filter(tool=>tool.group===tab);
  const actions:WebToolCallbacks={showSearch:p.onSearchPanel,
    showPages:p.onToggleSidebar,showComments:p.onComments,
    showStyle:p.onStylePanel,showInspector:p.onShowInspector};
  function invoke(tool:AppShellProps["tools"][number]) {
    void Promise.resolve().then(()=>tool.run({page:p.page,
      selection:p.selection||undefined})).catch(p.onToolError);
  }
  return <div className="tpdf-desktop-ribbon" data-testid="desktop-ribbon">
    <div className="tpdf-desktop-quickbar" role="toolbar" aria-label="PDF view controls">
      <button type="button" aria-label="Toggle sidebar" title="Sidebar" onClick={p.onToggleSidebar}>
        <AppShellIcon name="sidebar" size={19}/></button>
      <span className="tpdf-desktop-zoom-badge" title="Zoom">{Math.round(p.zoom*100)}%</span>
      <span className="tpdf-desktop-quick-divider" aria-hidden="true"/>
      <button type="button" onClick={()=>p.onBuiltin("pan")} aria-label="Pan" title="Pan">
        <AppShellIcon name="pan" size={19}/></button>
      <button type="button" onClick={()=>p.onTool("region")} aria-label="Select" title="Select">
        <AppShellIcon name="pointer" size={19}/></button>
      <span className="tpdf-desktop-quick-divider" aria-hidden="true"/>
      <button type="button" aria-label="Search" title="Search" onClick={p.onSearchPanel}>
        <AppShellIcon name="search" size={19}/></button>
      <button type="button" aria-label="Comments" title="Comments" onClick={p.onComments}>
        <AppShellIcon name="comments" size={19}/></button>
      <span className="tpdf-desktop-toolbar-spacer"/>
      <button type="button" aria-label="Undo" title="Undo" disabled={!p.undoEnabled} onClick={p.onUndo}>
        <AppShellIcon name="undo" size={19}/></button>
      <button type="button" aria-label="Redo" title="Redo" disabled={!p.redoEnabled} onClick={p.onRedo}>
        <AppShellIcon name="redo" size={19}/></button>
      <button type="button" aria-label="Save version" title="Save" className="tpdf-desktop-quick-save"
        disabled={!p.canSave||p.busy} onClick={p.onSave}>
        <AppShellIcon name="save" size={19}/><span>Save</span></button>
    </div>
    <nav className="tpdf-desktop-ribbon-tabs" role="tablist" aria-label="PDF ribbon">
      {MOBILE_PDF_GROUPS.map(group=><button role="tab" type="button"
        key={group.id} aria-selected={tab===group.id}
        onClick={()=>setTab(group.id)}>{group.label}</button>)}
      {hostGroups.map(name=><button role="tab" type="button" key={name}
        aria-selected={tab===name} onClick={()=>setTab(name)}>{name}</button>)}
      <button role="tab" type="button" aria-selected={sheet}
        onClick={()=>setSheet(true)}>All tools</button>
    </nav>
    <div className="tpdf-desktop-ribbon-commands" role="toolbar"
      aria-label={tab+" commands"}>
      {group?.tools.map(tool=><WebToolButton key={tool.id} tool={tool}
        p={p} actions={actions}/>)}
      {host.map(tool=><button type="button" key={tool.id}
        onClick={()=>invoke(tool)}>{tool.icon||<AppShellIcon name="tools" size={17}/>}
        <span>{tool.label}</span></button>)}
    </div>
    {sheet&&<MobileToolsSheet shell={p} actions={actions}
      onClose={()=>setSheet(false)} onMode={(next:MobilePdfMode)=>setTab(next)}/>}
  </div>;
}
