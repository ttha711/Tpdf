import { AppShellIcon } from "./AppShellIcon.js";
import type { AppShellProps } from "./AppShell.js";
import type { MobilePdfTool } from "./mobilePdfToolCatalog.js";
import { webToolAction, webToolEnabled, executeWebTool } from "./webToolCommands.js";
const iconName=(id:string):"eye"|"search"|"pages"|"comments"|"pen"|"tools"|"save"|"chevron"=>
  ["read","fit-width","fit-page","pan"].includes(id)?"eye":
  id==="search"?"search":id==="pages"?"pages":
  ["note","comments","callout"].includes(id)?"comments":
  ["annotation-style","shape-style","insert-style","form-style"].includes(id)?"tools":"pen";
export type WebToolCallbacks={showSearch:()=>void;showPages:()=>void;
  showComments:()=>void;showStyle:()=>void;showInspector?:()=>void};
export function WebToolButton({tool,p,actions,mode="strip"}:{
  tool:MobilePdfTool;p:AppShellProps;actions:WebToolCallbacks;
  mode?:"strip"|"grid";
}) {
  const enabled=webToolEnabled(tool,p),action=webToolAction(tool);
  const pressed=action.type==="tool" && action.id===p.tool ||
    tool.id==="read" && p.tool==="region";
  return <button type="button" className={"tpdf-web-tool tpdf-web-tool-"+mode}
    data-tpdf-mobile-tool={tool.id} aria-label={tool.label}
    aria-pressed={pressed} disabled={!enabled}
    title={!enabled?"Coming soon":tool.label}
    onClick={()=>executeWebTool(tool,p,actions)}>
    <AppShellIcon name={iconName(tool.id)} size={18}/>
    <span>{tool.label}</span>
    {!enabled&&<small>Coming soon</small>}
  </button>;
}
