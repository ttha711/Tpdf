# Agent Web -> Tpdf Integration (v1 preview)

Branch: `feat/agent-web-bridge-v1`. This is a **partial implementation**, not a production acceptance report.

## Requirements and environment

Node >=22, `npm ci`, `npm run server-build`; server text uses bundled `pdfjs-dist` in an isolated Node worker; raster export/comparison require Python with PyMuPDF and Pillow (`python3 -m pip install "PyMuPDF>=1.24,<2" "Pillow>=10,<13"`). OCR additionally requires the
existing PDFium/OCR runtime. Run behind an HTTPS reverse proxy, bind
`TPDF_HOST=127.0.0.1`, configure `TPDF_PUBLIC_ORIGIN`, and prevent direct
external access to the backend port.

Use `TPDF_AUTH_MODE=local` and `TPDF_AUTH_SECRET` (>=32 chars), with
`TPDF_BOOTSTRAP_EMAIL` / `TPDF_BOOTSTRAP_PASSWORD` when creating a fresh
Tpdf user database. These settings are required for genuine per-user/project
storage isolation. Do **not** set `TPDF_AUTH_MODE=disabled` for the bridge.

Configure (server-only, never `VITE_*`):

- `TPDF_AGENT_WEB_BRIDGE_SECRET` >=32 characters; must match Agent Web
  `TPDF_AGENT_WEB_BRIDGE_SECRET`.
- `TPDF_AGENT_WEB_ORIGINS=https://agent.example.test` comma-separated exact
  parent origins. The **first** is selected as the postMessage target.
- `TPDF_AGENT_WEB_QUOTA_BYTES` optional, defaults to 10 GiB.
- `TPDF_MAX_OPERATION_BYTES` existing cap, defaults to 250 MiB.
- Agent Web `TPDF_AGENT_WEB_BASE_URL=https://pdf.example.test`.

Storage layout, S3 prefix, encryption secrets, existing PDF APIs and auth
sessions are unchanged. Bridge users get a separate deterministic server-side
namespace `agent-web-<sha256(email) prefix>` and their existing
`users/<namespace>/projects/<projectId>` directory. Agent Web project IDs
must match `^[a-z0-9][a-z0-9_-]{0,63}$` (lowercase).

## HMAC contract

Exact header `x-tpdf-agent-web-identity: BASE64URL(JSON).BASE64URL(HMAC_SHA256(secret, BASE64URL(JSON)))`.
Claims: `iss=agent-web`, `aud=tpdf`, `email`, `projectId`, exact
`method`, exact pathname `path` (no query), integer `iat` and `exp`,
random `jti`. TTL cannot exceed 60 seconds. A given `jti` is usable
**once**. No LLM API key is used by the bridge. Browser assets never receive
the shared HMAC secret.

Replay cache and embed sessions are held **in-process**. Deploy a single
instance or implement a shared atomic nonce/session store (e.g. Redis)
before horizontally scaling. A restart invalidates embed sessions; it
also resets seen nonces, so enforce TLS, short TTL and an edge replay store
in high-security/multi-instance deployments.

## API

[OpenAPI v1 preview](agent-web-openapi.yaml) describes implemented tools.
Paths begin `/api/tpdf/agent/v1`:

- `POST /documents?name=filename.pdf`: raw PDF upload; returns `document.id`.
- `GET /documents/{id}`, `GET /documents/{id}/file`: metadata / bytes.
- `GET /documents/{id}/text?page=1&count=5`: text and page numbers, max 25 pages/request.
- `GET /documents/{id}/index` gets index state, `POST /documents/{id}/index` builds a cache of text per page with **pdfjs-dist on the server**; max 1500 pages / 250 MiB / 90s and 12M text characters. No LLM or remote model calls.
- `POST /documents/{id}/search` with `{"query":"..."}` ranks page matches using accent-insensitive BM25: `{results:[{page,snippet,score}], pageCount, indexedPages}`; invalidates cache on PDF size/mtime changes.
- `POST /documents/{id}/operations`: JSON `type` `rotate`, `delete`,
  `reorder`, `split`, `crop`, `merge`, `fill-form`, `mark-region`.
  Successful writes produce **new document IDs**, not in-place updates.
