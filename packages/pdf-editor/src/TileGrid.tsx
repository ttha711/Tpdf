import { useEffect, useMemo, useState } from "react";
import { TILE_SIZE, type Tile } from "./tiles.js";
import type { TileScheduler } from "./tileScheduler.js";
import { useTileScheduler } from "./useTileScheduler.js";
import type { PdfTileAdapter, PdfTileMeta } from "./types.js";

function Thumb({ page, width, height, tiles, scheduler, tick }: {
  page: number; width: number; height: number; tiles: Tile[];
  scheduler: TileScheduler; tick: number;
}) {
  const [node, setNode] = useState<HTMLCanvasElement | null>(null);
  useEffect(() => {
    if (!node) return;
    let cancelled = false;
    const ctx = node.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, node.width, node.height);
    for (const tile of tiles) {
      const url = scheduler.get(tile.key);
      if (!url) continue;
      const image = new Image();
      image.onload = () => {
        if (cancelled) return;
        ctx.drawImage(image, tile.left / width * node.width, tile.top / height * node.height,
          tile.width / width * node.width, tile.height / height * node.height);
      };
      image.src = url;
    }
    return () => { cancelled = true; };
  }, [node, tiles, scheduler, tick, width, height]);
  return <canvas ref={setNode} aria-hidden="true" data-tpdf-thumbnail={page + 1}
    width={100} height={Math.max(1, Math.round(100 * height / width))}
    style={{ display: "block", margin: "0 auto 5px", width: "100%", maxWidth: 100,
      aspectRatio: width + "/" + height, background: "#fff" }} />;
}

export function TileGrid({ adapter, meta, parent, currentPage, onGoto, pageNumbers }: {
  adapter: PdfTileAdapter; meta: PdfTileMeta; parent: HTMLElement | null;
  currentPage: number; onGoto: (page: number) => void;
  pageNumbers?: number[];
}) {
  const [visible, setVisible] = useState<number[]>([]);
  useEffect(() => {
    if (!parent) return;
    const observer = new IntersectionObserver((entries) => {
      setVisible((before) => {
        const next = new Set(before);
        for (const entry of entries) {
          const index = Number((entry.target as HTMLElement).dataset.tpdfThumbPage);
          if (entry.isIntersecting) next.add(index); else next.delete(index);
        }
        return [...next];
      });
    }, { root: parent, rootMargin: "250px 0px" });
    parent.querySelectorAll("[data-tpdf-thumb-page]").forEach((item) => observer.observe(item));
    return () => observer.disconnect();
  }, [parent, meta.versionId]);
  const wanted = useMemo(() => {
    const result: Tile[] = [];
    for (const page of visible) {
      const p = meta.pages[page], level = 0.25, span = TILE_SIZE / level;
      for (let y = 0; y < Math.ceil(p.height / span); y++) {
        for (let x = 0; x < Math.ceil(p.width / span); x++) {
          const left = x * span, top = y * span;
          result.push({ page, level, x, y, left, top,
            width: Math.min(span, p.width - left), height: Math.min(span, p.height - top),
            priority: Math.abs(page + 1 - currentPage) * 10000 + x * x + y * y,
            key: [meta.versionId, page, level, x, y].join(":"),
            url: adapter.tileUrl(page, level, x, y) });
        }
      }
    }
    return result.sort((a, b) => a.priority - b.priority).slice(0, 96);
  }, [visible, meta, adapter, currentPage]);
  const { scheduler, revision } = useTileScheduler(adapter, meta.versionId, wanted);
  void revision;
  return <div className="tpdf-page-grid" data-tpdf-thumbnail-count={visible.length}
    data-tpdf-thumbnail-active={scheduler?.active ?? 0}>
    {meta.pages.map((p, i) => ({p,i})).filter(({i}) =>
      !pageNumbers || pageNumbers.includes(i+1)).map(({p,i}) => <button key={i} type="button"
      data-tpdf-thumb-page={i} onClick={() => onGoto(i + 1)}
      aria-label={"Open page " + (i + 1)} style={{ padding: 7, minWidth: 0 }}>
      {visible.includes(i) && scheduler && <Thumb page={i} width={p.width} height={p.height}
        tiles={wanted.filter((t) => t.page === i)} scheduler={scheduler} tick={revision} />}
      <span>{i + 1}</span>
    </button>)}
  </div>;
}
