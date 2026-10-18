import { useEffect, useState } from "react";
import type { ActiveTool } from "../lib/app-types";
import { TpdfIcon, type TpdfIconName } from "./TpdfIcon";

type MobileTool = { id: ActiveTool; label: string; icon: TpdfIconName };
const MOBILE_TOOLS: MobileTool[] = [
  { id: "highlight", label: "Highlight", icon: "highlight" },
  { id: "text", label: "Add text", icon: "text" },
  { id: "draw", label: "Draw", icon: "draw" },
  { id: "shape", label: "Rectangle", icon: "rectangle" },
  { id: "note", label: "Comment", icon: "note" },
  { id: "signature", label: "Signature", icon: "signature" },
  { id: "measure", label: "Measure", icon: "measure" },
  { id: "redact", label: "Redact", icon: "redact" },
];

type Props = {
  activeTool: ActiveTool;
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
  activeTool, onToolChange, onDoneEditing, onUndo, onRedo, onSave,
  onFindCommands, onShowTools, onShowInfo, onShowAi, isPublic,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const contentEdit = activeTool === "edit-content";

  useEffect(() => {
    if (activeTool !== "select") setEditing(true);
  }, [activeTool]);

  useEffect(() => {
    if (!sheetOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSheetOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sheetOpen]);

  const activate = (tool: ActiveTool) => {
    onToolChange(tool);
    setEditing(tool !== "select");
    setSheetOpen(false);
  };
  const secondary = (label: string, icon: TpdfIconName, action: () => void, pressed = false) => (
    <button type="button" key={label} className="tpdf-mobile-dock-action"
      aria-label={label} title={label} aria-pressed={pressed}
      onClick={action}>
      <TpdfIcon name={icon} size={20} />
      <span>{label}</span>
    </button>
  );
  const launch = (action: () => void) => { setSheetOpen(false); action(); };

  return (
    <nav className="tpdf-mobile-dock" data-tpdf-region="mobile-dock" aria-label="Mobile PDF actions">
      {contentEdit ? (
        <div className="tpdf-mobile-dock-row">
          {secondary("Done editing", "view", onDoneEditing)}
          {secondary("Undo", "undo", onUndo)}
          {secondary("Redo", "redo", onRedo)}
          {secondary("Save", "save", onSave)}
          {secondary("Tools", "tools", () => setSheetOpen(true))}
        </div>
      ) : (
        <>
          {editing && (
            <div className="tpdf-mobile-dock-row tpdf-mobile-dock-row--tools" role="toolbar" aria-label="Annotation tools">
              {MOBILE_TOOLS.slice(0, 4).map((tool) => secondary(
                tool.label, tool.icon, () => activate(tool.id), activeTool === tool.id,
              ))}
              {secondary("More", "tools", () => setSheetOpen(true))}
            </div>
          )}
          <div className="tpdf-mobile-dock-row" role="toolbar" aria-label="Document actions">
            {secondary("Read", "view", () => activate("select"), !editing)}
            {secondary("Annotate", "highlight", () => {
              setEditing((value) => !value);
              onToolChange("select");
            }, editing)}
            {secondary("Undo", "undo", onUndo)}
            {secondary("Redo", "redo", onRedo)}
            {secondary("Tools", "tools", () => setSheetOpen(true))}
          </div>
        </>
      )}
      {sheetOpen && (
        <div className="tpdf-mobile-tool-sheet-layer" data-tpdf-mobile-tools="open">
          <button type="button" className="tpdf-mobile-tool-sheet-backdrop"
            aria-label="Close PDF tools" onClick={() => setSheetOpen(false)} />
          <section className="tpdf-mobile-tool-sheet" role="dialog" aria-modal="true"
            aria-label="All PDF tools">
            <div className="tpdf-mobile-tool-sheet-heading">
              <div>
                <strong>PDF tools</strong>
                <p>Select a tool, then tap the PDF. Use Read to scroll without drawing.</p>
              </div>
              <button type="button" className="tpdf-mobile-tool-sheet-close"
                aria-label="Close tools" onClick={() => setSheetOpen(false)}>×</button>
            </div>
            <div className="tpdf-mobile-tool-sheet-grid">
              {MOBILE_TOOLS.map((tool) => (
                <button type="button" key={tool.id}
                  className="tpdf-mobile-tool-sheet-item"
                  data-tpdf-mobile-tool={tool.id}
                  aria-pressed={activeTool === tool.id}
                  onClick={() => activate(tool.id)}>
                  <TpdfIcon name={tool.icon} size={22} />
                  <span>{tool.label}</span>
                </button>
              ))}
            </div>
            <div className="tpdf-mobile-tool-sheet-extras">
              {secondary("Edit PDF text", "edit", () => activate("edit-content"))}
              {secondary("Find a tool", "search", () => launch(onFindCommands))}
              
              {secondary("Document info", "page", () => launch(onShowInfo))}
              {secondary("AI assistant", "tools", () => launch(onShowAi))}
              {secondary(isPublic ? "Find document tools" : "All document tools", "tools",
                () => launch(onShowTools))}
              {secondary("Save PDF", "save", () => launch(onSave))}
            </div>
          </section>
        </div>
      )}
    </nav>
  );
}
