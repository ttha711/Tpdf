# Legacy integration and verification reference

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

