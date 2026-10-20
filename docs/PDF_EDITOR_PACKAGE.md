# @tpdf/pdf-editor for 360i (React/Next.js)

## Scope and separation

This package is a **React 18 client component**, not an iframe or a Tpdf site.
It does not import Tpdf server, Electron, Node APIs, HMAC credentials or any
environment variables. **All document identity, access control and storage**
belong to the host adapter. Its PDF.js renderer requests only the **URL returned
by the adapter**, and the `workerUrl` given by the host (or operates on bytes).
Any HMAC signing belongs in **360i API routes**, never in browser JS. Existing
`/api/tpdf/agent/v1` routes and auth remain unchanged.

The package is currently a **separate editor surface** powered by
`pdfjs-dist` for lazy page rendering and `pdf-lib` for local writes. The
full EmbedPDF/PDFium content-editing UI still lives in `apps/web` and has
**not** been extracted; it is deliberately untouched so web/desktop remain
operational. `assets.pdfiumWasmUrl` is accepted for future shared PDFium
integration but is not consumed by this first client-only implementation.
This is a functional subset, not feature parity with standalone Tpdf.

## Installation (360i Next 14, React 18, pnpm)

Build a release tarball in the Tpdf checkout:

```bash
npm ci --ignore-scripts
npm run build --workspace=@tpdf/pdf-editor
npm test --workspace=@tpdf/pdf-editor
mkdir -p release
npm pack --workspace=@tpdf/pdf-editor --pack-destination release
# installs packaged ESM + d.ts + style.css
cd ../360i
pnpm add ../Tpdf/release/tpdf-pdf-editor-0.1.0.tgz
```

Alternatively clone Tpdf at a pinned commit/tag, build the workspace first,
then `pnpm add file:../Tpdf/packages/pdf-editor` (a local Git checkout).
A bare `pnpm add github:ttha711/Tpdf` refers to the monorepo root and
**does not** install this subpackage. Prefer pinned tarballs for reproducibility.

Copy PDF.js worker to the host's public directory (not a CDN or Tpdf server):

```bash
node ../Tpdf/packages/pdf-editor/scripts/copy-assets.mjs ./public
# -> public/tpdf-assets/pdf.worker.min.mjs
```

Provide `assets={{workerUrl:"/tpdf-assets/pdf.worker.min.mjs"}}`.
`pdfiumWasmUrl` is reserved and optional; host applications using the legacy
EmbedPDF engine should copy its WASM using that engine's own asset tooling.
There are **no automatic CDNs or hardcoded worker paths**.

In Next App Router, import the separate stylesheet in `app/layout.tsx`:

```ts
import "@tpdf/pdf-editor/style.css";
```

In a **client component**, use dynamic import with SSR disabled:

```tsx
"use client";
import dynamic from "next/dynamic";
const TpdfPdfEditor = dynamic(
  () => import("@tpdf/pdf-editor").then((m) => m.TpdfPdfEditor),
  { ssr: false },
);
```

The parent must provide an explicit height (e.g. `height:100dvh` or an Office
pane with `min-height:0;flex:1`). Editor fills **100% of its parent**; no
`position:fixed`, global reset, login/home screen or postMessage.
All CSS selectors use a `.tpdf-editor` prefix.

## Complete 360i adapter example (TypeScript)

This example assumes 360i's own authenticated API routes implement
`GET /api/office/pdf/source`, `POST /api/office/pdf/versions`,
`GET /api/office/pdf/versions`, `POST /api/office/pdf/ocr`, and
`GET /api/office/pdf/search?q=...`. Those routes run on 360i's **server**
and may call Tpdf Server with the existing HMAC bridge. These sample
360i routes **are not implemented in this repository**.

