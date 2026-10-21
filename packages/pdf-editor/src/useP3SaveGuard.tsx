import { useEffect, useRef, useState } from "react";
import type { PdfChange } from "./history.js";
import { redactHistoryWarning, summarizeRedactions } from "./p3RedactionSummary.js";
export function useP3SaveGuard(changes:PdfChange[],save:()=>Promise<void>,
  purgesHistory?: boolean) {
  const [pending,setPending]=useState(false);
  const waiter=useRef<{promise:Promise<void>;resolve:()=>void;
    reject:(e:Error)=>void}|null>(null);
  useEffect(()=>()=>{
    waiter.current?.reject(Error("Editor unmounted while waiting for consent"));
    waiter.current=null;
  },[]);
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
  const summary = summarizeRedactions(changes);
  const dialog=pending?<div className="tpdf-p3-destructive-backdrop">
    <section className="tpdf-p3-destructive" role="alertdialog" aria-modal="true"
      aria-label="Confirm permanent redaction">
      <strong>Permanent redaction — irreversible</strong>
      <p>Save will permanently erase matching text and underlying image pixels
        from the new PDF. {redactHistoryWarning(purgesHistory)}</p>
      <p>{summary.regions} regions; {summary.terms.length} literal terms; pages:
        {" "+summary.pages.join(", ")}</p>
      {!!summary.terms.length&&<p>Terms: {summary.terms.join(", ")}</p>}
      <p>CAD vector strokes crossing the redaction area may remain.
        The server will verify erased text and reject failures.</p>
      <button type="button" onClick={cancel}>Cancel</button>
      <button type="button" data-testid="confirm-redaction-save"
        onClick={()=>void confirm()}>Erase permanently and Save</button>
    </section>
  </div>:null;
  return {saveSafely,dialog};
}
