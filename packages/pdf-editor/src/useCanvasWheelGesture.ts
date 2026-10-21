import { useEffect, type RefObject } from "react";
/** Forward non-tile Ctrl/Cmd+wheel to the editor's anchored zoom handler. */
export function useCanvasWheelGesture(
  scroller:RefObject<HTMLElement|null>, enabled:boolean, zoom:number, dpr:number,
) {
  useEffect(()=>{
    const node=scroller.current;
    if(!node||!enabled)return;
    const handle=(event:WheelEvent)=>{
      if(!event.ctrlKey&&!event.metaKey)return;
      event.preventDefault();
      const bounds=node.getBoundingClientRect();
      const next=Math.max(0.05,Math.min(16/dpr,zoom*Math.exp(-event.deltaY*.008)));
      node.dispatchEvent(new CustomEvent("tpdf-tile-zoom",{detail:{
        next,x:event.clientX-bounds.left,y:event.clientY-bounds.top,
      }}));
    };
    node.addEventListener("wheel",handle,{passive:false});
    return()=>node.removeEventListener("wheel",handle);
  },[scroller,enabled,zoom,dpr]);
}
