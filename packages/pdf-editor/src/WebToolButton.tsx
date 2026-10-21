import { WebToolIcon } from "./WebToolIcon.js";
import type { AppShellProps } from "./AppShell.js";
import type { MobilePdfTool } from "./mobilePdfToolCatalog.js";
import { webToolAction, webToolEnabled, executeWebTool } from "./webToolCommands.js";
export type WebToolCallbacks={showSearch:()=>void;showPages:()=>void;
  showComments:()=>void;showStyle:()=>void;showInspector?:()=>void};
export function WebToolButton({tool,p,actions,mode="strip",onSelected}:{
  tool:MobilePdfTool;p:AppShellProps;actions:WebToolCallbacks;
  mode?:"strip"|"grid";onSelected?:()=>void;
}) {
  const enabled=webToolEnabled(tool,p),action=webToolAction(tool);
  const pressed=action.type==="tool" && action.id===p.tool ||
    tool.id==="read" && p.tool==="region";
  return <button type="button" className={"tpdf-web-tool tpdf-web-tool-"+mode}
    data-tpdf-mobile-tool={tool.id} aria-label={tool.label}
    aria-pressed={pressed} disabled={!enabled}
    title={!enabled?"Coming soon":tool.label}
    onClick={()=>{executeWebTool(tool,p,actions);onSelected?.();}}>
    <WebToolIcon name={tool.icon} size={18}/>
    <span>{tool.label}</span>
    {!enabled&&<small>Coming soon</small>}
  </button>;
}
