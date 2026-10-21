import type { MobilePdfTool } from "./mobilePdfToolCatalog.js";
import { SHELL_BUILTINS, enabledBuiltin } from "./appShellModel.js";
import type { AppShellProps } from "./AppShell.js";
import type { PdfTool } from "./types.js";

const names: Record<string,string> = {
  ink:"draw", "ink-highlight":"inkHighlight", text:"addText",
  "insert-text":"insertText", "replace-text":"replaceText",
  textfield:"textField", select:"dropdown", listbox:"listBox",
  "fill-mode":"fill", note:"comment",
};
const styles = new Set(["annotation-style","shape-style","insert-style","form-style"]);
const actions: Record<string,string> = {
  read:"select", pan:"pan", "fit-width":"fit", "fit-page":"fitPage",
  "zoom-in":"zoomIn", "zoom-out":"zoomOut", "rotate-right":"rotate",
  search:"search", pages:"pages", comments:"comments",
  "redaction-panel":"redactionPanel",
};
export type WebToolAction = {type:"tool"|"builtin"|"panel"|"disabled";id:string};
export function webToolAction(tool: MobilePdfTool):WebToolAction {
  if(tool.id==="rotate-left")
    return {type:"disabled",id:tool.id};
  if(styles.has(tool.id))return {type:"panel",id:"style"};
  if(tool.id in actions)return {type:"builtin",id:actions[tool.id]};
  return {type:"tool",id:names[tool.id]||tool.id};
}
export function webToolEnabled(tool:MobilePdfTool,p:AppShellProps):boolean {
  const command=webToolAction(tool);
  if(command.type==="disabled")return false;
  if(command.id==="comments")return Boolean(p.commentsPanel)||p.tools.some(x=>x.group.toLowerCase()==="comments");
  if(command.id==="comment")return !!p.canEdit&&!!p.canComment;
  if(command.id==="search")return true;
  if(command.id==="pan"||command.id==="select"||command.id==="pages"||
     command.id==="fit"||command.id==="fitPage"||
     command.id==="zoomIn"||command.id==="zoomOut")return true;
  if(command.id==="rotate")return p.canEdit;
  if(command.id==="style")return !!p.canEdit&&!!p.canP1&&!!p.style&&!!p.onStyle;
  if(command.id==="redactionPanel")return Boolean(p.p3?.enabled&&p.p3?.caps?.redact?.secureErase);
  const candidate=SHELL_BUILTINS.find(item=>
    item.id===command.id||(item.tool&&item.tool===command.id));
  return !!candidate&&enabledBuiltin(candidate,p.canEdit,p.canForms,
    p.canText,p.canAsset,p.canP1,p.canP2,p.canFill,p.canAttachment,p.p3);
}
export function executeWebTool(tool:MobilePdfTool,p:AppShellProps,
  actions:{showSearch:()=>void;showPages:()=>void;showComments:()=>void;
    showStyle:()=>void;showInspector?:()=>void}) {
  if(!webToolEnabled(tool,p))return;
  const action=webToolAction(tool);
  if(action.type==="tool"){p.onTool(action.id as PdfTool);return;}
  if(action.id==="search"){actions.showSearch();return;}
  if(action.id==="pages"){actions.showPages();return;}
  if(action.id==="comments"){actions.showComments();return;}
  if(action.id==="style"){actions.showStyle();return;}
  if(action.id==="redactionPanel"){p.onTool("redact");actions.showInspector?.();return;}
  if(action.id==="select"){p.onTool("region");return;}
  p.onBuiltin(action.id);
}