- `POST /jobs` accepts JSON `{"type":"merge"|"split"|"export-images"|"compare", "documentId":"<uuid>", ...}`.
  `GET /jobs/{jobId}` polls, `POST /jobs/{jobId}/cancel` cancels, `GET /jobs/{jobId}/result` returns `{result:{documentId, document, ...}}`.
  Work is scoped to authenticated user/project, capped at 300 combined pages and TPDF_MAX_OPERATION_BYTES combined input for merge/split, and has at most 2 concurrent jobs, 32 waiting slots and 120s deadline.
- For `export-images`: `{"type":"export-images","documentId":"...","pages":[1,3],"dpi":144,"format":"png"}`
  or `jpeg` (1–8 pages, 36–180 DPI, max image 15 MiB, max side 6000px). Result has
  **new rasterized PDF documentId** plus an `images` array of private authenticated
  `GET /jobs/{jobId}/images/{page}` binary URLs.
- For `compare`: `{"type":"compare","documentId":"<uuid>","otherDocumentId":"<uuid>"}`.
  Result has new highlighted PDF documentId and
  `differences:[{page,changedPercent,region:{page,x,y,width,height},status}]`.
  Pixel comparison is approximate (512px grayscale per page, threshold 24), up to
  100 pages, not vector/CAD semantic diff. Added/removed pages get full-page regions.
- `POST /documents/{id}/ocr`, `GET /ocr/jobs/{jobId}`,
  `POST /ocr/jobs/{jobId}/cancel`, `GET /ocr/jobs/{jobId}/output`
  (stores OCR output under a new document ID).

Existing `/api/tpdf/ocr/jobs` and child routes also accept an HMAC identity
header, without changing their existing session-authenticated behavior.
Every request needs its own `jti`. To use an endpoint with method GET,
sign `method=GET`, not the POST used to create a job.

PDF content is untrusted data. Text is never evaluated or injected into
system prompts. Apply prompt-injection boundaries in the Agent Web agent
when using the extracted text. Python workers receive server-resolved paths,
never paths taken from PDF content.

## Embedded viewer

Agent Web signs `GET /api/tpdf/agent/v1/embed/session` and passes the
resulting **one-time HMAC identity token** to:

`https://pdf.example.test/embed/viewer?file=<document-uuid>&token=<signed-identity>`

The iframe exchanges it via the header with `GET /embed/session`, removes
the query immediately and receives a 15-minute session token.
The viewer uses `x-tpdf-embed-session` for project-scoped requests.
Deploy TLS and `Referrer-Policy: no-referrer`; avoid logging raw iframe URLs.
The `frame-ancestors` CSP permits only `TPDF_AGENT_WEB_ORIGINS`.
No wildcard origin is supported.

Parent checks `event.origin === https://pdf.example.test` and
`event.source === iframe.contentWindow`. Viewer validates source and
parent origin for incoming commands.

Viewer -> parent, as `{type, ...properties}`:
- `ready`: `pageCount, documentId`.
- `page-changed`: `page`, 1-based.
- `region-selected`: `page, x, y, width, height, note`. Coordinates
  are page percentages (0..100) measured from top-left.
- `document-saved`: `url, documentId`. Signed access is still required
  to fetch the URL; it is **not** a public download link.

Parent -> viewer: `goto-page {page}`, `set-zoom {zoom}`,
`highlight-region {region}`. One-step undo is for the unsaved selection,
not a persisted PDF version. Viewer now presents **continuous scrolling pages**, lazily paints only visible/near-visible pages, a page grid, and zoom presets **25/50/100/200/Fit**. Typecheck and real-browser behavior still require validation.

## Node signing example (server-side only)

```js
import { createHmac, randomUUID } from "node:crypto";

function signTpdf(method, path, email, projectId) {
  const iat = Math.floor(Date.now() / 1000);
  const payload = {
    iss: "agent-web", aud: "tpdf", email, projectId,
    method, path, iat, exp: iat + 60,
    jti: randomUUID(),
  };
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const signature = createHmac("sha256", process.env.TPDF_AGENT_WEB_BRIDGE_SECRET)
    .update(encoded).digest("base64url");
  return encoded + "." + signature;
}
// Each HTTP request gets a fresh nonce and token with its EXACT method/path.
const path = "/api/tpdf/agent/v1/documents";
const headers = { "x-tpdf-agent-web-identity":
  signTpdf("POST", path, "alice@example.test", "project-1") };
```

