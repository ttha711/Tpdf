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

## 360i adapter example

The original authenticated-host adapter example is preserved in
[PDF_EDITOR_LEGACY_INTEGRATION.md](./PDF_EDITOR_LEGACY_INTEGRATION.md).

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

## Build, tests and release

See [PDF_EDITOR_LEGACY_INTEGRATION.md](./PDF_EDITOR_LEGACY_INTEGRATION.md)
for the complete historical commands, packaging, verification and limitations.

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
type Quad = [Point, Point, Point, Point]; // reading order: start-top, end-top, end-bottom, start-bottom
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
and every point/quad coordinate are percentages of the **displayed page
rectangle, after page rotation**, with top-left origin. They are **not**
percentages of the unrotated PDF page, nor CSS/tile/DPR coordinates.
This matches the 360i tile renderer, selection overlay and PyMuPDF host.
The host must transform coordinates between displayed-page and PDF-native
spaces using the actual page rotation before writing annotations.

`quads[]` describes precise text-line geometry in displayed-page
percentages, never a bounding box guessed from pointer drag. The four points
follow **text reading direction**: start/top, end/top, end/bottom, start/bottom
(top/bottom are relative to the glyph orientation, not fixed screen axes).
At 90°/270°, Underline/Strikeout/Squiggly previews must use the
text baseline direction and its normal; do not treat these quads as fixed
screen TL/TR/BR/BL. **Known viewer follow-up:** rotated-text markup
preview still needs validation/fix; the 360i server's actual annotations are
already independently verified. Text tools require
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

**360i font behavior (independently accepted):** basic WinAnsi Latin text
is stored as a real PDF `/FreeText` annotation; Vietnamese characters
outside WinAnsi (such as “ễ”, “ạ”) are rendered with DejaVu into the PDF
page content **instead of** `/FreeText`. Both use the same P1 text payload;
callers must not assume that every text mark remains an editable annotation.

**S3/P1 UI follow-ups, not part of this documentation-only change:**
after `resolveTextQuads` completes and Underline/Strikeout/Squiggly renders,
clear the transient red region-selection rectangle. When a tool is picked from
the Tools sheet, synchronize the mode selector/tab to that tool's group
(Underline → Annotate; do not leave “Shapes” selected).

P2 Form/Link/Attachment and P3 Measure/Redact/Replace text are
**displayed but disabled** with “Sắp có” / “Coming soon”. A proposed
P2 format follows below; P3 does not have a wire contract yet.

## P2 proposed Form / Fill / Link / Attachment contract — awaiting 360i approval

**Proposal only — not implemented or exported in TypeScript yet.**
No P2 tool is enabled, and no P2 change is sent by the current library.
After 360i approves this schema, extend the existing `PdfChange` union
without changing P1 `{kind:"mark",mark:P1Mark}` or legacy `kind:"field"`.
All new P2 mutations are JSON-serializable, **schemaVersion: 1**, sent to
the existing `adapter.applyChanges(changes, {name,baseVersionId?})`.

```ts
// Reuses existing PdfRegion: {page,x,y,width,height,note}.
// Page is 1-based; x/y/width/height are 0..100% of DISPLAYED (rotated) page.
type P2Option = { label: string; value: string }; // value = PDF export value
type P2FieldType = "text" | "checkbox" | "radio" | "dropdown" | "listBox";
type P2FormBase = { name: string; required?: boolean; readOnly?: boolean;
  tooltip?: string };
type P2CreateField =
  | (P2FormBase & { type: "text"; region: PdfRegion;
      defaultValue?: string; multiline?: boolean; maxLength?: number })
  | (P2FormBase & { type: "checkbox"; region: PdfRegion;
      exportValue: string; defaultValue?: boolean })
  | (P2FormBase & { type: "radio";
      choices: Array<{ region: PdfRegion; label: string; exportValue: string }>;
      defaultValue?: string | null })
  | (P2FormBase & { type: "dropdown"; region: PdfRegion;
      options: P2Option[]; defaultValue?: string | null; editable?: boolean })
  | (P2FormBase & { type: "listBox"; region: PdfRegion;
      options: P2Option[]; defaultValues?: string[]; multiSelect?: boolean });
type P2FillValue =
  | { fieldType: "text"; value: string }
  | { fieldType: "checkbox"; value: boolean }
  | { fieldType: "radio" | "dropdown"; value: string | null }
  | { fieldType: "listBox"; value: string[] };
type P2Change =
  | { kind: "form.create"; schemaVersion: 1; field: P2CreateField }
  | ({ kind: "form.fill"; schemaVersion: 1; name: string } & P2FillValue)
  | { kind: "link"; schemaVersion: 1; region: PdfRegion;
      target: { kind: "url"; url: string }
        | { kind: "page"; page: number; point?: { x: number; y: number } } }
  | { kind: "attachment"; schemaVersion: 1; region: PdfRegion;
      assetId: string };

// Read-only discovery from 360i server; the library does not inspect tile PDF bytes.
type P2ExistingField = { name: string; type: P2FieldType;
  widgets: Array<{ region: PdfRegion; exportValue?: string }>;
  value: string | boolean | string[] | null; options?: P2Option[];
  multiSelect?: boolean; required?: boolean; readOnly?: boolean };
type P2FieldInventory = { versionId: string; fields: P2ExistingField[] };
adapter.listFormFields?(): Promise<P2FieldInventory>;
```

**Interpretation and validation (proposal):**
- `form.create`: `name` identifies the **AcroForm field**, unique within
  the document. For radio, one name groups **multiple widgets** in
  `choices[]`; each has its own displayed-page `region` and unique
  `exportValue`. Creating a duplicate field name is rejected.
- `P2Option.value` and radio `exportValue` are **stable PDF export
  values**; `label` is UI text only. Options cannot have duplicate values.
  Defaults must match options; list-box `defaultValues` must be unique.
  When `multiSelect !== true`, the list-box value may contain at most
  one item. Required fields cannot be cleared to empty/null.
- `form.fill` targets an **existing field by exact case-sensitive name**,
  not the widget index or label. Text uses string, checkbox boolean,
  radio/dropdown selected export string (or null to clear if allowed),
  list-box selected export-string array. An unknown, read-only or
  type-mismatched field is rejected. Existing legacy `kind:"field"`
  remains unchanged (text-only) for backwards compatibility.
- The proposed `listFormFields()` route returns one record per **field**
  (not per widget), with `widgets[]` carrying the displayed page regions
  and checkbox/radio export values. `versionId` must match the open
  document version; reject stale Fill results or conflicting saves.
- Link `target` is **exactly one of** HTTPS/HTTP URL or an internal
  **1-based page**; optional destination `point` is 0..100% in the
  target displayed page. Reject `javascript:`, `data:`, `file:`,
  malformed URLs and unauthorized targets.
- Attachment stores only `assetId` + placement. The host owns file
  name, MIME, content, permissions and malware/size checking; no raw
  bytes/base64 in `P2Change`. Asset selection UI/adapter is to be
  specified after agreement.
- As with P1, the server transforms displayed-space percentages to
  native PDF coordinates and validates every page/region/value. Only the
  host generates PDF widgets/annotations and immutable new versions.

**Awaiting agreement:** radio group `choices[]`, checkbox boolean mapping,
list-box `string[]`, clearing a choice with `null`, and the inventory
`{versionId,fields[]}` are deliberate proposals, **not an assertion that
360i already supports these wire shapes**. Do not implement P2 until confirmed.
