import type { ActiveTool } from "./app-types";
import type { TpdfIconName } from "../components/TpdfIcon";

export type MobilePdfMode = "view" | "annotate" | "shapes" | "insert" | "form" | "redact" | "measure";
export type MobilePdfTool = {
  id: string;
  label: string;
  icon: TpdfIconName;
  command?: string;
  appTool?: ActiveTool;
  measureMode?: "distance" | "perimeter" | "area" | "calibrate";
};
export type MobilePdfGroup = { id: MobilePdfMode; label: string; tools: readonly MobilePdfTool[] };

// Command ids are from the installed EmbedPDF 2.15.1 chrome, not newer upstream releases.
// A shared catalogue keeps native mode tools and the mobile sheet in sync.
export const MOBILE_PDF_GROUPS: readonly MobilePdfGroup[] = [
  { id: "view", label: "View", tools: [
    { id: "read", label: "Read / Select", icon: "view", command: "pointer:toggle", appTool: "select" },
    { id: "pan", label: "Pan", icon: "pan", command: "pan:toggle" },
    { id: "fit-width", label: "Fit width", icon: "fit-width", command: "zoom:fit-width" },
    { id: "fit-page", label: "Fit page", icon: "fit-page", command: "zoom:fit-page" },
    { id: "zoom-in", label: "Zoom in", icon: "zoom-in", command: "zoom:in" },
    { id: "zoom-out", label: "Zoom out", icon: "zoom-out", command: "zoom:out" },
    { id: "rotate-left", label: "Rotate left", icon: "rotate-left", command: "rotate:counter-clockwise" },
    { id: "rotate-right", label: "Rotate right", icon: "rotate-right", command: "rotate:clockwise" },
    { id: "search", label: "Search", icon: "search", command: "panel:toggle-search" },
    { id: "pages", label: "Pages", icon: "page", command: "panel:toggle-sidebar" },
    { id: "comments", label: "Comments", icon: "note", command: "panel:toggle-comment" },
  ] },
  { id: "annotate", label: "Annotate", tools: [
    { id: "note", label: "Comment", icon: "note", command: "annotation:add-comment", appTool: "note" },
    { id: "link", label: "Link", icon: "link", command: "annotation:add-link" },
    { id: "highlight", label: "Highlight", icon: "highlight", command: "annotation:add-highlight", appTool: "highlight" },
    { id: "strikeout", label: "Strikeout", icon: "strikethrough", command: "annotation:add-strikeout" },
    { id: "underline", label: "Underline", icon: "underline", command: "annotation:add-underline" },
    { id: "squiggly", label: "Squiggly", icon: "squiggly", command: "annotation:add-squiggly" },
    { id: "ink", label: "Draw", icon: "draw", command: "annotation:add-ink", appTool: "draw" },
    { id: "ink-highlight", label: "Ink highlight", icon: "highlight", command: "annotation:add-ink-highlighter" },
    { id: "text", label: "Add text", icon: "text-field", command: "annotation:add-text", appTool: "text" },
    { id: "insert-text", label: "Insert text", icon: "file-text", command: "annotation:add-insert-text" },
    { id: "replace-text", label: "Replace text", icon: "edit", command: "annotation:add-replace-text" },
    { id: "callout", label: "Callout", icon: "note", command: "annotation:add-callout" },
    { id: "annotation-style", label: "Style", icon: "palette", command: "panel:toggle-annotation-style" },
  ] },
  { id: "shapes", label: "Shapes", tools: [
    { id: "rectangle", label: "Rectangle", icon: "rectangle", command: "annotation:add-rectangle", appTool: "shape" },
    { id: "circle", label: "Circle", icon: "circle", command: "annotation:add-circle" },
    { id: "line", label: "Line", icon: "line", command: "annotation:add-line" },
    { id: "arrow", label: "Arrow", icon: "arrow", command: "annotation:add-arrow" },
    { id: "polygon", label: "Polygon", icon: "polygon", command: "annotation:add-polygon" },
    { id: "polyline", label: "Polyline", icon: "polyline", command: "annotation:add-polyline" },
    { id: "shape-style", label: "Style", icon: "palette", command: "panel:toggle-annotation-style" },
  ] },
  { id: "insert", label: "Insert", tools: [
    { id: "stamp", label: "Stamp", icon: "stamp", command: "insert:add-rubber-stamp" },
    { id: "attachment", label: "Attachment", icon: "insert", command: "insert:add-attachment" },
    { id: "signature", label: "Signature", icon: "signature", command: "insert:add-signature", appTool: "signature" },
    { id: "image", label: "Image", icon: "file-image", command: "insert:add-image" },
    { id: "insert-style", label: "Style", icon: "palette", command: "panel:toggle-annotation-style" },
  ] },
  { id: "form", label: "Form", tools: [
    { id: "textfield", label: "Text field", icon: "text-field", command: "form:add-textfield" },
    { id: "checkbox", label: "Checkbox", icon: "checkbox", command: "form:add-checkbox" },
    { id: "radio", label: "Radio button", icon: "radio", command: "form:add-radio" },
    { id: "select", label: "Dropdown", icon: "dropdown", command: "form:add-select" },
    { id: "listbox", label: "List box", icon: "listbox", command: "form:add-listbox" },
    { id: "fill-mode", label: "Fill mode", icon: "fill", command: "form:toggle-fill-mode" },
    { id: "form-style", label: "Style", icon: "palette", command: "panel:toggle-annotation-style" },
  ] },
  { id: "redact", label: "Redact", tools: [
    { id: "redact", label: "Redact", icon: "redact", command: "redaction:redact", appTool: "redact" },
    { id: "redaction-panel", label: "Redaction panel", icon: "advanced", command: "panel:toggle-redaction" },
  ] },
  { id: "measure", label: "Measure", tools: [
    { id: "distance", label: "Distance", icon: "measure", appTool: "measure", measureMode: "distance" },
    { id: "perimeter", label: "Perimeter", icon: "perimeter", appTool: "measure", measureMode: "perimeter" },
    { id: "area", label: "Area", icon: "area", appTool: "measure", measureMode: "area" },
    { id: "calibrate", label: "Calibrate", icon: "calibrate", appTool: "measure", measureMode: "calibrate" },
  ] },
];

export function runMobilePdfCommand(command: string) {
  window.dispatchEvent(new CustomEvent("tpdf:embedpdf-command", { detail: { command } }));
}
export function switchMobilePdfMode(mode: MobilePdfMode) {
  if (mode !== "measure") runMobilePdfCommand(`mode:${mode}`);
}
