import type { PdfTool } from "./types.js";
export type ShellTab = "view" | "annotate" | "shapes" | "insert" | "forms" | "all";
export const SHELL_TABS: ShellTab[] = ["view", "annotate", "shapes", "insert", "forms", "all"];
export type ShellBuiltin = { id: string; group: ShellTab; label: string; tool?: PdfTool };
export const SHELL_BUILTINS: ShellBuiltin[] = [
  { id: "region", group: "shapes", label: "region", tool: "region" },
  { id: "highlight", group: "annotate", label: "highlight", tool: "highlight" },
  { id: "note", group: "annotate", label: "note", tool: "note" },
  { id: "draw", group: "annotate", label: "draw", tool: "draw" },
  { id: "cover", group: "annotate", label: "cover", tool: "cover" },
  { id: "signature", group: "insert", label: "signature", tool: "signature" },
  { id: "pages", group: "view", label: "pages" },
  { id: "fit", group: "view", label: "fit" },
  { id: "rotate", group: "view", label: "rotate" },
  { id: "delete", group: "view", label: "delete" },
  { id: "moveUp", group: "view", label: "moveUp" },
  { id: "moveDown", group: "view", label: "moveDown" },
  { id: "insert", group: "insert", label: "insert" },
  { id: "form", group: "forms", label: "form" },
];
export function visibleBuiltins(tab: ShellTab, canEdit: boolean, canForms: boolean) {
  return SHELL_BUILTINS.filter((item) => (tab === "all" || item.group === tab) &&
    (item.id === "region" || item.id === "pages" || item.id === "fit" ||
      (item.id === "form" ? canForms : canEdit)));
}
export const APP_WORDS = {
  vi: { view: "Xem", annotate: "Chú thích", shapes: "Hình dạng", insertTab: "Chèn",
    formsTab: "Biểu mẫu", allTools: "Tất cả công cụ", tools: "Công cụ", read: "Đọc",
    saved: "Đã lưu", unsaved: "Chưa lưu", lightweight: "Trình xem nhẹ",
    comments: "Bình luận", close: "Đóng", page: "Trang", mode: "Chế độ" },
  en: { view: "View", annotate: "Annotate", shapes: "Shapes", insertTab: "Insert",
    formsTab: "Forms", allTools: "All tools", tools: "Tools", read: "Read",
    saved: "Saved", unsaved: "Unsaved", lightweight: "Lightweight viewer",
    comments: "Comments", close: "Close", page: "Page", mode: "Mode" },
};
export const TAB_TEXT: Record<ShellTab, keyof typeof APP_WORDS.en> = {
  view: "view", annotate: "annotate", shapes: "shapes", insert: "insertTab",
  forms: "formsTab", all: "allTools",
};
