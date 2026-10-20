import type { PdfRegion } from "./types.js";

// P1 wire format: all coordinates in unrotated PDF-page percentage (origin top-left).
export type P1Point = { x: number; y: number };
export type P1Quad = [P1Point, P1Point, P1Point, P1Point];
export type P1Style = {
  strokeColor: string; fillColor: string; opacity: number;
  strokeWidthPt: number; fontSizePt: number;
};
export const DEFAULT_P1_STYLE: P1Style = {
  strokeColor: "#dd3149", fillColor: "#ffdc45", opacity: 0.65,
  strokeWidthPt: 2, fontSizePt: 12,
};
export type P1TextMarkup = "highlight" | "underline" | "strikeout" | "squiggly";
export type P1TextType = "addText" | "insertText" | "callout";
export type P1Stroke = "inkHighlight";
export type P1Shape = "rectangle" | "circle" | "line" | "arrow" | "polygon" | "polyline";
export type P1Asset = "stamp" | "image" | "signature";
export type P1Tool = P1TextMarkup | P1TextType | P1Stroke | P1Shape | P1Asset;
type Base = { schemaVersion: 1; region: PdfRegion; style: P1Style };
export type P1Mark =
  | (Base & { type: P1TextMarkup; quads: P1Quad[] })
  | (Base & { type: P1Stroke; paths: P1Point[][] })
  | (Base & { type: P1TextType; text: string; anchor?: P1Point })
  | (Base & { type: "rectangle" | "circle" })
  | (Base & { type: "line" | "arrow" | "polygon" | "polyline";
    points: P1Point[]; arrowEnd?: "none" | "start" | "end" | "both" })
  | (Base & { type: P1Asset; assetId: string });
export const TEXT_MARKUP: ReadonlyArray<P1TextMarkup> = ["highlight", "underline", "strikeout", "squiggly"];
export const TEXT_TOOL: ReadonlyArray<P1TextType> = ["addText", "insertText", "callout"];
export const ASSET_TOOL: ReadonlyArray<P1Asset> = ["stamp", "image", "signature"];
export const P1_TOOLS: ReadonlyArray<P1Tool> = [
  ...TEXT_MARKUP, ...TEXT_TOOL, "inkHighlight", "rectangle", "circle",
  "line", "arrow", "polygon", "polyline", ...ASSET_TOOL,
];
