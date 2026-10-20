import type { ReactNode } from "react";
export type PdfSource = { url: string; name: string; size?: number } |
  { bytes: Uint8Array; name: string };
export type PdfSaveInfo = { name: string; baseVersionId?: string };
export type PdfVersion = { versionId: string; name: string; createdAt: string };
export type PdfSaved = { versionId: string; name: string };
export type PdfRegion = { page: number; x: number; y: number; width: number; height: number; note: string };
export type PdfSearchHit = { page: number; snippet: string; score: number };
export type PdfEditorError = { code: string; message: string; retryable: boolean };
export type PdfTileLevel = 0.25 | 0.5 | 1 | 2 | 4 | 8 | 16;
export type PdfTileMeta = { versionId: string; pages: Array<{ width: number; height: number }> };
export type PdfTileAdapter = { meta(): Promise<PdfTileMeta>; tileUrl(page: number, level: PdfTileLevel, x: number, y: number): string };
export type PdfChangeRequest = import("./history.js").PdfChange;
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
}
export type PdfTool = "region" | "highlight" | "note" | "draw" | "cover" | "signature";
export type PdfAssets = { pdfiumWasmUrl?: string; workerUrl: string };
export type PdfEditorMessages = Partial<Record<
  "save" | "search" | "pages" | "fit" | "undo" | "redo" | "open" | "loading" | "error" |
  "annotation" | "region" | "highlight" | "note" | "draw" | "cover" |
  "signature" | "rotate" | "delete" | "insert" | "moveUp" | "moveDown" |
  "ocr" | "form" | "versions" | "ready" | "readOnly" | "saved" | "unsaved" |
  "view" | "annotate" | "shapes" | "allTools" | "tools" | "read" | "comments" |
  "insertTab" | "formsTab" | "lightweight" | "close" | "page" | "mode", string>>;
export type TpdfPdfEditorProps = {
  adapter: TpdfPdfAdapter;
  assets: PdfAssets;
  readOnly?: boolean;
  shell?: "classic" | "app";
  tools?: PdfHostTool[];
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
