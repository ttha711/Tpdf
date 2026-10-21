import { useEffect, useState } from "react";
import type { PdfChange } from "./history.js";
import type { PdfRegion, PdfTool, TpdfPdfAdapter } from "./types.js";
import type { P3PageCalibration, P3Change, P3Point, P3LengthUnit } from "./p3Types.js";
import { validateP3, allowedP3 } from "./p3Validation.js";
import { checkCalibration } from "./p3Geometry.js";
import { P3Panel } from "./P3Panel.js";
import { summarizeRedactions } from "./p3RedactionSummary.js";

const TOOLS = ["redact","applyRedact","calibrate","distance","perimeter","area","replaceText"];
export function useP3Editor(input: {
  adapter:TpdfPdfAdapter; tool:PdfTool; page:number; pages:Array<{width:number;height:number}>;
  versionId?:string; changes:PdfChange[]; readOnly:boolean;
  record:(c:PdfChange)=>void; report:(code:string,error:unknown,retryable?:boolean)=>void;
  clearSelection:()=>void; selection:PdfRegion|null;
  locale?:"vi"|"en";
}) {
  const {adapter,tool,changes,record,report,pages,versionId}=input;
  const [stored,setStored]=useState<P3PageCalibration[]>([]);
  const [length,setLength]=useState("1");
  const [unit,setUnit]=useState<P3LengthUnit>("m");
  const [redactTerms,setRedactTerms]=useState("");
  const [termPages,setTermPages]=useState("");
  const enabled=!!adapter.applyChanges&&!input.readOnly;
  const canTool=(id:string)=>enabled && allowedP3(id,adapter.p3Capabilities) &&
    (id!=="replaceText"||!!adapter.countTextMatches);
  useEffect(()=>{
    if(!adapter.listPageCalibrations || !pages.length)return;
    let live=true;
    adapter.listPageCalibrations().then(value=>{
      if(!live)return;
      if(versionId && value.versionId!==versionId)
        throw Error("Stale page calibration inventory");
      if(!Array.isArray(value.calibrations))throw Error("Invalid calibration inventory");
      value.calibrations.forEach(c=>checkCalibration(c,pages.length));
      setStored(value.calibrations);
    }).catch(e=>{if(live)report("calibrations",e,false);});
    return ()=>{live=false;};
  },[adapter,versionId,pages.length]);
  const calibrations=new Map<number,P3PageCalibration>();
  for(const c of stored)calibrations.set(c.page,c);
  for(const edit of changes)if(edit.kind==="measure.calibrate")
    calibrations.set(edit.calibration.page,edit.calibration);
  const active=calibrations.get(input.page);
  const onRegion=(region:PdfRegion, raw?:Array<[number,number]>):boolean=>{
    if(!TOOLS.includes(tool))return false;
    if(!canTool(tool))return true;
    try {
      const pts:P3Point[]=(raw?.length ? raw.map(([x,y])=>({x,y})) : [
        {x:region.x,y:region.y},
        {x:region.x+region.width,y:region.y+region.height},
      ]);
      const start=pts[0],end=pts[pts.length-1];
      let edit:P3Change;
      if(tool==="redact" || tool==="applyRedact") {
        if(!adapter.p3Capabilities?.redact?.regions)throw Error("Region redaction not supported");
        edit={kind:"redact",schemaVersion:1,regions:[region]};
      } else if(tool==="calibrate"){
        const realLength=Number(length);
        edit={kind:"measure.calibrate",schemaVersion:1,
          calibration:{id:"cal-"+region.page+"-"+Date.now(),page:region.page,
            points:[start,end],realLength,unit}};
      } else if(tool==="distance"||tool==="perimeter"||tool==="area"){
        const c=calibrations.get(region.page);
        if(!c)throw Error("Calibrate this page first");
        edit={kind:"measure",schemaVersion:1,type:tool,page:region.page,
          points:tool==="distance"?[start,end]:pts,calibration:{...c,points:[...c.points]}};
      } else return true;
      validateP3(edit,adapter.p3Capabilities,pages.length,pages[region.page-1]);
      record(edit);input.clearSelection();
    }catch(e){report("p3",e,false);}
    return true;
  };
  const addTerms=()=>{
    try{
      const terms=redactTerms.split("\n").map(x=>x.trim()).filter(Boolean);
      const targetPages=termPages.split(",").map(x=>Number(x.trim()));
      const edit:P3Change={kind:"redact",schemaVersion:1,regions:[],terms,pages:targetPages};
      validateP3(edit,adapter.p3Capabilities,pages.length);
      record(edit);setRedactTerms("");
    }catch(e){report("p3",e,false);}
  };
  const addReplace=(edit:P3Change)=>{
    try {
      validateP3(edit,adapter.p3Capabilities,pages.length);
      record(edit);input.clearSelection();
    }catch(e){report("p3",e,false);}
  };
  const panel=canTool(tool)? <P3Panel key={tool} tool={tool}
    locale={input.locale} purgesHistory={adapter.p3Capabilities?.redact?.purgesHistory}
    pendingRedactions={summarizeRedactions(changes)}
    adapter={adapter} selection={input.selection} page={input.page}
    pageCount={pages.length} calibration={active} length={length} unit={unit}
    setLength={setLength} setUnit={setUnit} redactTerms={redactTerms}
    setRedactTerms={setRedactTerms} termPages={termPages} setTermPages={setTermPages}
    addTerms={addTerms} addReplace={addReplace} report={report}/> : null;
  return {panel,onRegion,canTool,calibrations,calibrated:!!active};
}
