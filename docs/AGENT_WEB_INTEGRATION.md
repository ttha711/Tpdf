# Agent Web -> Tpdf Integration (v1 preview)

Branch: `feat/agent-web-bridge-v1`. This is a **partial implementation**, not a production acceptance report.

## Requirements and environment

Node >=22, `npm ci`, `npm run server-build`; Python with PyMuPDF for server text
(`python3 -m pip install "PyMuPDF>=1.24,<2"`). OCR additionally requires the
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
- `POST /documents/{id}/search` with `{"query":"..." }`: page citations,
  250 pages maximum and explicit `truncated` when incomplete.
- `POST /documents/{id}/operations`: JSON `type` `rotate`, `delete`,
  `reorder`, `split`, `crop`, `merge`, `fill-form`, `mark-region`.
  Successful writes produce **new document IDs**, not in-place updates.
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
not a persisted PDF version. Viewer currently renders one page at a time,
with page grid; continuous-page mode is **not implemented**.

## Explicit limitations / acceptance still required

- No async job/cancel contract for non-OCR operations, no bounded operation
  wall-clock timeout, no page-to-image endpoint, no two-PDF drawing diff,
  and no full annotation object model.
- Text search scans at most 250 pages and has **no persisted no-LLM page index**.
  Existing PageIndex optional integration relies on a model provider key;
  it must **not** be used for Agent Web's Dify-only model policy.
- `/file` currently sends the full PDF; Range-backed embedded PDF.js
  loading is not verified. Existing standalone Tpdf PDFium and remote tile
  renderer are preserved.
- Must run real `npm ci`, `npm run build`, `npm run typecheck`,
  `npm run test --workspace=@tpdf/web`,
  `node --test tests/cli/agent-web-auth.test.mjs`,
  `npm run server-smoke` and a signed browser E2E on a configured host
  before merge. No test passes are claimed here.

## Security checklist

Use a shared nonce/session store for multiple processes; confirm
`X-Frame-Options` is removed only on `/embed/viewer`, and CSP
`frame-ancestors` is origin-specific. Validate wrong signature,
expired token, replay, path/method mismatch, different project, iframe
origin mismatch, and OCR cancellation. Do not put either secret in Git.
