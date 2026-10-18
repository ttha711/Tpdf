import { useEffect, useState } from "react";
import type { ActiveTool } from "../lib/app-types";
import { MOBILE_PDF_GROUPS, runMobilePdfCommand, switchMobilePdfMode, type MobilePdfMode, type MobilePdfTool } from "../lib/mobilePdfTools";
import { TpdfIcon, type TpdfIconName } from "./TpdfIcon";

type Props = {
  activeTool: ActiveTool;
  page: number;
  totalPages: number;
  zoom: number;
  onShowPages: () => void;
  onToolChange: (tool: ActiveTool) => void;
  onDoneEditing: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onSave: () => void;
  onFindCommands: () => void;
  onShowTools: () => void;
  onShowInfo: () => void;
  onShowAi: () => void;
  isPublic: boolean;
};

export function MobilePdfDock({
  activeTool, page, totalPages, zoom, onShowPages, onToolChange, onDoneEditing, onUndo,
  onRedo, onSave, onFindCommands, onShowTools, onShowInfo, onShowAi, isPublic,
}: Props) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [mode, setMode] = useState<MobilePdfMode>("view");
  const [nativeCommand, setNativeCommand] = useState("");
  const [availability, setAvailability] = useState<Record<string, boolean>>({});
  const [measureSelection, setMeasureSelection] = useState("distance");

  useEffect(() => {
    const open = () => setSheetOpen(true);
    const onMode = (event: Event) => {
      const next = (event as CustomEvent<{ mode: MobilePdfMode }>).detail?.mode;
      if (next) setMode(next);
    };
    const onTool = (event: Event) =>
      setNativeCommand((event as CustomEvent<{ command: string }>).detail?.command ?? "");
    const onAvailability = (event: Event) =>
      setAvailability((event as CustomEvent<Record<string, boolean>>).detail ?? {});
    window.addEventListener("tpdf:mobile-tools-open", open);
    window.addEventListener("tpdf:embedpdf-mode-changed", onMode);
    window.addEventListener("tpdf:embedpdf-tool-changed", onTool);
    window.addEventListener("tpdf:embedpdf-command-availability", onAvailability);
    return () => {
      window.removeEventListener("tpdf:mobile-tools-open", open);
      window.removeEventListener("tpdf:embedpdf-mode-changed", onMode);
      window.removeEventListener("tpdf:embedpdf-tool-changed", onTool);
      window.removeEventListener("tpdf:embedpdf-command-availability", onAvailability);
    };
  }, []);
  useEffect(() => {
    if (activeTool === "measure") setMode("measure");
  }, [activeTool]);
  useEffect(() => {
    if (!sheetOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSheetOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sheetOpen]);

  const action = (label: string, icon: TpdfIconName, click: () => void, pressed = false) => (
    <button type="button" className="tpdf-mobile-dock-action" aria-label={label}
      title={label} aria-pressed={pressed} onClick={click}>
      <TpdfIcon name={icon} size={20} /><span>{label}</span>
    </button>
  );
  const launch = (fn: () => void) => { setSheetOpen(false); fn(); };

  const activate = (groupMode: MobilePdfMode, tool: MobilePdfTool) => {
    setSheetOpen(false);
    setMode(groupMode);
    if (tool.measureMode) {
      if (tool.measureMode !== "calibrate") setMeasureSelection(tool.measureMode);
      window.dispatchEvent(new CustomEvent("tpdf:mobile-measure-mode", {
        detail: { mode: tool.measureMode },
      }));
      if (tool.measureMode !== "calibrate") onToolChange("measure");
      return;
    }
    const needsCustomToolExit = activeTool === "edit-content" || activeTool === "measure";
    if (needsCustomToolExit) onToolChange("select");
    const run = () => {
      if (groupMode !== mode) switchMobilePdfMode(groupMode);
      if (tool.command) runMobilePdfCommand(tool.command);
    };
    // Let React finish leaving the custom editor before arming a native tool:
    // otherwise the outgoing tool's cleanup can cancel the just-selected shape.
    if (needsCustomToolExit) window.requestAnimationFrame(run);
    else run();
  };

  return (
    <nav className="tpdf-mobile-dock" data-tpdf-region="mobile-dock" aria-label="Mobile PDF actions">
      <div className="tpdf-mobile-dock-status">
        <button type="button" className="tpdf-mobile-page-action" onClick={onShowPages}
          aria-label="Choose page">Page {page} / {totalPages || "…"}</button>
        <span aria-label={`Zoom ${Math.round(zoom * 100)} percent`}>{Math.round(zoom * 100)}%</span>
      </div>
      <div className="tpdf-mobile-dock-row" role="toolbar" aria-label="Document actions">
        {activeTool === "edit-content"
          ? action("Done editing", "view", onDoneEditing)
          : action("Read", "view", () => {
            onToolChange("select");
            switchMobilePdfMode("view");
            setMode("view");
          }, activeTool === "select" && mode === "view")}
        {action("Undo", "undo", onUndo)}
        {action("Redo", "redo", onRedo)}
        {action("Tools", "tools", () => setSheetOpen(true))}
        {action("Save", "save", onSave)}
      </div>
      {sheetOpen && (
        <div className="tpdf-mobile-tool-sheet-layer" data-tpdf-mobile-tools="open">
          <button type="button" className="tpdf-mobile-tool-sheet-backdrop"
            aria-label="Close PDF tools" onClick={() => setSheetOpen(false)} />
          <section className="tpdf-mobile-tool-sheet" role="dialog" aria-modal="true"
            aria-label="All PDF tools">
            <div className="tpdf-mobile-tool-sheet-heading">
              <div>
                <strong>PDF tools</strong>
                <p>Every group matches the scrollable PDF toolbar. Choose a tool and tap the page.</p>
              </div>
              <button type="button" className="tpdf-mobile-tool-sheet-close"
                aria-label="Close tools" onClick={() => setSheetOpen(false)}>×</button>
            </div>
            {MOBILE_PDF_GROUPS.map(group => (
              <section key={group.id} className="tpdf-mobile-tool-group"
                data-tpdf-tool-group={group.id} aria-label={group.label}>
                <h3>{group.label}</h3>
                <div className="tpdf-mobile-tool-sheet-grid">
                  {group.tools.map(tool => {
                    const disabled = Boolean(tool.command && availability[tool.command] === false);
                    const pressed = tool.measureMode
                      ? mode === "measure" && activeTool === "measure" && tool.measureMode === measureSelection
                      : Boolean(tool.command && nativeCommand === tool.command);
                    return (
                      <button type="button" key={tool.id}
                        className="tpdf-mobile-tool-sheet-item"
                        data-tpdf-mobile-tool={tool.id}
                        disabled={disabled}
                        title={disabled ? "Not available in this PDF viewer" : tool.label}
                        aria-pressed={pressed} onClick={() => activate(group.id, tool)}>
                        <TpdfIcon name={tool.icon} size={22} />
                        <span>{tool.label}</span>
                      </button>
                    );
                  })}
                </div>
              </section>
            ))}
            <section className="tpdf-mobile-tool-group" aria-label="Document tools">
              <h3>Document tools</h3>
              <div className="tpdf-mobile-tool-sheet-extras">
                {action("Edit PDF text", "edit", () => launch(() => onToolChange("edit-content")))}
                {action("Find a tool", "search", () => launch(onFindCommands))}
                {action("Document info", "page", () => launch(onShowInfo))}
                {action("AI assistant", "tools", () => launch(onShowAi))}
                {action(isPublic ? "Find document tools" : "All document tools", "tools", () => launch(onShowTools))}
                {action("Save PDF", "save", () => launch(onSave))}
              </div>
            </section>
          </section>
        </div>
      )}
    </nav>
  );
}
