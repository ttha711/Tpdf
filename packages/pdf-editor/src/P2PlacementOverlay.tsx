import type { P2Change } from "./p2Types.js";
import type { PdfRegion } from "./types.js";
export function P2PlacementOverlay({ changes, page }: { changes: P2Change[]; page: number }) {
  const placements: Array<{kind:string; region:PdfRegion; label:string}> = [];
  for (const c of changes) {
    if (c.kind === "form.create") {
      if ("region" in c.field) placements.push({ kind:"form", region:c.field.region,
        label:c.field.name+" ("+c.field.type+")" });
      else c.field.choices.forEach(choice=>placements.push({
        kind:"form",region:choice.region,label:c.field.name+" ("+choice.label+")",
      }));
    }
    if (c.kind === "link") placements.push({ kind:"link",region:c.region,
      label:c.target.kind==="url" ? "Link" : "Page "+c.target.page });
    if (c.kind === "attachment") placements.push({kind:"attachment",region:c.region,
      label:"Attachment"});
  }
  return <>{placements.filter(p=>p.region.page===page).map((p,index)=>
    <div key={index} data-tpdf-p2={p.kind}
      className={"tpdf-p2-mark tpdf-p2-"+p.kind}
      style={{position:"absolute",pointerEvents:"none",boxSizing:"border-box",
        left:p.region.x+"%",top:p.region.y+"%",
        width:p.kind==="attachment" ? 24 : p.region.width+"%",
        height:p.kind==="attachment" ? 24 : p.region.height+"%"}}>
      <span>{p.kind==="attachment" ? "📎" : p.label}</span>
    </div>)}</>;
}
