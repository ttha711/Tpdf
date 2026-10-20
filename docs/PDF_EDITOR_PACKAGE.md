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
