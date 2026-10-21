import type { ReactNode } from "react";
import type { AppShellProps } from "./AppShell.js";
import { MOBILE_PDF_GROUPS, type MobilePdfMode } from "./mobilePdfToolCatalog.js";
import { WebToolButton, type WebToolCallbacks } from "./WebToolButton.js";
export function MobileToolStrip(p:{
  mode:MobilePdfMode;setMode:(mode:MobilePdfMode)=>void;
  shell:AppShellProps;actions:WebToolCallbacks;openTools:()=>void;extra?:ReactNode;
}) {
  const current=MOBILE_PDF_GROUPS.find(g=>g.id===p.mode)||MOBILE_PDF_GROUPS[0];
  return <>
    <nav className="tpdf-app-tabs" role="tablist" aria-label="PDF tool groups">
      <div className="tpdf-app-tab-scroll">{MOBILE_PDF_GROUPS.map(group=>
        <button type="button" role="tab" key={group.id}
          data-tpdf-mode-tab={group.id} aria-selected={p.mode===group.id}
          onClick={()=>p.setMode(group.id)}>{group.label}</button>)}</div>
      <button type="button" className="tpdf-app-tab-all" role="tab"
        data-tpdf-mode-tab="all" aria-selected={false}
        onClick={p.openTools}>All tools</button>
      {p.extra&&<div className="tpdf-app-tabs-extra">{p.extra}</div>}
    </nav>
    <div className="tpdf-app-group-tools" role="toolbar"
      aria-label={current.label+" tools"} data-tpdf-group-toolbar={current.id}>
      {current.tools.map(tool=><WebToolButton key={tool.id}
        tool={tool} p={p.shell} actions={p.actions}/>)}
    </div>
  </>;
}