```ts
import type { TpdfPdfAdapter } from "@tpdf/pdf-editor";

export const adapter: TpdfPdfAdapter = {
  async loadDocument() {
    const response = await fetch("/api/office/pdf/source");
    if (!response.ok) throw new Error("Cannot open PDF");
    // Prefer a short-lived same-origin URL supporting HTTP Range/206.
    // Response: { url:"/api/office/pdf/file/uuid", name:"drawing.pdf", size:123 }
    return await response.json();
  },
  async saveVersion(bytes, { name, baseVersionId }) {
    const response = await fetch("/api/office/pdf/versions", {
      method: "POST",
      headers: { "Content-Type": "application/pdf",
        "X-PDF-Name": encodeURIComponent(name),
        "X-Base-Version": baseVersionId ?? "" },
      body: new Blob([bytes], { type: "application/pdf" }),
    });
    if (!response.ok) throw new Error("Version save failed");
    // 360i's server MUST create a new immutable version.
    return await response.json() as { versionId: string; name: string };
  },
  async listVersions() {
    const response = await fetch("/api/office/pdf/versions");
    if (!response.ok) throw new Error("Version list failed");
    return await response.json();
  },
  async runOcr({ bytes, name }) {
    const response = await fetch("/api/office/pdf/ocr", {
      method: "POST", headers: { "X-PDF-Name": encodeURIComponent(name) },
      body: new Blob([bytes], { type: "application/pdf" }),
    });
    if (!response.ok) throw new Error("OCR failed");
    return { bytes: new Uint8Array(await response.arrayBuffer()) };
  },
  async searchPages(query) {
    const response = await fetch("/api/office/pdf/search?q=" + encodeURIComponent(query));
    if (!response.ok) throw new Error("Search failed");
    return await response.json(); // [{page, snippet, score}]
  },
};
```

**Adapter requirements:** `loadDocument()` returns `{url,name,size?}` or
`{bytes:Uint8Array,name}`; do not return unauthenticated external URLs.
`saveVersion()` receives fresh PDF bytes and `{name,baseVersionId?}`, creates
an immutable version and returns `{versionId,name}`. The component rejects
reusing a previous `versionId`. Optional methods hide their corresponding UI
controls, except search, which falls back to PDF.js local text scanning.

```tsx
<TpdfPdfEditor ref={editorRef} adapter={adapter} locale="vi"
  density="office" theme="system"
  assets={{workerUrl:"/tpdf-assets/pdf.worker.min.mjs"}}
  onDirtyChange={(dirty) => setUnsaved(dirty)}
  onSaved={(info) => setCurrentVersion(info.versionId)}
  onRegionSelected={(region) => handleAgentRegion(region)}
  onPageChange={(page) => setCurrentPage(page)}
  onError={({code,message,retryable}) => report(code,message,retryable)}
/>
```

Ref commands: `save():Promise<void>`, `goToPage(number)`,
`setZoom(0.25|0.5|1|2|"fit")`, `highlightRegion({page,x,y,width,height,note})`,
`undo()`, `redo()`. Percent coordinates are 0–100, origin top-left.
`messages` overrides localized text (`vi`/`en`). `readOnly` hides writes
and permits region selection.

## Feature matrix

| Feature | Library implementation | Caveat |
| --- | --- | --- |
| Continuous pages, page grid, 25/50/100/200/Fit | Yes | Lazy canvas near viewport |
| Open via adapter URL (Range) or Uint8Array | Yes | Actual transfer profile unverified |
| Highlight, note, freehand stroke | Yes | Draws visual overlays on save |
| Cover/redaction | **Visual cover only** | Original text may remain extractable; **not secure redaction** |
| Signatures | Visual typed label | Not cryptographic PDF signature |
| Text fields | Basic AcroForm text inputs | Other field types not yet supported |
| Rotate, delete, move, insert pages | Yes | Structural copies may lose active form fields |
| Undo/redo / dirty / Ctrl+S | Yes | Undo history limited to 50 snapshots |
| OCR | Optional host adapter | Tpdf service is never called directly |
| Search | Optional indexed adapter or local PDF.js | Local scan can be slow on very large PDFs |
| Versions | Optional host adapter | No server-side version state in library |
| Existing PDFium/EmbedPDF full content editor | **Not yet extracted** | Legacy apps/web and desktop remain unchanged |
| Compare drawings and secure redaction | Not provided by this React package | Implement through 360i adapter/server tooling |

