import type { ReactNode } from "react";
import type { P1Asset, P1Quad, P1Tool } from "./p1Types.js";
import type { P2FieldInventory, P2FormCapabilities } from "./p2Types.js";
import type { P3Capabilities, P3CalibrationInventory, P3MatchCount, P3Scope, P3Tool } from "./p3Types.js";
export type PdfSource = { url: string; name: string; size?: number } |
  { bytes: Uint8Array; name: string };
export type PdfSaveInfo = { name: string; baseVersionId?: string };
export type PdfVersion = { versionId: string; name: string; createdAt: string };
export type PdfSaved = { versionId: string; name: string; notes?: string[] };
export type PdfRegion = { page: number; x: number; y: number; width: number; height: number; note: string };
export type PdfSearchHit = { page: number; snippet: string; score: number };
export type PdfEditorError = { code: string; message: string; retryable: boolean };
export type PdfTileLevel = 0.25 | 0.5 | 1 | 2 | 4 | 8 | 16;
export type PdfTileMeta = { versionId: string; pages: Array<{ width: number; height: number }> };
export type PdfTileAdapter = { meta(): Promise<PdfTileMeta>; tileUrl(page: number, level: PdfTileLevel, x: number, y: number): string };
export type PdfChangeRequest = import("./history.js").PdfChange;
export type PdfOpenDocument = { id:string;name:string;page:number;pages:number };
export type PdfHostTool = { id: string; label: string; group: string;
  icon?: ReactNode; run(context: { page: number; selection?: PdfRegion }): void | Promise<void> };
export interface TpdfPdfAdapter {
  tiles?: PdfTileAdapter;
  loadDocument(): Promise<PdfSource>;
  saveVersion?(bytes: Uint8Array, info: PdfSaveInfo): Promise<PdfSaved>;
  applyChanges?(changes: PdfChangeRequest[], info: PdfSaveInfo): Promise<PdfSaved>;
  listVersions?(): Promise<PdfVersion[]>;
  runOcr?(options: { bytes: Uint8Array; name: string }): Promise<{ bytes: Uint8Array }>;
  searchPages?(query: string): Promise<PdfSearchHit[]>;
  resolveTextQuads?(page: number, region: PdfRegion): Promise<P1Quad[]>;
  selectAsset?(kind: P1Asset): Promise<{ assetId: string } | null>;
  assetUrl?(assetId: string): string;
  formCapabilities?: P2FormCapabilities;
  listFormFields?(): Promise<P2FieldInventory>;
  selectAttachment?(): Promise<{ assetId: string; size?: number } | null>;
  p3Capabilities?: P3Capabilities;
  listPageCalibrations?(): Promise<P3CalibrationInventory>;
  countTextMatches?(query: { search:string; caseSensitive?:boolean; scope:P3Scope }): Promise<P3MatchCount>;
  /** Optional host bookmarks for tilesOnly (never loads PDF.js in that mode). */
  listBookmarks?(): Promise<Array<{ title:string; page:number }>>;
}
export type PdfTool = "region" | "highlight" | "note" | "draw" | "cover" | "signature" | P1Tool | "textField" | "checkbox" | "radio" | "dropdown" | "listBox" |
  "fill" | "link" | "attachment" | P3Tool;
export type PdfAssets = { pdfiumWasmUrl?: string; workerUrl: string };
export type PdfEditorMessages = Partial<Record<
  "save" | "search" | "pages" | "fit" | "undo" | "redo" | "open" | "loading" | "error" |
  "annotation" | "region" | "highlight" | "note" | "draw" | "cover" |
  "signature" | "rotate" | "delete" | "insert" | "moveUp" | "moveDown" |
  "ocr" | "form" | "versions" | "ready" | "readOnly" | "saved" | "unsaved" |
  "view" | "annotate" | "shapes" | "allTools" | "tools" | "read" | "comments" |
  "insertTab" | "formsTab" | "lightweight" | "close" | "page" | "mode" |
  "redact" | "measure" | "soon" | P1Tool | P3Tool, string>>;
export type TpdfPdfEditorProps = {
  adapter: TpdfPdfAdapter;
  assets: PdfAssets;
  readOnly?: boolean;
  shell?: "classic" | "app";
  tools?: PdfHostTool[];
  openDocuments?:PdfOpenDocument[];activeDocumentId?:string;
  onOpenDocument?:(id:string)=>void;onCloseDocument?:(id:string)=>void;
  onOpenFile?:()=>void;onHome?:()=>void;showHomeButton?:boolean;
  tilesOnly?: boolean;
  renderMode?: "auto" | "canvas" | "tiles";
  largeFileBytes?: number;
  theme?: "light" | "dark" | "system";
  locale?: "vi" | "en";
  messages?: PdfEditorMessages;
  density?: "office" | "standalone";
  onDirtyChange?: (dirty: boolean) => void;
  onSaved?: (info: PdfSaved) => void;
  onRegionSelected?: (region: PdfRegion) => void;
  onPageChange?: (page: number) => void;
  onError?: (error: PdfEditorError) => void;
  className?: string;
  children?: ReactNode;
};
export interface TpdfPdfEditorHandle {
  save(): Promise<void>;
  goToPage(page: number): void;
  setZoom(value: number | "fit"): void;
  highlightRegion(region: PdfRegion): void;
  undo(): void;
  redo(): void;
}
