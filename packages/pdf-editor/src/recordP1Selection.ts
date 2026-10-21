import type { PdfRegion, PdfTool, TpdfPdfAdapter } from "./types.js";
import type { PdfChange } from "./history.js";
import { buildP1Mark } from "./p1Marks.js";
import { P1_TOOLS, TEXT_MARKUP, ASSET_TOOL,
  type P1Asset, type P1Point, type P1Quad, type P1Style } from "./p1Types.js";
export async function recordP1Selection(input: {
  tool:PdfTool; region:PdfRegion; points?:Array<[number,number]>;
  adapter:TpdfPdfAdapter; note:string; style:P1Style;
  record:(change:PdfChange)=>void;
  report:(code:string,error:unknown,retryable?:boolean)=>void;
  clearSelection:()=>void;
}) {
  const {tool,region,points,adapter,note,style,record,report,clearSelection}=input;
  const legacy:PdfTool[]=["highlight","note","draw","cover","signature"];
  const useP1=P1_TOOLS.includes(tool as typeof P1_TOOLS[number]) &&
    !(tool==="highlight"&&!adapter.resolveTextQuads) &&
    !(tool==="signature"&&!adapter.selectAsset);
  if(useP1&&!adapter.applyChanges){
    report("p1-mark",Error("P1 marks require host adapter.applyChanges"),false);
    return;
  }
  if(!useP1){
    if(!legacy.includes(tool))return;
    const oldType=tool as "highlight"|"note"|"draw"|"cover"|"signature";
    record({kind:"mark",mark:{type:oldType,region,
      value:tool==="note"||tool==="signature"?note:undefined,points}});
    clearSelection();
    return;
  }
  try{
    const p1Tool=tool as typeof P1_TOOLS[number];
    const quads:P1Quad[]|undefined=TEXT_MARKUP.includes(p1Tool as typeof TEXT_MARKUP[number])
      ?await adapter.resolveTextQuads?.(region.page,region):undefined;
    if(TEXT_MARKUP.includes(p1Tool as typeof TEXT_MARKUP[number])&&!quads?.length)
      throw Error("No text found there. Drag across the text you want to mark.");
    const asset=ASSET_TOOL.includes(p1Tool as P1Asset)
      ?await adapter.selectAsset?.(p1Tool as P1Asset):undefined;
    if(ASSET_TOOL.includes(p1Tool as P1Asset)&&!asset)return;
    const path:P1Point[]=(points||[[region.x,region.y],
      [region.x+region.width,region.y+region.height]])
      .map(([x,y])=>({x,y}));
    const mark=buildP1Mark({tool:p1Tool,region,style,path,text:note,quads,
      assetId:asset?.assetId});
    record({kind:"mark",mark});clearSelection();
  }catch(error){report("p1-mark",error,false);}
}
