import type { P3PageCalibration, P3Point, P3LengthUnit } from "./p3Types.js";
import { validPoint } from "./p1Marks.js";
const units:Record<P3LengthUnit,number> = { mm:72/25.4, cm:72/2.54, m:72/0.0254, in:72, ft:864 };
export function pageDistance(a:P3Point,b:P3Point,width:number,height:number) {
  return Math.hypot((a.x-b.x)*width/100,(a.y-b.y)*height/100);
}
export function checkCalibration(c:P3PageCalibration, pages:number) {
  if (!c.id?.trim() || c.id.length>128 || !Number.isInteger(c.page) ||
      c.page<1 || c.page>pages || c.points?.length!==2 ||
      !c.points.every(validPoint) || !Number.isFinite(c.realLength) ||
      c.realLength<=0 || !(c.unit in units) ||
      (c.points[0].x===c.points[1].x && c.points[0].y===c.points[1].y))
    throw Error("Invalid page calibration");
}
export function scaledMeasurement(type:"distance"|"perimeter"|"area",
  points:P3Point[], c:P3PageCalibration, width:number,height:number) {
  if (!points.every(validPoint) || !Number.isFinite(width) || !Number.isFinite(height) ||
      width<=0 || height<=0) throw Error("Invalid measured geometry");
  if (points.length < (type==="distance"?2:3) ||
      (type==="distance" && points.length!==2)) throw Error("Invalid measure vertices");
  const baseline=pageDistance(c.points[0],c.points[1],width,height);
  if(baseline<=0)throw Error("Calibration endpoints overlap");
  const ratio=c.realLength/baseline;
  if(type==="distance")return pageDistance(points[0],points[1],width,height)*ratio;
  if(type==="perimeter")return points.reduce((sum,p,i)=>
    sum+pageDistance(p,points[(i+1)%points.length],width,height),0)*ratio;
  const area=points.reduce((sum,p,i)=>{
    const q=points[(i+1)%points.length];
    return sum+(p.x*q.y-q.x*p.y)*width*height/10000;
  },0);
  return Math.abs(area)*ratio*ratio/2;
}
export function measureLabel(value:number,unit:P3LengthUnit,area:boolean) {
  return value.toFixed(2)+" "+unit+(area?"²":"");
}
