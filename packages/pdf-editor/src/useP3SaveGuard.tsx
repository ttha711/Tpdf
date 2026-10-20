import { useState } from "react";
import type { PdfChange } from "./history.js";
export function useP3SaveGuard(changes:PdfChange[],save:()=>Promise<void>) {
  const [pending,setPending]=useState(false);
  const redactions=changes.filter(c=>c.kind==="redact");
  const saveSafely=async()=>{
    if(redactions.length){setPending(true);return;}
    await save();
  };
  const confirmedSave=async()=>{
    setPending(false);
    await save();
  };
  const regions=redactions.reduce((n,c)=>n+("regions" in c?c.regions.length:0),0);
  const terms=redactions.flatMap(c=>c.kind==="redact" ? c.terms || [] : []);
  const pages=new Set(redactions.flatMap(c=>c.kind==="redact" ?
    [...c.regions.map(r=>r.page),...(c.pages||[])] : []));
  const dialog=pending?<div className="tpdf-p3-destructive-backdrop">
    <section className="tpdf-p3-destructive" role="alertdialog" aria-modal="true"
      aria-label="Confirm permanent redaction">
      <strong>Permanent redaction — irreversible</strong>
      <p>Save will permanently erase matching text and underlying image pixels
        from the new PDF. Existing older versions may still contain originals.</p>
      <p>{regions} regions; {terms.length} literal terms; pages:
        {" "+[...pages].sort((a,b)=>a-b).join(", ")}</p>
      {terms.length>0&&<p>Terms: {terms.join(", ")}</p>}
      <p>CAD vector strokes crossing the redaction area may remain.
        The server will verify erased text and reject failures.</p>
      <button type="button" onClick={()=>setPending(false)}>Cancel</button>
      <button type="button" data-testid="confirm-redaction-save"
        onClick={()=>void confirmedSave()}>Erase permanently and Save</button>
    </section>
  </div>:null;
  return {saveSafely,dialog};
}
