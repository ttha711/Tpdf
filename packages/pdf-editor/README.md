# @tpdf/pdf-editor

React 18 client PDF editor that loads/saves exclusively via host-provided adapter.
No iframe, cookies, Tpdf server URL, independent login, Electron, or postMessage.

- Import `@tpdf/pdf-editor/style.css` in your host app.
- Pass `assets={{workerUrl:"/tpdf-assets/pdf.worker.min.mjs"}}`.
- Call `node packages/pdf-editor/scripts/copy-assets.mjs path/to/host/public`.
- Use `next/dynamic` with `{ssr:false}` inside a Next.js client component.
- `saveVersion` must create immutable new versions; original bytes remain with host.

See [integration guide](../../docs/PDF_EDITOR_PACKAGE.md).