Do **not** sign the query string as part of `path`. No secret belongs in frontend
JS or a `VITE_*` variable.

## Tests and remaining limits (2026-10-20)

In this development session, the isolated **local copies** of new Node logic
passed:

```bash
node --test tests/cli/agent-web-ranking.test.mjs
node --test tests/cli/agent-web-index.test.mjs
node --test tests/cli/agent-web-jobs.test.mjs
node --test tests/cli/agent-web-limits.test.mjs
node --test tests/cli/agent-web-raster.test.mjs
node --test tests/cli/agent-web-worker.test.mjs
node --test tests/cli/agent-web-region.test.mjs
```

An additional `tests/cli/agent-web-pdfjs.test.mjs` exercises the real PDF.js
text worker after `npm ci` (it skips when PDF.js/pdf-lib are absent); this
particular parser test was **not executed** in the isolated environment.
The worker test used **generated PDF fixtures** and locally installed
PyMuPDF/Pillow. It conditionally skips when those Python packages are absent.
These are NOT claims that the full checked-out GitHub branch was built or
tested. User previously reported **49/49 existing CLI tests passing and web
typecheck clean** after the two one-line fixes.

Not yet run **on this PR checkout**: `npm ci`, `npm run build`,
`npm run typecheck`, full `node --test tests/cli/*.test.mjs`,
authenticated signed Node HTTP E2E, and browser iframe postMessage E2E.

Known limits:
- Job state and replay nonces live in **process memory**; restart loses jobs
  and sessions. Worker cancellation is effective for Python subprocesses,
  but cannot preempt synchronous in-process pdf-lib CPU work.
- Image artifacts are stored locally beneath the existing scoped project
  tree, in a **new** `agent-web-jobs` directory, and currently lack TTL pruning;
  include them in an explicit retention/cleanup plan before production.
  Indexes are stored in `agent-web-index` (per project), even under S3-backed
  document storage: multi-node access requires shared indexing/cache strategy.
- Page index build is synchronous HTTP work (worker timeout 90s), not yet a
  queue operation. Huge documents may hit gateway HTTP timeouts.
- PDF.js index extraction handles text-only PDFs; scanned images require OCR
  first. PDF comparison requires PyMuPDF/Pillow and has no vector alignment
  or rotation compensation.
- Native standalone PDFium/WASM is kept untouched; server supports PDF Range,
  but network behavior and large-file performance of embedded PDF.js were
  **not measured** in browser. PDF.js might download the full document.
- Region undo only undoes unsaved selection; persisted versions are immutable.
  Annotation objects beyond region marks and other long operations are not
  incorporated into the new job API.

## Security checklist

Use a shared nonce/session store for multiple processes; confirm
`X-Frame-Options` is removed only on `/embed/viewer`, and CSP
`frame-ancestors` is origin-specific. Validate wrong signature,
expired token, replay, path/method mismatch, different project, iframe
origin mismatch, and OCR cancellation. Do not put either secret in Git.

## OCR searchable-text regression (2026-10-20)

A real raster-PDF report showed a `done` OCR job with no extractable text.
The queue previously trusted the PDFium `getNativeText` return value to skip
OCR; a non-empty but non-searchable return can cause a false skip. It now
uses **PDF.js page text** to decide whether native text exists, and verifies
PDF.js-extractable text on **each output page before publishing `done`**.
A missing text layer fails the job with an explicit message. This prevents
silent success but does not by itself guarantee character-level OCR accuracy.

Pure verification tests:
```bash
node --test tests/cli/agent-web-ocr-verification.test.mjs
```

Opt-in raster -> OCR -> PDF.js text regression (can download Tesseract language
assets; requires PyMuPDF, Pillow and Tesseract dependencies):
```bash
TPDF_OCR_E2E=1 node --test tests/cli/agent-web-ocr-raster.test.mjs
```

The regression creates a two-page PDF, exports page 2 to PNG, embeds PNG in a
new raster PDF, runs the real Tpdf OCR queue, and invokes the same
`createAgentWebIndex.pages()` backend used by `GET /text` to assert
`Fire escape`. It is **skipped by default** in offline CLI suites. It is not
an HTTP-level or browser-level integration test. The opt-in OCR regression,
full repo test suite and Node 24 build/typecheck **have not yet been rerun**
for these OCR changes by the assistant; user-provided 63/63 belongs to the
prior commit, not the new OCR commits.
