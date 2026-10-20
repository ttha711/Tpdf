# PDF tile viewer adapter

## S2: Host-controlled tile viewer

`renderMode?: "auto" | "canvas" | "tiles"` defaults to `auto`.
In auto, the editor selects tiles if `adapter.tiles` exists and the known
PDF size exceeds `largeFileBytes` (default **30,000,000 bytes**) OR a page
would require more than **8,000,000 pixels** at `zoom * devicePixelRatio`.
Without `adapter.tiles`, the existing PDF.js canvas path remains available;
the canvas is DPR-aware and capped at 8 MP.

```ts
adapter.tiles = {
  async meta() {
    const res = await fetch("/api/office/pdf/tile-meta");
    if (!res.ok) throw new Error("Tile metadata unavailable");
    return res.json(); // {versionId:string,pages:[{width:number,height:number}]}
  },
  tileUrl(page, level, x, y) {
    // Host signs URL and binds it to the immutable version.
    return `/api/office/pdf/tiles/${page}/${level}/${x}/${y}?version=v123`;
  },
};
```

`meta()` returns page dimensions in **PDF points (1/72 inch)**, in page
order, with zero-based tile page indices. `level` is one of
`0.25 | 0.5 | 1 | 2 | 4 | 8 | 16`; choose the smallest level at least
`zoom * devicePixelRatio`. At level L, tile (x,y) represents the PDF-point
rectangle `[x*512/L,(x+1)*512/L) × [y*512/L,(y+1)*512/L)`.
The right/bottom edge is clipped to the actual page. Image pixels correspond
to L pixels per PDF point; images are at most **512×512 pixels**, and PNG
or WebP may be returned with a valid image content type.

The host **must guarantee** that each tile URL is immutable for its version
(include `versionId` in the path, query or signature), authenticate and
authorize tile access on the host API, and rotate URLs when document version
changes. The example URLs are illustrative only; the library never constructs
or signs URLs and never calls remote APIs independently except by fetching URLs
returned by `tileUrl`. On another origin, configure **CORS** to allow the
host origin and handle credentials/security explicitly; do not embed
long-lived credentials in public client code. Browser/cache proxies may use
`Cache-Control: public,max-age=31536000,immutable` only when URLs are truly
immutable and access-control semantics permit that cache policy.

Tiles are limited to **8 simultaneous fetches**, **96 visible tiles**, and
a **256-blob in-memory LRU**. Requests for tiles outside the current viewport
are aborted; horizontal panning and vertically continuous scrolling use page
dimensions from metadata rather than calling PDF.js to measure every page.
Tile mode intentionally exposes **region selection only**. Other page edits
and mark tools are hidden (not silently committed).

The synthetic Next host example is accessible at `/office/pdf?tiles=1`,
serves **100 generated large pages**, and creates coordinate-labeled PNGs at
`/api/tiles/:page/:level/:x/:y`. It is a **geometry/performance test
fixture**, not a production PyMuPDF tile server. It does not simulate 461 MB
document decode or prove the 360i production service meets latency targets.

