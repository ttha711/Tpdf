import { useState } from "react";
import { AppShellIcon } from "./AppShellIcon.js";
import { SHELL_BUILTINS, SHEET_GROUPS, TAB_TEXT, APP_WORDS,
  enabledBuiltin, type ShellTab } from "./appShellModel.js";
import { toolLabel } from "./p1Labels.js";
import type { AppShellProps } from "./AppShell.js";

export function DesktopRibbon(p:AppShellProps & {
  onStylePanel:()=>void; onSearchPanel:()=>void; compact:boolean;
}) {
  const words={...APP_WORDS[p.locale],...p.text};
  const [tab,setTab]=useState<string>("view");
  const hostGroups=[...new Set(p.tools.map(t=>t.group))];
  const groups=[...SHEET_GROUPS,...hostGroups];
  const builtins=SHELL_BUILTINS.filter(item=>item.group===tab);
  const host=p.tools.filter(item=>item.group===tab);
  const enabled=(item:typeof SHELL_BUILTINS[number])=>enabledBuiltin(item,
    p.canEdit,p.canForms,p.canText,p.canAsset,p.canP1,
    p.canP2,p.canFill,p.canAttachment,p.p3);
  function select(id:string) {
    if(id==="style"||id==="shapeStyle"){p.onStylePanel();return;}
    const item=SHELL_BUILTINS.find(c=>c.id===id);
    if(item?.tool)p.onTool(item.tool);
    else if(item)p.onBuiltin(item.id);
  }
  return <div className="tpdf-desktop-ribbon" data-testid="desktop-ribbon">
    <header className="tpdf-desktop-ribbon-head">
      <div className="tpdf-desktop-title" title={p.name}>
        <strong>{p.name}</strong>
        <span data-testid="shell-save-status">{p.busy?words.loading:
          p.dirty?words.unsaved:words.saved}</span></div>
      <div className="tpdf-desktop-quick">
        <button type="button" aria-label="Undo" disabled={!p.undoEnabled}
          onClick={p.onUndo}><AppShellIcon name="undo" size={17}/> Undo</button>
        <button type="button" aria-label="Redo" disabled={!p.redoEnabled}
          onClick={p.onRedo}><AppShellIcon name="redo" size={17}/> Redo</button>
        <button type="button" aria-label="Save version"
          disabled={!p.canSave||p.busy} onClick={p.onSave}>
          <AppShellIcon name="save" size={17}/> Save</button>
      </div>
    </header>
    <nav className="tpdf-desktop-ribbon-tabs" role="tablist" aria-label="PDF ribbon">
      {groups.map(group=><button type="button" role="tab" key={group}
        aria-selected={tab===group} onClick={()=>setTab(group)}>
        {SHEET_GROUPS.includes(group as ShellTab)
          ? words[TAB_TEXT[group as ShellTab]]:group}</button>)}
    </nav>
    <div className="tpdf-desktop-ribbon-commands" role="toolbar"
      aria-label={tab+" commands"}>
      {builtins.map(item=><button key={item.id} type="button"
        aria-pressed={Boolean(item.tool&&p.tool===item.tool)}
        disabled={!enabled(item)} title={!enabled(item)?words.soon:undefined}
        onClick={()=>select(item.id)}>
        <AppShellIcon name={item.tool?"pen":"pages"} size={17}/>
        <span>{toolLabel(item.label,words,p.locale)}</span>
        {!enabled(item)&&<small>{words.soon}</small>}
      </button>)}
      {host.map(item=><button key={item.id} type="button"
        onClick={()=>Promise.resolve(item.run({page:p.page,selection:p.selection||undefined}))
          .catch(p.onToolError)}>
        {item.icon || <AppShellIcon name="tools" size={17}/>}
        <span>{item.label}</span></button>)}
      {!host.length&&!builtins.length&&<span>No tools in this group</span>}
      {p.compact&&<button type="button" onClick={p.onSearchPanel}>
        <AppShellIcon name="search" size={17}/> Find</button>}
    </div>
  </div>;
}
