# S4 parity review: apps/web Tpdf vs 360i package

## Root cause of the visual mismatch

The standalone Tpdf app uses:
- `apps/web/src/components/AppHeader.tsx`: top bar, document tabs,
  mobile application menu, tab switcher and file status
- `MobilePdfModeStrip.tsx`, `MobilePdfDock.tsx`,
  `MobilePageFilmstrip.tsx` and
  `apps/web/src/lib/mobilePdfTools.ts`: ordered viewer tools,
  actions, scroll-status chip and lazy page preview
- `PdfViewer.tsx` and `AdaptivePdfViewer.tsx`: EmbedPDF/PDFium
  viewer with **its own internal chrome**, sidebar, native annotation
  actions and app-level events
- shared web CSS, host store, app routing and PDFium runtime

The installed `@tpdf/pdf-editor` does **not** bundle EmbedPDF,
PDFium chrome, app stores, tabs, app-wide routes or Tpdf auth. It uses
host-provided tiles or PDF.js canvases. Previous S3/S4 used an
independently authored `AppShell.tsx` with a `PDF mode` dropdown
and `DesktopRibbon.tsx` with a different tool list, which explains
the different layout even when the host supplied the same PDF.

The fix is to **port the presentational structure and exact tool
catalog** to package-owned components, then map each tool through the
existing adapter/engine. Importing the app components directly would
pull in Tpdf app-only state/server code and violate 360i's isolation
contract. Styling and interactions are adapted, not pixel-for-pixel
identical EmbedPDF chrome.

## Ported UI

| apps/web source | package implementation | Notes |
| --- | --- | --- |
| `mobilePdfTools.ts` | `mobilePdfToolCatalog.ts` | Source-order labels and seven groups |
| `MobilePdfModeStrip` | `MobileToolStrip` + `WebToolButton` | Group tab shows a scrollable icon+label child toolbar, no mode dropdown |
| `MobilePdfDock` | `AppShell` | Select/Undo/Redo/Tools/Save; scroll-only Page N/M + zoom chip, 3-second idle hide |
| `MobilePageFilmstrip` | `MobilePageFilmstrip` + `TileGrid` | Lazy tile thumbs, <=200 pages all, otherwise +-10 window, Jump/Escape |
| `AppHeader` and `MobileTabSwitcher` | `MobileAppHeader` | File/menu/count/name+Saved, optional host open document actions |
| Embedded toolbar chrome | `WebToolButton` / `webToolCommands` | Exact labels, capability checks; no fake execution |
| App right inspector | `DesktopInspector` | Quick tools, Document, Review, OCR jobs, P1 Style/P2/P3 from existing hooks |
| App desktop ribbon / sidebar | `DesktopRibbon` / `DesktopSidebar` | Host groups are appended after viewer groups; tiles remain virtualized |

## Breakpoints and optional host inputs

The **editor's own container** is observed with ResizeObserver, not the
browser viewport. Below 640px retains mobile; 640–1199px is tablet;
1200px+ is desktop three-column. The new default desktop fit cap is
105% to approximate the 103% reference view at 1280px; tablet cap 125%.
Manual zoom is unchanged. `shell="classic"` retains its previous behavior.

Optional host props, backwards compatible:

```ts
openDocuments?: Array<{id:string;name:string;page:number;pages:number}>;
activeDocumentId?: string;
onOpenDocument?: (id:string)=>void;
onCloseDocument?: (id:string)=>void;
onOpenFile?: ()=>void;
onHome?: ()=>void;
showHomeButton?: boolean; // default true; false when host already has header
```

Without `openDocuments` a single current-document card is shown
with count `1`. No pretend "Open file" operation without callback.
Current host adapter remains responsible for identity, list of files,
security and actual file switch.

## Tool compatibility and remaining differences

- **Unavailable tools stay listed** with Coming soon:
  P4 Comment/Comments (docs PR #234 only), P2b Radio, native PDF
  left rotation if not supported by existing change protocol, plus
  other actions missing a host capability. No synthetic EmbedPDF event
  pretending a native renderer exists.
- **Host document tools** (Pages, Mark up, Convert, Protect, etc.)
  are appended in own groups; no reordering of viewer tools.
- App-native Edit PDF content, AI assistant, command palette and
  Acrobat-like embedded annotations are not automatically added to
  the independent package. They require host adapter/commands.
- The package thumbnail/outline and right panel are built with existing
  PDF.js/tiles and host callbacks. Their visual details and Acrobat
  behavior may differ from native EmbedPDF chrome. Tpdf web uses
  lucide-react icons; the package uses lightweight local SVG equivalents.
- A verified **pixel baseline** from the user's locally running Vite
  app with the same PDF and browser/font settings is required before
  making any claim of pixel-identical screenshots. This repo CI only
  renders the Next host. Source mapping and responsive screenshots
  are checked, but identical-pixel parity is **not** claimed.

## Verification

Use `examples/next-host/tests/s4-web-parity.spec.ts` for group
catalog, direct tool actions, header/tab switcher, scroll chip,
lazy previews/Jump and empty capabilities. Existing
`s4-desktop.spec.ts` covers 1280×800, 1024×768, 768×1024, 375×812,
embedded container 600px, no horizontal overflow and ResizeObserver
width changes. The host can compare the resulting Playwright screenshots
against independently captured Vite AppHeader/PdfViewer images.

```sh
npm run build --workspace=@tpdf/pdf-editor
npm test --workspace=@tpdf/pdf-editor
HOST_DIR=$(node examples/next-host/scripts/stage.mjs)
cd "$HOST_DIR"
pnpm install --no-frozen-lockfile
pnpm exec playwright test
```

## Optional side-by-side original Vite comparison

Run the original `apps/web` Vite site yourself with the **same PDF** opened
and keep it accessible at a URL. The Next-host Playwright test
`s4-vite-visual.spec.ts` is opt-in and is **skipped in CI** unless
`TPDF_VITE_BASE_URL` is supplied. It captures the original and the
embedded package at all four target viewports, outputs paired PNGs and
computes diagnostic mean RGB pixel difference:

```sh
TPDF_VITE_BASE_URL=http://localhost:5173 pnpm exec playwright test s4-vite-visual.spec.ts
```

The image diagnostic is not a parity pass/fail threshold: the two viewers
must show the **same PDF/page and font environment** for a valid visual
comparison, and even then EmbedPDF chrome and tile/PDF.js renderer
differences may remain. Review the paired screenshots and concrete
layout differences; do not claim that synthetic Next host CI compared
itself against the user's original eight-page Vite session.
