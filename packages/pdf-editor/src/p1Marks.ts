import { validRegion } from "./history.js";
import type { PdfRegion } from "./types.js";
import { ASSET_TOOL, TEXT_MARKUP, TEXT_TOOL, type P1Mark, type P1Point,
  type P1Quad, type P1Style, type P1Tool } from "./p1Types.js";

export type P1Input = { tool: P1Tool; region: PdfRegion; style: P1Style;
  path?: P1Point[]; text?: string; quads?: P1Quad[]; assetId?: string };
export function validStyle(style: P1Style): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(style.strokeColor) &&
    /^#[0-9a-fA-F]{6}$/.test(style.fillColor) &&
    Number.isFinite(style.opacity) && style.opacity >= 0 && style.opacity <= 1 &&
    Number.isFinite(style.strokeWidthPt) && style.strokeWidthPt > 0 && style.strokeWidthPt <= 72 &&
    Number.isFinite(style.fontSizePt) && style.fontSizePt > 0 && style.fontSizePt <= 200;
}
export function validPoint(value: P1Point): boolean {
  return Number.isFinite(value?.x) && Number.isFinite(value?.y) &&
    value.x >= 0 && value.x <= 100 && value.y >= 0 && value.y <= 100;
}
export function buildP1Mark(input: P1Input): P1Mark {
  const { tool, region, style } = input;
  if (!validRegion(region, Number.MAX_SAFE_INTEGER) || !validStyle(style))
    throw Error("Invalid P1 mark region or style");
  const base = { schemaVersion: 1 as const, region, style: { ...style } };
  if (TEXT_MARKUP.includes(tool as typeof TEXT_MARKUP[number])) {
    if (!input.quads?.length || input.quads.some((quad) =>
      quad.length !== 4 || quad.some((point) => !validPoint(point))))
      throw Error("Accurate text quads are required; do not approximate from a rectangle");
    return { ...base, type: tool as typeof TEXT_MARKUP[number],
      quads: input.quads.map((quad) => quad.map((p) => ({ ...p })) as P1Quad) };
  }
  if (TEXT_TOOL.includes(tool as typeof TEXT_TOOL[number])) {
    if (!input.text?.trim() || input.text.length > 2000) throw Error("Text is required (max 2000 chars)");
    return { ...base, type: tool as typeof TEXT_TOOL[number], text: input.text,
      ...(tool === "callout" ? { anchor: input.path?.[0] || { x: region.x, y: region.y } } : {}) };
  }
  if (ASSET_TOOL.includes(tool as typeof ASSET_TOOL[number])) {
    if (!input.assetId?.trim() || input.assetId.length > 256)
      throw Error("Host assetId is required (max 256 chars)");
    return { ...base, type: tool as typeof ASSET_TOOL[number], assetId: input.assetId };
  }
  const path = input.path || [];
  if (tool === "inkHighlight") {
    if (path.length < 2 || !path.every(validPoint)) throw Error("Ink paths need >=2 points");
    return { ...base, type: tool, paths: [path.map((point) => ({ ...point }))] };
  }
  if (tool === "rectangle" || tool === "circle") return { ...base, type: tool };
  if (tool === "line" || tool === "arrow" || tool === "polygon" || tool === "polyline") {
    const min = tool === "polygon" ? 3 : 2;
    if (path.length < min || !path.every(validPoint)) throw Error("Not enough vertices");
    return { ...base, type: tool, points: path.map((point) => ({ ...point })),
      ...(tool === "arrow" ? { arrowEnd: "end" as const } : {}) };
  }
  throw Error("Unsupported P1 mark type");
}
