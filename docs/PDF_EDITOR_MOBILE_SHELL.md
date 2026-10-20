# Mobile App Shell — @tpdf/pdf-editor

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
