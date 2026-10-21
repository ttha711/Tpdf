import type { P3Change, P3Point } from "./p3Types.js";
import { scaledMeasurement, measureLabel } from "./p3Geometry.js";
export function P3PendingOverlay({changes,page,width,height}:{
  changes:P3Change[];page:number;width:number;height:number;
}) {
  const coords=(p:P3Point[])=>p.map(x=>x.x+","+x.y).join(" ");
  return <div className="tpdf-p3-overlay" data-tpdf-p3-overlay
    style={{position:"absolute",inset:0,pointerEvents:"none"}}>
    {changes.flatMap((c,i)=>c.kind==="redact"?
      c.regions.filter(r=>r.page===page).map((r,k)=>
        <div key={i+"-"+k} data-tpdf-p3="redact" className="tpdf-p3-redact"
          style={{position:"absolute",left:r.x+"%",top:r.y+"%",
            width:r.width+"%",height:r.height+"%"}}>
          Pending redaction
        </div>):[])}
    {changes.flatMap((c,i)=>c.kind==="text.replace"&&c.scope.kind==="region"&&c.scope.region.page===page?
      [<div key={"r"+i} data-tpdf-p3="text.replace" className="tpdf-p3-replaced"
        style={{left:c.scope.region.x+"%",top:c.scope.region.y+"%",
          width:c.scope.region.width+"%",height:c.scope.region.height+"%"}}><span style={{fontSize:"min(68cqh,"+(170/Math.max(1,(c.preview??c.replacement).length)).toFixed(2)+"cqw)"}}>{c.preview??c.replacement}</span></div>]:[])}
    {changes.filter(c=>c.kind==="measure"&&c.page===page ||
      c.kind==="measure.calibrate"&&c.calibration.page===page).map((c,i)=>{
      const points=c.kind==="measure.calibrate"?c.calibration.points:c.kind==="measure"?c.points:[];
      if(!points.length)return null;
      let label="Calibration";
      if(c.kind==="measure") {
        try { label=measureLabel(scaledMeasurement(c.type,c.points,c.calibration,width,height),
          c.calibration.unit,c.type==="area"); } catch { label="Invalid measure"; }
      } else if(c.kind==="measure.calibrate") {
        label=c.calibration.realLength+" "+c.calibration.unit;
      }
      const anchor=points[points.length-1];
      return <svg key={i} data-tpdf-p3={c.kind} viewBox="0 0 100 100"
        preserveAspectRatio="none" style={{position:"absolute",inset:0,width:"100%",height:"100%"}}>
        <polyline points={coords(points)} fill="none" stroke="#e57d18" strokeWidth=".55"/>
        {c.kind==="measure"&&c.type!=="distance"&&
          <line x1={anchor.x} y1={anchor.y} x2={points[0].x} y2={points[0].y}
            stroke="#e57d18" strokeWidth=".55"/>}
        <text x={Math.min(anchor.x,78)} y={Math.max(3,anchor.y-2)}
          fontSize="2.7" fill="#a34a04">{label}</text>
      </svg>;
    })}
  </div>;
}
