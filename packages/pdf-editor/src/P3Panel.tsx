import { useState } from "react";
import type { PdfRegion, PdfTool, TpdfPdfAdapter } from "./types.js";
import type { P3Change, P3LengthUnit, P3PageCalibration, P3Scope, P3MatchCount } from "./p3Types.js";
import { validateScope } from "./p3Validation.js";

type Props = {tool:PdfTool;adapter:TpdfPdfAdapter;selection:PdfRegion|null;
  page:number;pageCount:number;calibration?:P3PageCalibration;
  length:string;unit:P3LengthUnit;setLength:(v:string)=>void;setUnit:(v:P3LengthUnit)=>void;
  redactTerms:string;setRedactTerms:(v:string)=>void;termPages:string;
  setTermPages:(v:string)=>void;addTerms:()=>void;
  addReplace:(v:P3Change)=>void;
  report:(code:string,error:unknown,retryable?:boolean)=>void};
export function P3Panel(p:Props) {
  const [search,setSearch]=useState("");
  const [replacement,setReplacement]=useState("");
  const [scope,setScope]=useState<P3Scope["kind"]>("region");
  const [pages,setPages]=useState("");
  const [caseSensitive,setCaseSensitive]=useState(false);
  const [matches,setMatches]=useState<P3MatchCount|null>(null);
  const [pending,setPending]=useState<P3Change|null>(null);
  const [working,setWorking]=useState(false);
  const caps=p.adapter.p3Capabilities;
  const canScope=(key:P3Scope["kind"])=>!!caps?.replaceText?.[key];
  const actualScope=P3ScopeFor(scope,p.selection,pages);
  async function countMatches() {
    if(!p.adapter.countTextMatches)return;
    setWorking(true);setMatches(null);setPending(null);
    try {
      if(!search.trim())throw Error("Search must not be empty");
      validateScope(actualScope,p.pageCount);
      const value=await p.adapter.countTextMatches({search,caseSensitive,scope:actualScope});
      if(!Number.isInteger(value.count)||value.count<0||!Array.isArray(value.pages)||
        value.pages.some(x=>!Number.isInteger(x)||x<1||x>p.pageCount))
        throw Error("Invalid host text match count");
      setMatches(value);
    }catch(e){p.report("text-matches",e,false);}
    finally{setWorking(false);}
  }
  function proposeReplace(){
    if(!matches||matches.count<1)return;
    setPending({kind:"text.replace",schemaVersion:1,search,replacement,scope:actualScope,
      caseSensitive});
  }
  const invalidate=()=>{setMatches(null);setPending(null);};
  return <section className="tpdf-p3-panel" data-testid="p3-panel">
    {(p.tool==="redact"||p.tool==="applyRedact") && <>
      <strong>Pending redaction — removes underlying text and image pixels when saved</strong>
      {caps?.redact?.regions && <span>Drag over PDF to stage a redaction area.</span>}
      {caps?.redact?.terms && <>
        <label>Literal terms<textarea aria-label="Redact terms" value={p.redactTerms}
          onChange={e=>p.setRedactTerms(e.target.value)} placeholder="One literal term per line"/></label>
        <label>Pages (required) <input aria-label="Redact pages" value={p.termPages}
          placeholder="1,2" onChange={e=>p.setTermPages(e.target.value)}/></label>
        <button type="button" onClick={p.addTerms}>Stage text redaction</button>
      </>}
      <small>Secure removal requires separate confirmation before Save. Earlier versions may retain original data.</small>
    </>}
    {p.tool==="calibrate" && <>
      <strong>Calibrate page {p.page}</strong>
      <label>Real distance <input aria-label="Real distance" inputMode="decimal"
        type="number" min="0.000001" step="any" value={p.length}
        onChange={e=>p.setLength(e.target.value)}/></label>
      <label>Unit <select aria-label="Calibration unit" value={p.unit}
        onChange={e=>p.setUnit(e.target.value as P3LengthUnit)}>
        {(["mm","cm","m","in","ft"] as const).map(x=><option key={x} value={x}>{x}</option>)}
      </select></label>
      <span>Drag between two distinct known points; newest calibration replaces this page's active scale.</span>
    </>}
    {(["distance","perimeter","area"].includes(p.tool)) && <>
      <strong>{p.tool} — page {p.page}</strong>
      <span>{p.calibration ? "Scale "+p.calibration.realLength+" "+
        p.calibration.unit : "Calibrate this page before drawing measurements"}</span>
      <span>{p.tool==="distance"?"Drag from start to end":
        "Draw a boundary on the page; area/perimeter uses a closed polygon."}</span>
    </>}
    {p.tool==="replaceText" && <>
      <strong>Replace text (nearest base font; layout may change)</strong>
      <label>Find <input aria-label="Replace find" value={search}
        onChange={e=>{setSearch(e.target.value);invalidate();}}/></label>
      <label>Replace with <input aria-label="Replace with" value={replacement}
        onChange={e=>{setReplacement(e.target.value);invalidate();}}/></label>
      <label>Scope <select aria-label="Replace scope" value={scope}
        onChange={e=>{setScope(e.target.value as P3Scope["kind"]);invalidate();}}>
        {(["region","pages","document"] as const).map(k=>
          <option key={k} disabled={!canScope(k)} value={k}>{k}</option>)}
      </select></label>
      {scope==="region" && <span>{p.selection ?
        "Region on page "+p.selection.page : "Drag to select a text region"}</span>}
      {scope==="pages" && <label>Pages <input aria-label="Replace pages"
        placeholder="1,2" value={pages}
        onChange={e=>{setPages(e.target.value);invalidate();}}/></label>}
      <label><input type="checkbox" checked={caseSensitive}
        onChange={e=>{setCaseSensitive(e.target.checked);invalidate();}}/> Case sensitive</label>
      <button type="button" disabled={working || !p.adapter.countTextMatches}
        onClick={()=>void countMatches()}>{working?"Counting…":"Count matches"}</button>
      {matches && <span role="status" data-testid="p3-match-count">
        {matches.count} matches on pages {matches.pages.join(", ")||"none"}
      </span>}
      <button type="button" disabled={!matches?.count||working} onClick={proposeReplace}>
        Review replacement</button>
      {pending && <div className="tpdf-p3-confirm" role="dialog"
        aria-label="Confirm text replacement">
        <strong>Replace {matches?.count} matches?</strong>
        <p>{scope==="document"?"This affects the entire document. ":""}
          Some rotated, fragmented or image-based text cannot be replaced.
          Host may use a different base font and report skips in notes.</p>
        <button type="button" onClick={()=>setPending(null)}>Cancel</button>
        <button type="button" onClick={()=>{
          p.addReplace(pending);setPending(null);setMatches(null);
        }}>Confirm replacement</button>
      </div>}
    </>}
  </section>;
}
function P3ScopeFor(kind:P3Scope["kind"],selected:PdfRegion|null,pages:string):P3Scope {
  if(kind==="region")return {kind,region:selected || {
    page:0,x:0,y:0,width:0,height:0,note:""}};
  if(kind==="pages")return {kind,pages:pages.split(",").map(x=>Number(x.trim()))};
  return {kind:"document"};
}
