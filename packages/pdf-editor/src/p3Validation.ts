import type { P3Capabilities, P3Change, P3Scope } from "./p3Types.js";
import { checkCalibration, scaledMeasurement } from "./p3Geometry.js";
import { validRegion } from "./history.js";
const pagesOK=(pages:number[],max:number)=>pages.length>0 &&
  pages.every(p=>Number.isInteger(p)&&p>=1&&p<=max) &&
  new Set(pages).size===pages.length;
export function validateScope(scope:P3Scope,max:number):void {
  if(scope.kind==="region" && !validRegion(scope.region,max))
    throw Error("Invalid replacement region");
  if(scope.kind==="pages" && !pagesOK(scope.pages,max))
    throw Error("Invalid replacement pages");
  if(!["region","pages","document"].includes(scope.kind))
    throw Error("Unknown replacement scope");
}
export function allowedP3(tool:string,c?:P3Capabilities):boolean {
  if(tool==="redact" || tool==="applyRedact")
    return !!c?.redact?.secureErase && !!(c.redact.regions || c.redact.terms);
  if(tool==="calibrate")return !!c?.measure?.calibrate;
  if(tool==="distance"||tool==="perimeter"||tool==="area")
    return !!c?.measure?.calibrate && !!c.measure[tool];
  if(tool==="replaceText")return !!c?.replaceText?.count &&
    !!(c.replaceText.region||c.replaceText.pages||c.replaceText.document);
  return false;
}
export function validateP3(change:P3Change,c:P3Capabilities|undefined,max:number,
  size?:{width:number;height:number}):void {
  if(change.schemaVersion!==1)throw Error("Unknown P3 version");
  if(change.kind==="redact"){
    if(!allowedP3("redact",c))throw Error("Secure redaction unavailable");
    const hasRegions=change.regions.length>0,hasTerms=!!change.terms?.length;
    if(!hasRegions&&!hasTerms)throw Error("No regions or terms to redact");
    if(hasRegions&&(!c?.redact?.regions||change.regions.some(r=>!validRegion(r,max))))
      throw Error("Redact region unsupported");
    if(hasTerms&&(!c?.redact?.terms||!change.terms?.every(t=>t.trim().length>0)||
        !change.pages||!pagesOK(change.pages,max)))
      throw Error("Redact terms require explicit pages");
    return;
  }
  if(change.kind==="measure.calibrate"){
    if(!allowedP3("calibrate",c))throw Error("Calibration unsupported");
    checkCalibration(change.calibration,max);return;
  }
  if(change.kind==="measure"){
    if(!allowedP3(change.type,c))throw Error("Measure mode unsupported");
    checkCalibration(change.calibration,max);
    if(change.page!==change.calibration.page)throw Error("Calibration must match measurement page");
    if(!size)throw Error("Page size required for measurements");
    const value=scaledMeasurement(change.type,change.points,change.calibration,size.width,size.height);
    if(!Number.isFinite(value)||value<=0)throw Error("Degenerate measurement");
    return;
  }
  if(!allowedP3("replaceText",c))throw Error("Replace unsupported");
  if(!change.search.trim()||typeof change.replacement!=="string")
    throw Error("Invalid replacement text");
  validateScope(change.scope,max);
  if(!c?.replaceText?.[change.scope.kind])throw Error("Replacement scope unsupported");
}
