import type { PdfTileLevel, PdfTileMeta, PdfTileAdapter } from "./types.js";

export const TILE_SIZE = 512;
export const LEVELS: PdfTileLevel[] = [0.25, 0.5, 1, 2, 4, 8, 16];
export type Tile = { page: number; level: PdfTileLevel; x: number; y: number;
  left: number; top: number; width: number; height: number; priority: number; key: string; url: string };
export type PageBox = { width: number; height: number; top: number };

export function tileLevel(zoom: number, dpr: number): PdfTileLevel {
  return LEVELS.find((value) => value >= zoom * dpr) ?? 16;
}
export function validMeta(meta: PdfTileMeta): PdfTileMeta {
  if (!meta || !meta.versionId || !Array.isArray(meta.pages) || !meta.pages.length ||
      meta.pages.some((p) => !Number.isFinite(p.width) || p.width <= 0 ||
        !Number.isFinite(p.height) || p.height <= 0)) throw Error("Invalid tile metadata");
  return meta;
}
export function pageBoxes(meta: PdfTileMeta, zoom: number, gap = 16): PageBox[] {
  let top = 0;
  return meta.pages.map((p) => {
    const box = { width: p.width * zoom, height: p.height * zoom, top };
    top += box.height + gap;
    return box;
  });
}
export function wantedTiles(adapter: PdfTileAdapter, meta: PdfTileMeta, zoom: number,
  dpr: number, viewport: { left: number; top: number; width: number; height: number },
  max = 96, forcedLevel?: PdfTileLevel): Tile[] {
  const level = forcedLevel ?? tileLevel(zoom, dpr);
  const boxes = pageBoxes(meta, zoom);
  const contentWidth = Math.max(...boxes.map((p) => p.width), viewport.width);
  const centerX = viewport.left + viewport.width / 2;
  const centerY = viewport.top + viewport.height / 2;
  const output: Tile[] = [];
  boxes.forEach((box, page) => {
    if (box.top > viewport.top + viewport.height + TILE_SIZE / level * zoom ||
        box.top + box.height < viewport.top - TILE_SIZE / level * zoom) return;
    const p = meta.pages[page], span = TILE_SIZE / level;
    const x0 = Math.max(0, Math.floor((viewport.left - (contentWidth - box.width) / 2) / zoom / span) - 1);
    const x1 = Math.min(Math.ceil(p.width / span) - 1,
      Math.floor((viewport.left + viewport.width - (contentWidth - box.width) / 2) / zoom / span) + 1);
    const y0 = Math.max(0, Math.floor((viewport.top - box.top) / zoom / span) - 1);
    const y1 = Math.min(Math.ceil(p.height / span) - 1,
      Math.floor((viewport.top + viewport.height - box.top) / zoom / span) + 1);
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const left = x * span, top = y * span;
      const width = Math.min(span, p.width - left), height = Math.min(span, p.height - top);
      if (width <= 0 || height <= 0) continue;
      const cx = (contentWidth - box.width) / 2 + (left + width / 2) * zoom;
      const cy = box.top + (top + height / 2) * zoom;
      output.push({ page, level, x, y, left, top, width, height,
        priority: (cx - centerX) ** 2 + (cy - centerY) ** 2,
        key: [meta.versionId, page, level, x, y].join(":"), url: adapter.tileUrl(page, level, x, y) });
    }
  });
  return output.sort((a, b) => a.priority - b.priority).slice(0, max);
}
export function fallbackTile(target: Tile, level: PdfTileLevel, adapter: PdfTileAdapter,
  versionId: string): Tile {
  const x = Math.floor(target.left * level / TILE_SIZE);
  const y = Math.floor(target.top * level / TILE_SIZE);
  return { ...target, level, x, y, left: x * TILE_SIZE / level, top: y * TILE_SIZE / level,
    key: [versionId, target.page, level, x, y].join(":"),
    url: adapter.tileUrl(target.page, level, x, y) };
}
