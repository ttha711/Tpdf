import type { PdfTool } from "./types.js";
import { ASSET_TOOL, TEXT_MARKUP, P1_TOOLS } from "./p1Types.js";
export type ShellTab = "view" | "annotate" | "shapes" | "insert" |
  "forms" | "redact" | "measure" | "all";
export const SHELL_TABS: ShellTab[] = ["view", "annotate", "shapes", "insert", "forms", "all"];
export const SHEET_GROUPS: ShellTab[] = [
  "view", "annotate", "shapes", "insert", "forms", "redact", "measure",
];
export type ShellBuiltin = { id: string; group: ShellTab; label: string; tool?: PdfTool;
  stage?: "p2" | "p3" };
const command = (id: string, group: ShellTab, label = id,
  stage?: "p2" | "p3"): ShellBuiltin => ({ id, group, label, stage,
    ...(!stage ? { tool: id as PdfTool } : {}) });
export const SHELL_BUILTINS: ShellBuiltin[] = [
  command("region", "shapes"), command("highlight", "annotate"),
  command("note", "annotate"), command("draw", "annotate"), command("cover", "annotate"),
  command("comment","annotate","comment","p2"),
  command("link","annotate","link","p2"),
  ...["underline","strikeout","squiggly","inkHighlight","addText","insertText","callout"]
    .map((id) => command(id, "annotate")),
  command("style","annotate", "Style"),
  ...["rectangle","circle","line","arrow","polygon","polyline"]
    .map((id) => command(id,"shapes")),
  command("shapeStyle","shapes", "Style"),
  ...["stamp","image","signature"].map((id) => command(id,"insert")),
  ...["textField","checkbox","radio","dropdown","listBox","fill"].map((id) =>
    command(id,"forms",id,"p2")),
  command("attachment", "insert", "Attachment", "p2"),
  ...["redact","applyRedact","replaceText"].map((id) => command(id,"redact",id,"p3")),
  ...["distance","perimeter","area","calibrate"].map((id) =>
    command(id,"measure",id,"p3")),
  { id: "pages", group: "view", label: "pages" },
  { id: "fit", group: "view", label: "fit" },
  ...[25,50,100,200,400,800].map((percent) => ({
    id: "zoom" + percent, group: "view" as const, label: percent + "%",
  })),
  ...["rotate","delete","moveUp","moveDown"].map((id) => ({ id, group: "view" as const, label: id })),
  { id: "insert", group: "insert", label: "insert" },
  { id: "form", group: "forms", label: "form" },
];
export function enabledBuiltin(item: ShellBuiltin, canEdit: boolean, canForms: boolean,
  canText = false, canAsset = false, canP1 = false,
  canP2 = false, canFill = false, canAttachment = false): boolean {
  if (item.stage === "p3") return false;
  if (item.stage === "p2") {
    if (!canP2) return false;
    if (item.id === "radio" || item.id === "comment") return false;
    if (item.id === "fill") return canFill;
    if (item.id === "attachment") return canAttachment;
    return ["textField","checkbox","dropdown","listBox","link"].includes(item.id);
  }
  if (item.id === "pages" || item.id === "fit" || item.id === "region" ||
      item.id.startsWith("zoom")) return true;
  if (item.id === "form") return canForms;
  if (item.id === "style" || item.id === "shapeStyle") return canEdit && canP1;
  if (item.id === "highlight") return canEdit;
  if (P1_TOOLS.includes(item.id as typeof P1_TOOLS[number]) && item.id !== "signature" &&
      !canP1) return false;
  if (TEXT_MARKUP.some((tool) => tool === item.id)) return canEdit && canText;
  if (item.id === "signature") return canEdit;
  if (ASSET_TOOL.some((tool) => tool === item.id)) return canEdit && canAsset;
  return canEdit;
}
export function visibleBuiltins(tab: ShellTab, canEdit: boolean, canForms: boolean,
  canText = false, canAsset = false, canP1 = false,
  canP2 = false, canFill = false, canAttachment = false) {
  return SHELL_BUILTINS.filter((item) => (tab === "all" || item.group === tab) &&
    enabledBuiltin(item, canEdit, canForms, canText, canAsset, canP1,
      canP2, canFill, canAttachment));
}
export const APP_WORDS = {
  vi: { view: "Xem", annotate: "Chú thích", shapes: "Hình dạng", insertTab: "Chèn",
    formsTab: "Biểu mẫu", allTools: "Tất cả công cụ", tools: "Công cụ", read: "Đọc",
    saved: "Đã lưu", unsaved: "Chưa lưu", lightweight: "Trình xem nhẹ",
    comments: "Bình luận", close: "Đóng", page: "Trang", mode: "Chế độ",
    redact: "Che dữ liệu", measure: "Đo", soon: "Sắp có" },
  en: { view: "View", annotate: "Annotate", shapes: "Shapes", insertTab: "Insert",
    formsTab: "Form", allTools: "All tools", tools: "Tools", read: "Read",
    saved: "Saved", unsaved: "Unsaved", lightweight: "Lightweight viewer",
    comments: "Comments", close: "Close", page: "Page", mode: "Mode",
    redact: "Redact", measure: "Measure", soon: "Coming soon" },
};
export const TAB_TEXT: Record<ShellTab, keyof typeof APP_WORDS.en> = {
  view: "view", annotate: "annotate", shapes: "shapes", insert: "insertTab",
  forms: "formsTab", redact: "redact", measure: "measure", all: "allTools",
};
