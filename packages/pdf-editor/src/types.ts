import type { ReactNode } from "react";
export type PdfSource = { url: string; name: string; size?: number } |
  { bytes: Uint8Array; name: string };
export type PdfSaveInfo = { name: string; baseVersionId?: string };
export type PdfVersion = { versionId: string; name: string; createdAt: string };
export type PdfSaved = { versionId: string; name: string; url?: string; size?: number };
export type PdfRegion = { page: number; x: number; y: number; width: number; height: number; note: string };
export type PdfSearchHit = { page: number; snippet: string; score: number };
export type PdfEditorError = { code: string; message: string; retryable: boolean };
export interface TpdfPdfAdapter {
  loadDocument(): Promise<PdfSource>;
  saveVersion(bytes: Uint8Array, info: PdfSaveInfo): Promise<PdfSaved>;
  listVersions?(): Promise<PdfVersion[]>;
  runOcr?(options: { bytes: Uint8Array; name: string }): Promise<{ bytes: Uint8Array }>;
  searchPages?(query: string): Promise<PdfSearchHit[]>;
  /** Host-side immutable-version save; does not transfer original PDF bytes. */
  applyChanges?(changes: import("./history.js").PdfChange[], info: PdfSaveInfo): Promise<PdfSaved>;
}
export type PdfTool = "region" | "highlight" | "note" | "draw" | "cover" | "signature";
export type PdfAssets = { pdfiumWasmUrl?: string; workerUrl: string };
export type PdfEditorMessages = Partial<Record<
  "save" | "search" | "pages" | "fit" | "undo" | "redo" | "open" | "loading" | "error" |
  "annotation" | "region" | "highlight" | "note" | "draw" | "cover" |
  "signature" | "rotate" | "delete" | "insert" | "moveUp" | "moveDown" |
  "ocr" | "form" | "versions" | "ready" | "readOnly", string>>;
export type TpdfPdfEditorProps = {
  adapter: TpdfPdfAdapter;
  assets: PdfAssets;
  readOnly?: boolean;
  /** Files above this threshold require adapter.applyChanges to save. Default 30 MiB. */
  largeFileBytes?: number;
  /** Upper bound for live page/thumbnail raster canvases. Default 6. */
  rasterCachePages?: number;
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
