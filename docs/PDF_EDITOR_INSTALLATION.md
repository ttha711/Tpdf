# @tpdf/pdf-editor — Next.js host installation

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

For adapter schemas, go back to [PDF_EDITOR_PACKAGE.md](./PDF_EDITOR_PACKAGE.md).
