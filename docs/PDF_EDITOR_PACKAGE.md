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

## S2 tile adapter

See [PDF_EDITOR_TILE_VIEWER.md](./PDF_EDITOR_TILE_VIEWER.md) for the tile geometry and cache contract.

## S3 mobile app shell

See [PDF_EDITOR_MOBILE_SHELL.md](./PDF_EDITOR_MOBILE_SHELL.md) for the optional app shell, host tools, tilesOnly, remote applyChanges, examples, and screenshot test instructions.

## P1 annotation change contract (schemaVersion = 1)

The **final wire contract for 360i PyMuPDF** is exported in
`packages/pdf-editor/src/p1Types.ts` as `P1Mark` and `P1Style`.
It is sent unchanged through `adapter.applyChanges(changes, info)` as
`{kind:"mark", mark: P1Mark}`. Existing unversioned `LegacyMark`
remains readable; **do not silently reinterpret** old marks as P1.

```ts
type Point = { x: number; y: number }; // finite 0..100, page origin top-left
type Quad = [Point, Point, Point, Point]; // TL,TR,BR,BL per line
type Style = {
  strokeColor: string; fillColor: string;  // #RRGGBB
  opacity: number;                        // 0..1
  strokeWidthPt: number; fontSizePt: number; // PDF points (1/72 inch)
};
type Base = { schemaVersion: 1; region: PdfRegion; style: Style };
type P1Mark =
 | Base & { type:"highlight"|"underline"|"strikeout"|"squiggly"; quads: Quad[] }
 | Base & { type:"inkHighlight"; paths: Point[][] }
 | Base & { type:"addText"|"insertText"|"callout"; text:string; anchor?:Point }
 | Base & { type:"rectangle"|"circle" }
 | Base & { type:"line"|"arrow"|"polygon"|"polyline";
            points:Point[]; arrowEnd?:"none"|"start"|"end"|"both" }
 | Base & { type:"stamp"|"image"|"signature"; assetId:string };
```

Page is **1-based** in `region.page`. `region.x/y/width/height`
and every point/quad coordinate are percentages of the **unrotated page
rectangle**, top-left origin, not pixels, CSS units, tile level or DPR.
Host converts to PDF points using page width/height. Respect page
rotation explicitly on the host; this contract does not rotate positions.
`quads[]` describes precise text line geometry, never a bounding box
guessed from pointer drag. Text tools require
`adapter.resolveTextQuads(page,region): Promise<Quad[]>` from host
(PyMuPDF word/character geometry); without it, these entries are disabled.
`adapter.selectAsset(type)` returns a host-managed immutable
`{assetId}` for image/stamp/signature. `adapter.assetUrl(assetId)` provides an optional preview URL; never put base64 PDF/image bytes
inside changes. Host validates asset access and MIME before save.

`arrowEnd` defaults to `"end"` for Arrow; polygon has at least
3 vertices, all other point/ink paths at least 2. Every field is
JSON-serializable. Colors must be 6-digit hex; opacity 0..1;
`strokeWidthPt` (0,72]; `fontSizePt` (0,200]. Text is max
2000 characters, asset ID max 256. Reject invalid geometry and
unsupported schema versions server-side. PyMuPDF must implement
the actual PDF annotations, text quad handling, redaction semantics
if added in P3, and version regeneration; this frontend **does not**
claim to save P1 marks into PDF bytes using pdf-lib.

P2 Form/Link/Attachment and P3 Measure/Redact/Replace text are
**displayed but disabled** with “Sắp có” / “Coming soon”, and have
no change wire format yet.
