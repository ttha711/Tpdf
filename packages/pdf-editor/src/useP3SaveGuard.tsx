import { useRef, useState } from "react";
import type { PdfChange } from "./history.js";
export function useP3SaveGuard(changes:PdfChange[],save:()=>Promise<void>) {
  const [pending,setPending]=useState(false);
  const waiter=useRef<{promise:Promise<void>;resolve:()=>void;
    reject:(e:Error)=>void}|null>(null);
  const redactions=changes.filter(c=>c.kind==="redact");
  function saveSafely():Promise<void> {
    if(waiter.current)return waiter.current.promise;
    if(!redactions.length)return save();
    let resolve!:()=>void,reject!:(e:Error)=>void;
    const promise=new Promise<void>((ok,bad)=>{resolve=ok;reject=bad;});
    waiter.current={promise,resolve,reject};setPending(true);
    return promise;
  }
  function cancel() {
    setPending(false);const wait=waiter.current;waiter.current=null;
    wait?.reject(Error("Permanent redaction was cancelled"));
  }
  async function confirm() {
    const wait=waiter.current;
    setPending(false);
    try {await save();wait?.resolve();}
    catch(e) {wait?.reject(e instanceof Error?e:Error(String(e)));}
    finally {waiter.current=null;}
  }
  const regions=redactions.reduce((n,c)=>n+("regions" in c?c.regions.length:0),0);
  const terms=redactions.flatMap(c=>c.kind==="redact"?c.terms||[]:[]);
  const pages=new Set(redactions.flatMap(c=>c.kind==="redact"?
    [...c.regions.map(r=>r.page),...(c.pages||[])]:[]));
  const dialog=pending?<div className="tpdf-p3-destructive-backdrop">
    <section className="tpdf-p3-destructive" role="alertdialog" aria-modal="true"
      aria-label="Confirm permanent redaction">
      <strong>Permanent redaction — irreversible</strong>
      <p>Save will permanently erase matching text and underlying image pixels
        from the new PDF. Earlier versions may still contain the originals.</p>
      <p>{regions} regions; {terms.length} literal terms; pages:
        {" "+[...pages].sort((a,b)=>a-b).join(", ")}</p>
      {!!terms.length&&<p>Terms: {terms.join(", ")}</p>}
      <p>CAD vector strokes crossing the redaction area may remain.
        The server will verify erased text and reject failures.</p>
      <button type="button" onClick={cancel}>Cancel</button>
      <button type="button" data-testid="confirm-redaction-save"
        onClick={()=>void confirm()}>Erase permanently and Save</button>
    </section>
  </div>:null;
  return {saveSafely,dialog};
}
