import type { SVGProps } from "react";
import {
  Activity, ArrowRight, ArrowUpRight, Braces,
  Circle, ChevronDown, ChevronRight, ClipboardList, Columns2, Copy, Crosshair, Crop,
  Download, Droplets, Ellipsis, ExternalLink, Eye, File, FileCode,
  FileImage, FilePlus, FileSpreadsheet, FileText,
  FileType2, Files, FolderOpen, FormInput, GitCompare, GitMerge, Hand, Hash,
  Heading, Highlighter, Image, Link, List, ListFilter, ListOrdered,
  LockKeyhole, Maximize2, MessageSquareText, Minimize2, Moon, MousePointer2, MoveHorizontal,
  PanelBottom, Palette, Pencil, Pentagon, Plus, Presentation,
  Radio, Redo2, RectangleHorizontal, RotateCcw, RotateCw, Route, Ruler, Save,
  Scan, ScanText, Scissors, Search, ShieldBan, ShieldCheck, Signature, Sparkles,
  SquareCheckBig, Stamp, Strikethrough, Sun, TextCursorInput, Trash2, Type, Underline,
  Undo2, UnlockKeyhole, Waves, Wrench, X, ZoomIn, ZoomOut,
} from "lucide-react";

export type TpdfIconName =
  | "advanced" | "area" | "arrow" | "bates" | "calibrate" | "chevron-down"
  | "chevron-right" | "circle" | "checkbox" | "close" | "compare" | "compress"
  | "copy" | "crop" | "draw" | "dropdown" | "edit" | "export" | "external"
  | "file" | "file-excel" | "file-html" | "file-image" | "file-pdfa" | "file-pdf"
  | "file-presentation" | "file-rtf" | "file-text" | "file-word" | "file-xml"
  | "fill" | "fit-page" | "fit-width" | "folder-open" | "form" | "hash"
  | "header" | "highlight" | "image" | "insert" | "line" | "link" | "listbox"
  | "lock" | "measure" | "merge" | "moon" | "more-horizontal" | "note" | "ocr"
  | "page" | "page-bottom" | "palette" | "pan" | "perimeter" | "pointer" | "plus" | "polygon"
  | "polyline" | "radio" | "redo" | "redact" | "rectangle" | "rotate-left"
  | "rotate-right" | "save" | "search" | "signature" | "sparkles" | "split"
  | "squiggly" | "stamp" | "strikethrough" | "sun" | "text" | "text-field"
  | "tools" | "trash" | "undo" | "underline" | "unlock" | "view" | "watermark"
  | "zoom-in" | "zoom-out";

const icons = {
  advanced: Columns2, area: Maximize2, arrow: ArrowUpRight, bates: ListOrdered,
  calibrate: Crosshair, "chevron-down": ChevronDown, "chevron-right": ChevronRight,
  circle: Circle, checkbox: SquareCheckBig, close: X, compare: GitCompare,
  compress: Minimize2, copy: Copy, crop: Crop, draw: Pencil, dropdown: ListFilter,
  edit: Pencil, export: Download, external: ExternalLink, file: File,
  "file-excel": FileSpreadsheet, "file-html": FileCode, "file-image": FileImage,
  "file-pdfa": ShieldCheck, "file-pdf": FileText, "file-presentation": Presentation,
  "file-rtf": FileType2, "file-text": FileText, "file-word": FileType2,
  "file-xml": Braces, fill: FormInput, "fit-page": Scan, "fit-width": MoveHorizontal,
  "folder-open": FolderOpen, form: ClipboardList, hash: Hash, header: Heading,
  highlight: Highlighter, image: Image, insert: FilePlus, line: ArrowRight, link: Link,
  listbox: List, lock: LockKeyhole, measure: Ruler, merge: GitMerge, moon: Moon,
  "more-horizontal": Ellipsis, note: MessageSquareText, ocr: ScanText, page: Files,
  "page-bottom": PanelBottom, palette: Palette, pan: Hand, perimeter: Route, plus: Plus,
  pointer: MousePointer2, polygon: Pentagon, polyline: Activity, radio: Radio, redo: Redo2, redact: ShieldBan,
  rectangle: RectangleHorizontal, "rotate-left": RotateCcw, "rotate-right": RotateCw,
  save: Save, search: Search, signature: Signature, sparkles: Sparkles, split: Scissors,
  squiggly: Waves, stamp: Stamp, strikethrough: Strikethrough, sun: Sun, text: Type,
  "text-field": TextCursorInput, tools: Wrench, trash: Trash2, undo: Undo2,
  underline: Underline, unlock: UnlockKeyhole, view: Eye, watermark: Droplets,
  "zoom-in": ZoomIn, "zoom-out": ZoomOut,
} as const satisfies Record<TpdfIconName, typeof Eye>;

export function TpdfIcon({
  name,
  size = 18,
  strokeWidth = 1.8,
  className,
  ...props
}: {
  name: TpdfIconName;
  size?: number;
  strokeWidth?: number;
  className?: string;
} & Omit<SVGProps<SVGSVGElement>, "name" | "width" | "height" | "strokeWidth">) {
  const Icon = icons[name];
  return <Icon size={size} strokeWidth={strokeWidth} className={["tpdf-icon", className].filter(Boolean).join(" ")}
    aria-hidden="true" focusable="false" {...props} />;
}
