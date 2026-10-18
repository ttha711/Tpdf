import type { ActiveTool } from "./app-types";
import type { TpdfIconName } from "../components/TpdfIcon";

export type MobilePdfMode = "view" | "annotate" | "shapes" | "insert" | "form" | "redact" | "measure";
export type MobilePdfTool = {
  id: string;
  label: string;
  icon: TpdfIconName;
  command?: string;
  appTool?: ActiveTool;
};

export type MobilePdfGroup = { id: MobilePdfMode; label: string; tools: readonly MobilePdfTool[] };
const tool = (id: string, label: string, icon: TpdfIconName, command?: string, appTool?: ActiveTool): MobilePdfTool =>
  ({ id, label, icon, command, appTool });

/** One catalogue powers the swipeable native-mode strip and grouped mobile tool grid. */
export const MOBILE_PDF_GROUPS: readonly MobilePdfGroup[] = [
  { id: "view", label: "View", tools: [
    tool("read", "Read / Select", "view", "tool:pointer", "select"),
    tool("pan", "Pan", "view", "tool:pan"),
    tool("fit-width", "Fit width", "fit-width", "zoom:fit-width"),
    tool("fit-page", "Fit page", "fit-page", "zoom:fit-page"),
    tool("zoom-in", "Zoom in", "zoom-in", "zoom:in"),
    tool("zoom-out", "Zoom out", "zoom-out", "zoom:out"),
    tool("rotate-left", "Rotate left", "rotate-left", "view:rotate-counterclockwise"),
    tool("rotate-right", "Rotate right", "rotate-right", "view:rotate-clockwise"),
    tool("search", "Search", "search", "panel:search"),
    tool("thumbnails", "Pages", "page", "panel:thumbnails"),
    tool("comments-panel", "Comments", "note", "panel:comments"),
  ] },
  { id: "annotate", label: "Annotate", tools: [
    tool("note", "Comment", "note", "tool:note", "note"),
    tool("link", "Link", "insert", "tool:link"),
    tool("highlight", "Highlight", "highlight", "tool:highlight", "highlight"),
    tool("strikeout", "Strikeout", "text", "tool:strikeout"),
    tool("underline", "Underline", "text", "tool:underline"),
    tool("squiggly", "Squiggly", "text", "tool:squiggly"),
    tool("ink", "Draw", "draw", "tool:ink", "draw"),
    tool("ink-highlight", "Ink highlight", "highlight", "tool:ink-highlight"),
    tool("free-text", "Add text", "text", "tool:free-text", "text"),
    tool("insert-text", "Insert text", "text", "tool:insert-text"),
    tool("replace-text", "Replace text", "edit", "tool:replace-text"),
    tool("callout", "Callout", "note", "tool:callout"),
    tool("annotation-style", "Style", "palette", "panel:style"),
  ] },
  { id: "shapes", label: "Shapes", tools: [
    tool("square", "Rectangle", "rectangle", "tool:square", "shape"),
    tool("circle", "Circle", "rectangle", "tool:circle"),
    tool("line", "Line", "draw", "tool:line"),
    tool("arrow", "Arrow", "draw", "tool:arrow"),
    tool("polygon", "Polygon", "rectangle", "tool:polygon"),
    tool("polyline", "Polyline", "draw", "tool:polyline"),
    tool("shape-style", "Style", "palette", "panel:style"),
  ] },
  { id: "insert", label: "Insert", tools: [
    tool("stamp", "Stamp", "image", "tool:stamp"),
    tool("attachment", "Attachment", "file", "tool:attachment"),
    tool("signature", "Signature", "signature", "tool:signature", "signature"),
    tool("image", "Image", "image", "tool:image"),
    tool("insert-style", "Style", "palette", "panel:style"),
  ] },
  { id: "form", label: "Form", tools: [
    tool("form-design", "Design fields", "form", "form:design"),
    tool("text-field", "Text field", "text", "tool:text-field"),
    tool("checkbox", "Checkbox", "form", "tool:checkbox"),
    tool("radio", "Radio button", "form", "tool:radio"),
    tool("combo-box", "Dropdown", "form", "tool:combo-box"),
    tool("list-box", "List box", "form", "tool:list-box"),
    tool("button", "Button", "form", "tool:button"),
    tool("signature-field", "Signature field", "signature", "tool:signature-field"),
    tool("form-style", "Style", "palette", "panel:style"),
  ] },
  { id: "redact", label: "Redact", tools: [
    tool("redact", "Redact", "redact", "tool:redact", "redact"),
    tool("redaction-panel", "Redaction panel", "redact", "panel:redaction"),
  ] },
  { id: "measure", label: "Measure", tools: [
    tool("distance", "Distance", "measure", "tool:distance", "measure"),
    tool("perimeter", "Perimeter", "measure", "tool:perimeter"),
    tool("area", "Area", "measure", "tool:area"),
    tool("calibrate", "Calibrate", "measure", "measurement:calibrate"),
  ] },
];

export const findMobilePdfTool = (id: string) =>
  MOBILE_PDF_GROUPS.flatMap(group => group.tools).find(tool => tool.id === id);

export function runMobilePdfCommand(command: string) {
  window.dispatchEvent(new CustomEvent("tpdf:embedpdf-command", { detail: { command } }));
}
export function switchMobilePdfMode(mode: MobilePdfMode) {
  runMobilePdfCommand(`mode:${mode}`);
}
