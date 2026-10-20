import { useEffect, useState, type ReactNode } from "react";
import { AppShellIcon } from "./AppShellIcon.js";
import { APP_WORDS, SHELL_TABS, SHEET_GROUPS, SHELL_BUILTINS, TAB_TEXT,
  enabledBuiltin, visibleBuiltins, type ShellTab } from "./appShellModel.js";
import { P1StyleBar } from "./P1StyleBar.js";
import { toolLabel } from "./p1Labels.js";
import type { P1Style } from "./p1Types.js";
import type { PdfHostTool, PdfRegion, PdfSearchHit, PdfTool } from "./types.js";

type Props = {
  children: ReactNode; locale: "vi" | "en"; text: Record<string, string>;
  name: string; dirty: boolean; busy: boolean; page: number; total: number; zoom: number;
  tile: boolean; canEdit: boolean; canForms: boolean; canSave: boolean;
  undoEnabled: boolean; redoEnabled: boolean; tool: PdfTool;
  query: string; results: PdfSearchHit[]; note: string; selection: PdfRegion | null;
  tools: PdfHostTool[]; canText?: boolean; canAsset?: boolean; canP1?: boolean;
  style?: P1Style; onStyle?: (value: P1Style) => void;
  onTool: (value: PdfTool) => void; onNote: (value: string) => void;
  onSearchQuery: (value: string) => void; onSearch: () => void;
  onGoto: (page: number) => void; onBuiltin: (id: string) => void;
  onSave: () => void; onUndo: () => void; onRedo: () => void;
  onToolError: (error: unknown) => void;
};
export function AppShell(props: Props) {
  const { text: base, locale } = props;
  const words: Record<string, string> = { ...APP_WORDS[locale], ...base };
  const [tab, setTab] = useState<ShellTab>("view");
  const [sheet, setSheet] = useState(false);
  const [search, setSearch] = useState(false);
  const [hostBusy, setHostBusy] = useState<string | null>(null);
  const [commentNotice, setCommentNotice] = useState(false);
  const [styleOpen, setStyleOpen] = useState(false);
  const commands = visibleBuiltins(tab, props.canEdit, props.canForms,
    props.canText, props.canAsset, props.canP1);
  const selection = props.selection ?? undefined;
  const hostComments = props.tools.find((item) => item.group.toLowerCase() === "comments");
  useEffect(() => {
    if (!sheet) return;
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") setSheet(false); };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [sheet]);
  function chooseTab(next: ShellTab) {
    if (next === "all") { setSheet(true); return; }
    setTab(next);
    if (next === "annotate" && props.canEdit) props.onTool("highlight");
    if (next === "shapes") props.onTool("region");
    if (next === "insert" && props.canEdit && props.canAsset) props.onTool("signature");
    if (next === "view") props.onTool("region");
  }
  function activate(id: string) {
    if (id === "style" || id === "shapeStyle") {
      setStyleOpen(true); setSheet(false); return;
    }
    const item = visibleBuiltins("all", props.canEdit, props.canForms,
      props.canText, props.canAsset, props.canP1).find((entry) => entry.id === id);
    if (!item) return;
    if (item.tool) props.onTool(item.tool);
    else props.onBuiltin(id);
    setSheet(false);
  }
  async function invoke(item: PdfHostTool) {
    if (hostBusy) return;
    setHostBusy(item.id);
    try { await item.run({ page: props.page, selection }); setSheet(false); }
    catch (error) { props.onToolError(error); }
    finally { setHostBusy(null); }
  }
  const focusSearch = () => { setSearch((before) => !before); setCommentNotice(false); };
  return <div className="tpdf-app-shell" data-tpdf-shell="app">
    <header className="tpdf-app-topbar">
      <span className="tpdf-app-logo" aria-hidden="true"><AppShellIcon name="file" size={24} /></span>
      <div className="tpdf-app-file" title={props.name}>
        <strong>{props.name}</strong>
        <small data-testid="shell-save-status">{props.busy ? (words.loading || "Saving…") :
          props.dirty ? words.unsaved : words.saved}</small>
      </div>
      <button className="tpdf-app-icon" type="button" aria-label={words.search}
        onClick={focusSearch}><AppShellIcon name="search" /></button>
      <button className="tpdf-app-icon tpdf-app-save" type="button"
        aria-label={words.save} disabled={!props.canSave || props.busy}
        onClick={props.onSave}><AppShellIcon name="save" /></button>
    </header>
    <nav className="tpdf-app-tabs" role="tablist" aria-label="PDF tool groups">
      <div className="tpdf-app-tab-scroll">
        {SHELL_TABS.filter((value) => value !== "all").map((value) =>
          <button key={value} role="tab" type="button"
            data-tpdf-mode-tab={value} aria-selected={tab === value}
            onClick={() => chooseTab(value)}>{words[TAB_TEXT[value]]}</button>)}
      </div>
      <button className="tpdf-app-tab-all" role="tab" type="button"
        data-tpdf-mode-tab="all" aria-selected={sheet} onClick={() => chooseTab("all")}>
        {words.allTools}</button>
    </nav>
    <div className="tpdf-app-modebar">
      <button type="button" className="tpdf-app-icon" aria-label={words.pages}
        onClick={() => activate("pages")}><AppShellIcon name="pages" /></button>
      <select aria-label="PDF mode" value={commands.some((item) => item.id === props.tool) ? props.tool : ""}
        onChange={(event) => activate(event.target.value)}>
        <option value="">{words[TAB_TEXT[tab]]}</option>
        {commands.map((item) => <option key={item.id} value={item.id}>
          {toolLabel(item.label, words)}</option>)}
      </select>
      <button className="tpdf-app-icon" type="button" aria-label={words.search}
        onClick={focusSearch}><AppShellIcon name="search" /></button>
      <button className="tpdf-app-icon" type="button" aria-label={words.comments}
        onClick={() => hostComments ? void invoke(hostComments) : setCommentNotice((v) => !v)}>
        <AppShellIcon name="comments" /></button>
    </div>
    {search && <div className="tpdf-app-search" data-testid="shell-search">
      <input aria-label={words.search} value={props.query} autoFocus
        placeholder={words.search} onChange={(event) => props.onSearchQuery(event.target.value)}
        onKeyDown={(event) => { if (event.key === "Enter") props.onSearch(); }} />
      <button type="button" onClick={props.onSearch}>{words.search}</button>
      <button type="button" aria-label={words.close} onClick={() => setSearch(false)}>
        <AppShellIcon name="close" size={18} /></button>
      {props.results.length > 0 && <div className="tpdf-app-results">
        {props.results.map((hit, index) => <button type="button" key={hit.page + "-" + index}
          onClick={() => { props.onGoto(hit.page); setSearch(false); }}>
          {words.page} {hit.page}: {hit.snippet.slice(0, 100)}
        </button>)}
      </div>}
    </div>}
    {commentNotice && <div className="tpdf-app-notice" role="status">
      {locale === "vi" ? "Host chưa cung cấp công cụ bình luận." : "Comments require a host tool."}
    </div>}
    {styleOpen && props.style && props.onStyle && <div className="tpdf-app-p1-style">
      <P1StyleBar style={props.style} onChange={props.onStyle}/>
      <button type="button" onClick={() => setStyleOpen(false)}>Done</button>
    </div>}
    {(["note","signature","addText","insertText","callout"].includes(props.tool)) &&
      <div className="tpdf-app-note">
      <input aria-label={words[props.tool]} value={props.note}
        onChange={(event) => props.onNote(event.target.value)} maxLength={160}
        placeholder={words[props.tool]} /></div>}
    <div className="tpdf-app-viewer">
      {props.children}
      {props.tile && <span className="tpdf-app-viewer-badge">{words.lightweight}</span>}
    </div>
    <div className="tpdf-app-status">
      <span>{words.page} {props.page} / {props.total || "…"}</span>
      <span>{Math.round(props.zoom * 100)}%</span>
    </div>
    <nav className="tpdf-app-dock" aria-label="PDF bottom tools">
      {([
        ["read", "eye", () => { props.onTool("region"); setTab("view"); }, true],
        ["undo", "undo", props.onUndo, props.undoEnabled],
        ["redo", "redo", props.onRedo, props.redoEnabled],
        ["tools", "tools", () => setSheet(true), true],
        ["save", "save", props.onSave, props.canSave && !props.busy],
      ] as const).map(([name, icon, action, enabled]) =>
        <button key={name} type="button" className={name === "read" ? "tpdf-app-dock-active" : ""}
          disabled={!enabled} onClick={action} aria-label={words[name]}>
          <AppShellIcon name={icon} size={23} />
          <span>{name === "save" ? (locale === "vi" ? "Lưu" : "Save") : words[name]}</span>
        </button>)}
    </nav>
    {sheet && <div className="tpdf-app-sheet-backdrop" onMouseDown={(event) => {
      if (event.target === event.currentTarget) setSheet(false);
    }}>
      <section className="tpdf-app-sheet" role="dialog" aria-modal="true"
        aria-label={words.allTools}>
        <div className="tpdf-app-sheet-title"><strong>{words.allTools}</strong>
          <button type="button" aria-label={words.close} onClick={() => setSheet(false)}>
            <AppShellIcon name="close" /></button></div>
        <div className="tpdf-app-sheet-list">
          {SHEET_GROUPS.map((group) => {
            const items = SHELL_BUILTINS.filter((item) => item.group === group);
            return items.length ? <section key={group}>
              <h3>{words[TAB_TEXT[group]]}</h3>
              <div className="tpdf-app-tool-grid">{items.map((item) =>
                <button type="button" key={item.id}
                  disabled={!enabledBuiltin(item, props.canEdit, props.canForms,
                    props.canText, props.canAsset, props.canP1)}
                  onClick={() => activate(item.id)}>
                  <AppShellIcon name={item.tool ? "pen" : "pages"} size={19} />
                  <span>{words[item.label] || item.label}</span>
                  {!enabledBuiltin(item, props.canEdit, props.canForms,
                    props.canText, props.canAsset, props.canP1) && <small>{words.soon}</small>}
                </button>)}</div>
            </section> : null;
          })}
          {[...new Set(props.tools.map((item) => item.group))].map((group) =>
            <section key={group}><h3>{group}</h3>
              <div className="tpdf-app-tool-grid">{props.tools.filter((item) => item.group === group)
                .map((item) => <button key={item.id} type="button"
                  disabled={Boolean(hostBusy)} onClick={() => void invoke(item)}>
                  {item.icon || <AppShellIcon name="tools" size={19} />}
                  <span>{item.label}{hostBusy === item.id ? "…" : ""}</span>
                </button>)}</div>
            </section>)}
        </div>
      </section>
    </div>}
  </div>;
}
