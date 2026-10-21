import type { AppShellProps } from "./AppShell.js";
import { P1StyleBar } from "./P1StyleBar.js";
import { MOBILE_PDF_GROUPS } from "./mobilePdfToolCatalog.js";
import { WebToolButton } from "./WebToolButton.js";

export function DesktopInspector(p:AppShellProps & {
  onClose:()=>void;onSearchPanel:()=>void;onComments:()=>void;
}) {
  const quickIds=["read","highlight","ink","text","rectangle","signature","redact","distance"];
  const quick=MOBILE_PDF_GROUPS.flatMap(g=>g.tools).filter(t=>quickIds.includes(t.id));
  const actions={showSearch:p.onSearchPanel,showPages:()=>p.onBuiltin("pages"),
    showComments:p.onComments,showStyle:()=>{},showInspector:()=>{}};
  const hostQuick=p.tools.filter(t=>/compress|shift|highlight/i.test(t.label));
  const ocr=p.tools.filter(t=>/ocr/i.test(t.group+" "+t.label));
  const run=(item:AppShellProps["tools"][number])=>
    Promise.resolve().then(()=>item.run({page:p.page,
      selection:p.selection||undefined})).catch(p.onToolError);
  return <aside className="tpdf-desktop-inspector" data-testid="desktop-inspector">
    <div className="tpdf-desktop-inspector-head"><strong>Document tools</strong>
      <button type="button" aria-label="Close inspector" onClick={p.onClose}>×</button>
    </div>
    <div className="tpdf-desktop-inspector-body">
      <section className="tpdf-desktop-inspector-section">
        <h3>Quick tools</h3>
        <div className="tpdf-desktop-quicktools">
          {quick.map(tool=><WebToolButton key={tool.id}
            mode="grid" tool={tool} p={p} actions={actions}/>)}
          {hostQuick.map(item=><button key={item.id} type="button"
            onClick={()=>void run(item)}>{item.icon}{item.label}</button>)}
        </div>
      </section>
      <section className="tpdf-desktop-inspector-section">
        <h3>Document</h3>
        <dl className="tpdf-desktop-info-grid">
          <dt>File</dt><dd title={p.name}>{p.name}</dd>
          <dt>Pages</dt><dd>{p.total}</dd>
          <dt>Page</dt><dd>{p.page}</dd>
          <dt>Zoom</dt><dd>{Math.round(p.zoom*100)}%</dd>
        </dl>
      </section>
      {p.canEdit&&p.style&&p.onStyle&&
        <section className="tpdf-desktop-inspector-section">
          <h3>Style</h3><P1StyleBar style={p.style} onChange={p.onStyle} locale={p.locale}/>
        </section>}
      {p.p2Panel}{p.p3Panel}
      <section className="tpdf-desktop-inspector-section">
        <h3>Review</h3>
        <button type="button" onClick={p.onComments}>Comments</button>
        <small>Host-managed comments; P4 is not implemented.</small>
      </section>
      <section className="tpdf-desktop-inspector-section">
        <h3>OCR jobs</h3>
        {ocr.length?ocr.map(item=><button key={item.id}
          type="button" onClick={()=>void run(item)}>{item.label}</button>):
          <p>No OCR jobs available from host</p>}
      </section>
    </div>
  </aside>;
}