No markup in a PDF is trusted or interpreted as a command. Preview text is
inserted as text nodes, never HTML. No PDF-provided JavaScript is executed by
this library (`isEvalSupported:false` in PDF.js).

## Build, tests, distribution, and limits

```bash
npm run build --workspace=@tpdf/pdf-editor
npm run typecheck --workspace=@tpdf/pdf-editor
npm test --workspace=@tpdf/pdf-editor
npm pack --workspace=@tpdf/pdf-editor --dry-run
```

`dist/size-report.json` reports the actual gzip total of the **unbundled ESM
package JS**, with a 100 KiB budget. It intentionally does **not** include
external dependencies (`pdfjs-dist`, `pdf-lib`, React), worker or WASM
resources; application bundle total must be measured in the host too.
Do not mistake library-only gzip for Next.js application payload.

GitHub workflow `.github/workflows/pdf-editor-package.yml` runs on the
package branch/PR, publishes a `.tgz` artifact and, for `pdf-editor-v*` tags,
attaches the tarball to a GitHub Release. It does not publish to npm.

Minimal host example:

```bash
npm run build --workspace=@tpdf/pdf-editor
# Standalone staging avoids pnpm resolving unrelated Tpdf workspaces
# such as @tpdf/core from the npm registry.
HOST_DIR=$(node examples/next-host/scripts/stage.mjs)
cd "$HOST_DIR"
pnpm install --no-frozen-lockfile
pnpm dev
# navigate to http://localhost:3300/office/pdf
# from another terminal in "$HOST_DIR":
pnpm exec playwright install chromium
pnpm exec playwright test
```

The example is staged outside the root pnpm-workspace scope to avoid attempting to download unpublished sibling packages from npm. Its fixture generator writes a **2-page** PDF under its own
`public/`. The host's adapter loads that disk-backed document and stores
new versions **in browser memory**; the browser test selects a highlight and
checks Ctrl+S invokes `saveVersion` with changed PDF bytes.

### Verification notes (update on actual runs)

Do **not** mark builds, `npm pack`, host browser tests, legacy CLI or OCR
tests as passed until run on a dependency-installed checkout. A missing
network/npm registry/Chromium means those checks remain unverified.
Compatibility of a 100+ page PDF opening progressively and 390px touch
gestures also requires a real-browser gate before production.

### CI verification from this branch (2026-10-20)

GitHub Actions on Node 22 confirmed:

- `npm ci --ignore-scripts`, package `npm run build` (TypeScript, ESM and declarations), and package offline tests **passed**.
- React pointer-region event test with **jsdom passed**.
- `npm pack --workspace=@tpdf/pdf-editor` succeeded and uploaded `tpdf-pdf-editor-tarball`; the archive includes `dist/index.d.ts`, `dist/style.css`, and compiled ESM.
- Existing `@tpdf/core` build, `@tpdf/web` typecheck/build and `node --test tests/cli/*.test.mjs` **passed** (real OCR test is opt-in and skipped by default).
- `examples/next-host` **passed real Chromium Playwright**: open 2 pages under `/office/pdf`, mark region, Ctrl+S, verify host `saveVersion` received modified PDF bytes with an additional graphic content stream, plus 390px toolbar smoke.
- Actual package-only externalized JS gzip: **8.64 KiB**; it **excludes** PDF.js/pdf-lib/React/worker assets. No total Next production payload measurement was made.

**Not verified:** extraction/migration of the full legacy PDFium/EmbedPDF editor, secure PDF redaction, cryptographic signatures, structural form preservation, 100+ page Range performance, multi-browser/touch matrix, production 360i HMAC adapter, desktop packaging, and opt-in network-enabled OCR.

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

## S3 optional app-style mobile shell (360i host)

Use `shell="app"` for the mobile-first header, six tool tabs (View, Annotate,
Shapes, Insert, Forms, All tools), mode row, viewer, page/zoom status and bottom
Read / Undo / Redo / Tools / Save dock. A bottom sheet renders built-in commands
and any host-provided tools. `shell="classic"` remains the default and retains
the prior toolbar. No apps/web stores, services, iframe, authentication or Tpdf
server modules are imported. CSS remains scoped to `.tpdf-editor`.

