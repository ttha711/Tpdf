# S4 container-responsive desktop/tablet Office shell

Use the existing `<TpdfPdfEditor shell="app" adapter={...} />`. No iframe,
Tpdf authentication, app store or bundled server. The React package remains
driven by the host's existing `applyChanges`, P1/P2/P3 types, and optional
host `tools[]`.

## Responsive behavior (width of PDF editor container, not browser)

| Container | Shell | Navigation | Inspector |
| --- | --- | --- | --- |
| under 640px | Original S3 mobile | Bottom dock / Tools sheet | Existing P3 collapsible mobile panel |
| 640–1199px | Tablet | Compact ribbon; sidebar closed by default, can open | Closed by default; opens on editing tool |
| 1200px or wider | Desktop | Full seven-group ribbon plus dynamic host groups; sidebar shown | Right inspector shown; P1 Style, P2 and P3 forms |

The editor uses ResizeObserver on its own root node; resizing the containing
Office pane can cross breakpoints without depending on window.innerWidth.
The 360i host owns its own breadcrumb/header; desktop shell has no extra logo,
and only repeats a short filename, saved state and Save action.

## Desktop and tablet controls

- Ribbon groups: View, Annotate, Shapes, Insert, Form, Redact, Measure,
  plus each `tools[].group` supplied by host (e.g. Pages, Mark up,
  Convert, Protect). Buttons display labels and are disabled when the
  adapter cannot execute the command. No fake P2b support.
- Sidebar: page thumbnails (reuses the original tile thumbnail scheduler,
  and lazily renders PDF.js thumbnails only in non-tile mode), bookmarks,
  Find results, and host Comments entry points. Open/close using the
  navigation toggle. Resize the sidebar via pointer drag or focus the
  separator and press Left/Right. Width stays between 180–370px.
- Bookmarks: for non-tile documents the component uses on-demand PDF.js
  `getOutline()`. In tilesOnly mode PDF.js is **not** loaded; hosts may
  optionally expose `adapter.listBookmarks(): Promise<Array<{
  title:string; page:number }>>` (pages are 1-based). This additive
  optional adapter is not required for existing hosts.
- Right inspector: existing P1 Style bar, P2 Form/Fill and P3
  Redact/Measure/Replace panels; edits still go through the same
  ordered `applyChanges` list. Panels do not reduce document height.
- Reader: continuous tile/canvas pages; initial Fit width is capped at
  **105% desktop / 125% tablet**. Status bar has Fit width, Fit page,
  and 50/75/100/125/150/200% presets. Explicit zoom can exceed the
  initial-fit cap, respecting the preexisting `zoom * DPR <= 16` tile bound.
- Shortcuts while editor is focused: Ctrl/Cmd+F opens sidebar Find,
  Ctrl/Cmd+S Save (Redact still requires destructive confirmation),
  Ctrl/Cmd+Z undo, Ctrl/Cmd+Y redo, PageUp/Down navigate pages,
  +/- zoom, Space+drag and middle-button drag pan tile pages. Keyboard
  typing inside an input is not overridden by unmodified page/zoom keys.
- PDF Save notes remain a dismissible toast over the editor, without
  changing PDF document area. Existing mobile AppShell remains unmodified.

## Verification

```bash
npm ci --ignore-scripts
npm run build --workspace=@tpdf/pdf-editor
npm run typecheck --workspace=@tpdf/pdf-editor
npm test --workspace=@tpdf/pdf-editor
HOST_DIR=$(node examples/next-host/scripts/stage.mjs)
cd "$HOST_DIR" && pnpm install --no-frozen-lockfile
pnpm exec playwright install chromium
pnpm exec playwright test
```

Next host test: `/office/pdf?tiles=1&tileonly=1&shell=app&p1=1&p2=1&p3=1`.
For embedded-width checks append `&embedwidth=600`.
The Playwright suite covers 1280x800, 1024x768, 768x1024, 375x812,
host tools, bookmarks, Find, P3 inspector, resize and shortcuts.

**Boundary:** 360i PyMuPDF persistence and legacy PDF editor contracts
are unchanged. Tile-only bookmarks require the optional host endpoint.
The Comments tab invokes host-supplied comment tools rather than creating
an independent comment database or Tpdf login.
