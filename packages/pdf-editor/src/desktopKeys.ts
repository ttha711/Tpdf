import type { KeyboardEvent, RefObject } from "react";
import type { ShellLayout } from "./useContainerLayout.js";
export function handleDesktopKeys(event:KeyboardEvent<HTMLDivElement>,
  layout:ShellLayout, options: {
    root:RefObject<HTMLDivElement|null>; goto:(page:number)=>void;
    page:number; redo:()=>void; readOnly:boolean;
  }):boolean {
  if(layout==="mobile")return false;
  const modifier=event.ctrlKey||event.metaKey;
  const key=event.key.toLowerCase();
  const target=event.target as HTMLElement;
  const typing=!!target.closest("input,textarea,select,[contenteditable='true']");
  if(modifier&&key==="f"){
    event.preventDefault();
    options.root.current?.dispatchEvent(new CustomEvent("tpdf-desktop-find",{bubbles:true}));
    return true;
  }
  if(modifier&&key==="y"&&!options.readOnly&&!typing){
    event.preventDefault();options.redo();return true;
  }
  if(!modifier&&!typing&&(event.key==="PageDown"||event.key==="PageUp")){
    event.preventDefault();options.goto(options.page+(event.key==="PageDown"?1:-1));
    return true;
  }
  return false;
}