```tsx
<TpdfPdfEditor
  shell="app"
  renderMode="tiles"
  tilesOnly
  adapter={{
    async loadDocument() { return { url: "/api/pdf/source", name: "drawing.pdf", size: 461_000_000 }; },
    tiles: {
      async meta() { return fetch("/api/pdf/tile-meta").then((r) => r.json()); },
      tileUrl(page, level, x, y) {
        return `/api/pdf/tiles/${page}/${level}/${x}/${y}?version=immutable-v1`;
      },
    },
    async searchPages(query) {
      return fetch("/api/pdf/search?q=" + encodeURIComponent(query)).then((r) => r.json());
    },
    async applyChanges(changes, info) {
      const response = await fetch("/api/pdf/changes", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ changes, ...info }),
      });
      if (!response.ok) throw Error("Host did not save changes");
      return response.json(); // { versionId, name } (new immutable version)
    },
  }}
  tools={[
    { id: "watermark", label: "Watermark", group: "Edit PDF",
      run({ page, selection }) { return hostRunWatermark({ page, selection }); } },
  ]}
  assets={{ workerUrl: "/tpdf-assets/pdf.worker.min.mjs" }}
  onSaved={(info) => reloadHostDocument(info.versionId)}
/>
```

- `tilesOnly` is optional. When true, the engine **never creates a PDF.js
  loading task**, including after save. It still calls `loadDocument()` to
  obtain the name and save context, but does not request/download its PDF URL.
  `adapter.tiles` is required. `assets.workerUrl` can be supplied as normal
  for type compatibility but is unused in tilesOnly.
- `adapter.applyChanges` is an optional alternative to `saveVersion`.
  It receives a change list (marks in **page-relative percent coordinates**,
  and rotate/delete/move/insert/field operations) with
  `{name, baseVersionId?}`. The library does not read, reserialize, or send
  PDF bytes through this path. The host validates and applies all changes,
  returns a **new versionId**, and refreshes/re-mounts the editor to fetch
  the new immutable tile URLs. If neither save implementation exists,
  saving is unavailable.
- In tile mode, annotation and page mutation controls are available **only
  when `applyChanges` is supplied** and the component is not readOnly.
  Unsupported local AcroForm editing stays unavailable in tilesOnly.
- `adapter.searchPages` supplies server-side results when present, including
  tilesOnly. Selecting a hit scrolls via tile metadata, without PDF.js.
- `tools` is an optional array of `{id,label,group,icon?,run(context)}`.
  Group labels and commands are entirely host-defined. The library only
  calls `run({page, selection?})`; Tpdf does not implement watermark,
  compression, page numbering, conversions, cryptographic signing or secure
  redaction through these menu entries. Errors are reported through
  `onError` with code `host-tool`.
- `locale="vi"|"en"` and `messages` provide localized shell labels.
  The shell respects safe-area insets and 44 px minimum mobile actions.

### S3 test host and screenshot evidence

```bash
npm ci --ignore-scripts
npm run build --workspace=@tpdf/pdf-editor
npm run typecheck --workspace=@tpdf/pdf-editor
npm test --workspace=@tpdf/pdf-editor
HOST_DIR=$(node examples/next-host/scripts/stage.mjs)
cd "$HOST_DIR"
pnpm install --no-frozen-lockfile
pnpm exec playwright install chromium
pnpm exec playwright test
# Open http://localhost:3300/office/pdf?tiles=1&tileonly=1&shell=app
```

`examples/next-host/tests/app-shell.spec.ts` writes captures for **375x812**
and **390x844**, in open, Annotate, and Tools sheet states. The Next example
uses 100 synthetic labeled PNG pages; screenshots from GitHub Actions are
uploaded as `pdf-editor-s3-mobile-screenshots`. These images are QA evidence
for independent comparison with the mobile Tpdf reference screenshot, **not**
a self-declared pixel-perfect UI acceptance.
