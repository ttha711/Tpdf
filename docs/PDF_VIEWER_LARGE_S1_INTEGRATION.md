# Large PDF viewer S1: 360i integration and performance tests

S1 keeps PDF.js/pdf-lib. It does NOT extract apps/web or use PDFium.
It does not implement OCR or text search for large files.

## Host Range contract

360i provides `loadDocument(): { url, name, size }` with an authenticated URL
supporting `HEAD` and `GET Range`. The PDF.js `getDocument` options are:
`disableStream: true`, `disableAutoFetch: true`,
`rangeChunkSize: 262144`, `isEvalSupported: false`. No full-file
`fetch/arrayBuffer` occurs during URL viewing.
Server replies to `Range: bytes=0-262143` with 206,
`Accept-Ranges: bytes`, `Content-Range: bytes 0-262143/TOTAL`,
`Content-Length: 262144`. Return 416 for invalid ranges, and **do not**
fall back to a full 200 response. Expose `Content-Length`,
`Accept-Ranges`, `Content-Range` and optionally `ETag` through CORS.
Allow `Range` requests (including preflight when applicable). Credentials
and authorization remain the responsibility of 360i. Use same-origin URLs
unless cross-origin CORS and token policy are configured deliberately.

Page one supplies placeholder geometry for other pages. Other pages acquire
their actual dimensions only when near the scroll viewport. The page grid is
lazy and raster canvas admission is limited to six pages by default
(`rasterCachePages`, clamped to eight). Raster canvases unmount and cancel
pending render tasks when evicted. The budget counts DOM canvases, not the
total memory held internally in PDF.js workers or browser graphics processes.
S1 does **not** run page text extraction during initial viewing.

## Host-side large-file save adapter

`largeFileBytes` defaults to 30 MiB. When `size > largeFileBytes` and
`applyChanges` exists, save invokes it with the **current changes only**.
Unknown URL sizes also require `applyChanges` instead of an unsafe download.
A large known PDF without `applyChanges` opens in view-only mode.
For files at or below the threshold, the existing `pdf-lib` byte-save path
is preserved. `applyChanges` must return a fresh immutable version:
`{ versionId, name, url?, size? }`. When `url` is missing,
`loadDocument()` is called again and must return the **new version's URL**.
Returning the old source is a host adapter bug. 360i is responsible for
version concurrency, authorization, immutable storage and optional PyMuPDF
implementation.

Public `PdfChange` (exported from `@tpdf/pdf-editor`) is a tagged union:
- `{kind:"mark", mark:{type:"highlight"|"note"|"draw"|"cover"|"signature"|"region",region:{page,x,y,width,height,note},value?,points?}}`
- `{kind:"rotate"|"delete"|"insert",page}`
- `{kind:"move",page,to}`
- `{kind:"field",field,value}` (small-file form legacy)
Coordinates are percentages **0–100** of the original page rectangle,
origin top-left; page numbers and move destinations are **1-based**.
Draw points are `[xPercent,yPercent]` pairs. The host must validate all
changes, enforce access control and convert the page coordinate origin for
PyMuPDF. `cover` is only a visual black box, **not secure redaction**;
`signature` is only visual text, **not cryptographic signing**.
Structural operations use the current ordered page list; a server-side
`saveIncr` may not be valid for every structural operation, so use a new
immutable PDF version and full rewrite when necessary. Never mutate a
source version in place.

## Valid performance fixture and standalone host

```bash
# inside examples/next-host (Python: pip install pymupdf pillow)
pnpm run perf:pdf:valid
# 300 A0 pages with individual JPEG noise + vector lines + text
# non-linearized, proper xref, typically 250–300 MiB
TPDF_LARGE_PDF_E2E=1 pnpm test:large
```

`examples/next-host/scripts/range-server.mjs` (port 3400) serves the
fixture with byte accounting (`/__stats`, `/__stats/reset`). The Next
host stays on 3300; Playwright starts both hosts. The large test is opt-in
to keep the existing two-page package CI fast. The original `perf:pdf`
comment-padded generator **must not** be used to benchmark PDF.js: its
xref placement is unsuitable for this workload.

Expected gates: first painted page within 20s, fewer than 5% of PDF bytes
served before first paint, 100-page scroll, <=8 live canvases, no unbounded
memory growth, and 390px view. Playwright logs `TPDF_S1_MEASUREMENTS`
after a successful run. The memory check uses CDP's **main-thread heap**
after GC, not a measurement of PDF.js worker heap, WASM or GPU RSS.
All gates and measured sizes remain **unverified** until tested.
