> **SUPERSEDED (2026-10-20):** This PDFium/EmbedPDF blocker is historical.
> S1 now uses PDF.js HTTP Range. See [current integration and acceptance](./PDF_VIEWER_LARGE_S1_INTEGRATION.md).
> Do not treat this historical blocker as the state of the latest S1 branch.

# PDF viewer S1 — blocked feasibility gate

Status: **BLOCKED, not delivered**. Checked 2026-10-20.
Branch: `feat/pdf-viewer-large-s1`, forked from `feat/pdf-editor-react-library`
at `3736053619212285ff3686bf1056a4411c5cd38f`.
This is a safety/feasibility record, **not an S1 implementation**.

## Confirmed facts

- Tpdf web viewer: `apps/web/src/components/PdfViewer.tsx` uses
  `@embedpdf/react-pdf-viewer` with `documentManager.initialDocuments: [{url}]`.
- `apps/web/package.json` pins the EmbedPDF/PDFium packages to `2.15.1`.
- Official EmbedPDF `openDocumentUrl` documentation says it downloads
  the **complete file into memory** before opening. Its
  `mode: "range-request"` is not implemented and behaves as full-fetch.
  Source: https://www.embedpdf.com/docs/engines/document-lifecycle/open-document-url
- PDFium's `FPDF_LoadCustomDocument` theoretically accepts a custom
  block-reading callback, but its `m_GetBlock` must return synchronously.
  EmbedPDF documents its browser implementation as blocked on async-fetch
  integration (JSPI); the public example is a non-working placeholder.
  Source: https://www.embedpdf.com/docs/pdfium/functions/FPDF_LoadCustomDocument
- Existing `@tpdf/pdf-editor` uses PDF.js and pdf-lib, not EmbedPDF, and
  accepts the `pdfiumWasmUrl` prop without using it. Replacing PDF.js
  with the current EmbedPDF URL loader would be a memory/network regression.

## Non-negotiable acceptance rule

Do not mark S1 as done unless a real PDFium engine on a 250 MiB/300-page
fixture can show page 1 before receiving 25% of file bytes, within 20 s,
without whole-file buffers or persistent copies, and can scroll 100 pages
with bounded memory. Only partial HTTP GETs (206 with Content-Range) may
deliver PDF file bytes. WASM download is recorded separately.

### HTTP Range host contract (implemented by 360i, not Tpdf)

- `HEAD /file.pdf` returns the correct total `Content-Length` and
  `Accept-Ranges: bytes` (or determine total from a safe `GET bytes=0-0`).
- `GET /file.pdf` with `Range: bytes=0-65535` returns status
  `206 Partial Content`, correct `Content-Range: bytes 0-65535/<total>`,
  `Content-Length: 65536`, and `Accept-Ranges: bytes`.
- Support suffix and final partial ranges, `416` for invalid ranges;
  do **not** silently return `200` with the full PDF for a Range request.
  Provide stable `ETag` / `Last-Modified` where practical.
- Cross-origin: allow 360i's origin, allow `Range` in CORS request headers
  when needed, expose `Content-Range, Content-Length, Accept-Ranges, ETag`;
  for credentials, use an explicit origin, never wildcard. Keep auth host-side.
- These are **requirements**, not an assertion that the example currently
  implements a compliant Range server.

## Acceptance/test status (actual execution)

| Gate | Result | Actual measurement |
| --- | --- | --- |
| `npm run perf:pdf -- --mb 250 --pages 300` | NOT RUN | None |
| Example host HTTP 206 and served-byte logging | NOT IMPLEMENTED | None |
| Playwright Chromium first page <=20 s | NOT RUN | No seconds measured |
| PDF file bytes before first page <25% | BLOCKED by current EmbedPDF full-fetch | No MB measured |
| Scroll 100 pages; CDP/performance.memory plateau | NOT RUN | No MB measured |
| Next 14 at 390 px with *new* engine | NOT RUN | No measurement |
| Package JS gzip and WASM bytes for *new* engine | NOT BUILT | No measured size |
| Existing CLI, OCR-real, package tests | NOT RUN for S1 | No pass claim |

The fixture generator already exists at
`scripts/perf/generate-large-pdf.mjs`. Its requested `--mb` value is
MiB (1024*1024 bytes), not decimal MB. The current Next fixture only
covers two pages and cannot prove the large-file acceptance gate.

## Engineering choices before resuming

1. **Strict PDFium S1:** implement and independently verify a custom
   partial-access PDFium worker/WASM path with synchronous block reads or
   a proven JSPI-compatible runtime. Check memory ownership, request
   deduplication, cancellation, LRU raster budget, viewport-only text,
   and safe disposal. Do not assume this exists in EmbedPDF 2.15.1.
2. **Explicitly changed scope:** permit PDF.js for URL Range on large
   documents and PDFium for smaller ones via an `engine` selector.
   This may meet a large-PDF viewing goal but **does not meet the user's
   PDFium-over-Range S1 requirement**; it requires an explicit scope change.

No engine/runtime/viewer files were changed here. No support for search,
annotations, page editing, or 360i server calls has been introduced.
