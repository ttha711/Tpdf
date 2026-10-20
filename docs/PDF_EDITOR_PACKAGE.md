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

## Installation

See [PDF_EDITOR_INSTALLATION.md](./PDF_EDITOR_INSTALLATION.md) for Next.js,
pnpm, PDF.js worker, styles and host-only packaging instructions.

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

## P2a accepted — Form Create / Fill / Link / Attachment (schemaVersion 1)

360i validated the practical PyMuPDF subset; this is **the approved P2a
contract**, not a proposal. The exact exported discriminated unions are in
`packages/pdf-editor/src/p2Types.ts` and validation in `p2Validation.ts`.
P2 changes extend the original `PdfChange` union, preserving both P1
`kind:"mark"` and legacy text `kind:"field"`. Browser submits the
**ordered** `changes[]` to `adapter.applyChanges` without PDF bytes.

```ts
type P2Option = { label:string; value:string }; // PDF export value
type FormBase = { name:string; required?:boolean; readOnly?:boolean; tooltip?:string };
type P2CreateField =
 | (FormBase & { type:"text"; region:PdfRegion; defaultValue?:string;
                 maxLength?:number; multiline?:boolean })
 | (FormBase & { type:"checkbox"; region:PdfRegion; defaultValue?:boolean;
                 exportValue?:string }) // defaults to "Yes"
 | (FormBase & { type:"dropdown"; region:PdfRegion; options:P2Option[];
                 defaultValue?:string|null; editable?:boolean })
 | (FormBase & { type:"listBox"; region:PdfRegion; options:P2Option[];
                 defaultValues?:string[]; multiSelect?:boolean })
 | (FormBase & { type:"radio"; choices:Array<{
                 region:PdfRegion; label:string; exportValue:string }>;
                 defaultValue?:string|null }); // P2b, disabled in P2a
type P2FillValue =
 | { fieldType:"text"; value:string }
 | { fieldType:"checkbox"; value:boolean }
 | { fieldType:"dropdown"|"radio"; value:string|null }
 | { fieldType:"listBox"; value:string[] }; // P2a: [] or [one value]
type P2Change =
 | { kind:"form.create"; schemaVersion:1; field:P2CreateField }
 | ({ kind:"form.fill"; schemaVersion:1; name:string } & P2FillValue)
 | { kind:"link"; schemaVersion:1; region:PdfRegion;
     target:{kind:"url";url:string} |
            {kind:"page";page:number;point?:{x:number;y:number}} }
 | { kind:"attachment"; schemaVersion:1; region:PdfRegion; assetId:string };
type P2ExistingField = { name:string; type:"text"|"checkbox"|"radio"|"dropdown"|"listBox";
  widgets:Array<{region:PdfRegion;exportValue?:string}>;
  value:string|boolean|string[]|null; options?:P2Option[]; required?:boolean;
  readOnly?:boolean; multiSelect?:boolean; editable?:boolean;
  multiline?:boolean; maxLength?:number; tooltip?:string };
type P2FieldInventory = { versionId:string; fields:P2ExistingField[] };
adapter.formCapabilities?: {
  radio:boolean; multiSelect:boolean; checkboxExportValue:boolean;
};
adapter.listFormFields?():Promise<P2FieldInventory>;
adapter.selectAttachment?():Promise<{assetId:string;size?:number}|null>;
```

- **Geometry:** `PdfRegion.page` is 1-based. All region and point
  coordinates are percentages (0–100) of the **displayed, rotated** page,
  top-left origin. Server transforms to native PDF coordinates.
- **P2a capabilities:** the host opts in to P2a by supplying
  `formCapabilities`, even when all three values are `false`. Omission
  keeps P1-only integrations unchanged and defaults the three flags to
  `false`. Radio group remains disabled pending P2b. List Box supports
  only 0 or 1 selected item (`defaultValues`/fill `string[]`); multi
  default/selection is rejected while `multiSelect=false`. Checkbox
  export defaults to `"Yes"`; any other value is rejected while
  `checkboxExportValue=false`. UI locks unavailable controls with
  “Coming soon”, rather than pretending to execute them.
- **Create:** unique case-sensitive `name`, `required`, `readOnly`,
  `tooltip` (PDF field label), text `maxLength`/`multiline`,
  dropdown `editable`, defaults and choice export values are supported.
  Host validates duplicates across existing fields and staged operations.
- **Fill:** exact `name` plus typed `fieldType`/`value`. Checkbox is
  boolean, text string, dropdown export string or null, list box string
  array with at most one value. A `form.fill` **may reference a
  `form.create` earlier in the same changes list**, and the host must
  apply every operation **in list order**. Reject missing/read-only
  fields, type mismatch, out-of-option values, and invalid required empties.
- **Inventory:** `GET .../form-fields` in 360i is exposed as
  `listFormFields():Promise<{versionId,fields[]}>`. It returns **one
  record per field**, with `widgets[]` for placements, options,
  current value, required/readOnly. Version ID must match the displayed
  document version; reject stale requests.
- **Link:** `target` is either an HTTP(S) URL or 1-based PDF target page,
  with optional displayed-page `point` (no zoom property). Reject
  JavaScript/data/file protocols. Server still checks authorization.
- **Attachment:** `region.x/y` is the icon anchor; **width/height are
  ignored**, and may be zero. Host owns file name, MIME, ACL and content,
  accepts any file type up to **10 MB** (10,000,000 bytes), with only
  `assetId` in the change. No file bytes/base64 in `applyChanges`.
- **Compatibility:** legacy `kind:"field"` remains unchanged.
  360i builds actual AcroForm widgets/annotations, immutable new versions,
  and provides the inventory/picker. P2a is an embedded UI and structured
  change producer only. P2b radio, multi-select and custom checkbox export
  values are not claimed as supported by the PyMuPDF host yet.
