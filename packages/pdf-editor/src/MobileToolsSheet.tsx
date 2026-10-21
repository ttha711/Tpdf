import { useEffect } from "react";
import type { AppShellProps } from "./AppShell.js";
import { MOBILE_PDF_GROUPS, DOCUMENT_TOOL_LABELS,
  type MobilePdfMode } from "./mobilePdfToolCatalog.js";
import { WebToolButton, type WebToolCallbacks } from "./WebToolButton.js";

export function MobileToolsSheet(p:{
  shell:AppShellProps;actions:WebToolCallbacks;onClose:()=>void;
  onMode:(mode:MobilePdfMode)=>void;
}) {
  useEffect(()=>{
    const close=(e:KeyboardEvent)=>{if(e.key==="Escape")p.onClose();};
    window.addEventListener("keydown",close);
    return()=>window.removeEventListener("keydown",close);
  },[p.onClose]);
  const hostGroups=[...new Set(p.shell.tools.map(item=>item.group))];
  const hostRun=(tool:AppShellProps["tools"][number])=>{
    void Promise.resolve().then(()=>tool.run({page:p.shell.page,
      selection:p.shell.selection||undefined})).catch(p.shell.onToolError);
    p.onClose();
  };
  const docActions:Record<string,(()=>void)|undefined>={
    "Find a tool":p.actions.showSearch,
    "Document info":undefined,
    "AI assistant":p.shell.tools.find(x=>/ai/i.test(x.group))?
      ()=>hostRun(p.shell.tools.find(x=>/ai/i.test(x.group))!):undefined,
    "Find document tools":p.shell.tools.length?
      ()=>document.querySelector<HTMLElement>("[data-tpdf-host-tools]")?.scrollIntoView():undefined,
    "Save PDF":p.shell.onSave,
  };
  return <div className="tpdf-app-sheet-backdrop" onMouseDown={event=>{
    if(event.target===event.currentTarget)p.onClose();
  }}>
    <section className="tpdf-app-sheet" role="dialog" aria-modal="true"
      aria-label="All tools">
      <header className="tpdf-app-sheet-title">
        <div><strong>PDF tools</strong>
          <p>Every group matches the scrollable PDF toolbar. Choose a tool and tap the page.</p>
        </div>
        <button type="button" aria-label="Close tools" onClick={p.onClose}>×</button>
      </header>
      <div className="tpdf-app-sheet-list">
        {MOBILE_PDF_GROUPS.map(group=><section key={group.id}
          data-tpdf-tool-group={group.id} aria-label={group.label}>
          <h3>{group.label}</h3>
          <div className="tpdf-app-tool-grid">
            {group.tools.map(tool=><WebToolButton key={tool.id}
              mode="grid" p={p.shell} tool={tool} actions={p.actions}
              onSelected={()=>{p.onMode(group.id);p.onClose();}}/>)}
          </div>
        </section>)}
        <section data-tpdf-tool-group="document" aria-label="Document tools">
          <h3>Document tools</h3>
          <div className="tpdf-app-tool-grid">
            {DOCUMENT_TOOL_LABELS.map(label=><button type="button" key={label}
              disabled={!docActions[label]} title={!docActions[label]?"Coming soon":label}
              onClick={()=>{docActions[label]?.();if(label!=="Find document tools")p.onClose();}}>
              <span>{label}</span>
              {!docActions[label]&&<small>Coming soon</small>}
            </button>)}
          </div>
        </section>
        {hostGroups.map(group=><section key={group}
          data-tpdf-host-tools={group} aria-label={group}>
          <h3>{group}</h3>
          <div className="tpdf-app-tool-grid">{p.shell.tools.filter(item=>
            item.group===group).map(item=><button type="button" key={item.id}
              onClick={()=>hostRun(item)}>
              {item.icon}<span>{item.label}</span>
            </button>)}</div>
        </section>)}
      </div>
    </section>
  </div>;
}
