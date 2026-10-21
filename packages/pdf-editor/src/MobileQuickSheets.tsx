import { useEffect } from "react";
import type { AppShellProps } from "./AppShell.js";
import { MOBILE_PDF_GROUPS } from "./mobilePdfToolCatalog.js";
import { WebToolButton, type WebToolCallbacks } from "./WebToolButton.js";

const VIEW_IDS = ["read", "pan", "fit-width", "fit-page", "zoom-in", "zoom-out", "rotate-left", "rotate-right"];

/** The two small sheets of the web app's chrome row: the file menu (the hamburger) and the view menu (the three dots). */
export function MobileQuickSheet(p: {
  kind: "file" | "view"; shell: AppShellProps; actions: WebToolCallbacks; onClose: () => void;
}) {
  useEffect(() => {
    const close = (e: KeyboardEvent) => { if (e.key === "Escape") p.onClose(); };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [p.onClose]);
  const fullscreen = () => {
    const root = document.querySelector<HTMLElement>(".tpdf-editor");
    if (document.fullscreenElement) void document.exitFullscreen?.();
    else void root?.requestFullscreen?.().catch(() => {});
  };
  const fileRows: Array<[string, (() => void) | undefined]> = [
    ["Open", p.shell.onOpenFile], ["Close", undefined], ["Print", undefined], ["Security", undefined],
    ["Screenshot", undefined], ["Export", undefined], ["Save PDF", p.shell.canSave ? p.shell.onSave : undefined],
    ["Fullscreen", typeof document !== "undefined" && "requestFullscreen" in document.documentElement ? fullscreen : undefined],
  ];
  const viewTools = MOBILE_PDF_GROUPS.find(g => g.id === "view")!.tools.filter(t => VIEW_IDS.includes(t.id));
  const label = p.kind === "file" ? "File menu" : "View menu";
  return <div className="tpdf-app-sheet-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) p.onClose(); }}>
    <section className="tpdf-app-sheet tpdf-app-quick-sheet" role="dialog" aria-modal="true" aria-label={label}>
      <header className="tpdf-app-sheet-title"><div><strong>{label}</strong></div>
        <button type="button" aria-label={"Close " + label.toLowerCase()} onClick={p.onClose}>×</button></header>
      <div className="tpdf-app-sheet-list">
        {p.kind === "file"
          ? <div className="tpdf-app-quick-list">{fileRows.map(([name, run]) =>
            <button type="button" key={name} disabled={!run} title={run ? name : "Coming soon"}
              onClick={() => { run?.(); p.onClose(); }}>
              <span>{name}</span>{!run && <small>Coming soon</small>}</button>)}</div>
          : <div className="tpdf-app-tool-grid">{viewTools.map(tool =>
            <WebToolButton key={tool.id} mode="grid" p={p.shell} tool={tool} actions={p.actions} onSelected={p.onClose} />)}</div>}
      </div>
    </section>
  </div>;
}
