# P3 proposal — verification and host behavior (not implemented)

The authoritative proposed TypeScript unions are in
[PDF_EDITOR_PACKAGE.md](./PDF_EDITOR_PACKAGE.md#p3-proposed-contract--draft-waiting-for-360i-confirmation).
This document records semantics, validation, and questions requiring approval.
**Do not implement in the package, server, or UI before 360i signs off.**

## Common geometry and versioning

- `schemaVersion:1`; additions to ordered `PdfChange[]` sent unchanged
  through existing `applyChanges()`. Existing P1/P2 data are unchanged.
- `PdfRegion.page` and `P3PageCalibration.page` use 1-based page numbering.
  `regions` and `points` are displayed-page percentages, 0..100, after
  rotation, origin top-left. Page-relative distance calculations require the
  page's rotated width/height in PDF points, **not** a Euclidean distance
  between unscaled x/y percentages.
- Host validates all page bounds, finite values, metadata version, shape
  minimum vertices, duplicate calibration IDs and authorization. No source
  URL, bytes or PDF document data are sent as a P3 change.

## Redact: truly destructive, not Cover

- `{kind:"redact",schemaVersion:1,regions:[],terms:["..."],pages:[1,2]}`.
  Regions only / terms only / both are permitted, but at least one must be
  nonempty. Terms are literal, nonempty and not regular expressions; the host
  must return accurate match counts and candidate rectangles for preview.
  Terms require explicit page numbers. For whole-document terms, the UI
  intentionally sends an enumerated list of all eligible pages.
- Before submitting **any batch containing a redact change**, display an
  explicit confirmation dialog identifying the pages, number of selections,
  searched terms, and consequences. A normal Save click alone is insufficient.
  A redraw/overlay is not a substitute for content erasure. Staged edits can
  be undone until save, but the redaction in the **new** PDF is irreversible.
- PyMuPDF processing must remove matching PDF text and overlapping original
  image pixels in the redacted region, not only draw a dark rectangle.
  The host should validate the resulting PDF so the erased content is not
  extractable or recoverable from the resulting file content; on uncertainty,
  **fail closed**, report the issue and do not claim success.
- This does **not** automatically erase history, cached copies, previous
  versions, original attachments, metadata, or backups. 360i decides their
  retention and privacy policy. Host capability `secureErase:true` is an
  explicit claim it can enforce the required new-version behavior.
- P3 capability gates:
  - region marking requires `redact.secureErase && redact.regions`;
  - text-term redaction also requires `redact.terms`;
  - missing flags disable the action and show “Sắp có” / “Coming soon”.
  The preview must clearly read *Pending redaction* until host confirms save.

## Measure and calibration

- `measure.calibrate` is an ordered change that installs/updates the active
  `P3PageCalibration` for one page. Its `points` are two *distinct*
  points that represent `realLength > 0` in the declared physical unit.
  Calibration has a stable unique `id` for tracking across versions.
- `measure` has `type` and page-specific `points`, and includes a
  **snapshot** of `P3PageCalibration`. The host verifies the snapshot and
  recomputes the ratio using the displayed page dimensions and native PDF
  coordinate transform. Never rely on an unvalidated client-computed label
  or scalar. Units are mm/cm/m/in/ft; areas display their squared units.
- Distance = exactly two points (Line); Perimeter = closed polygonal
  boundary (>=3 vertices, PolyLine); Area = polygon (>=3 vertices, Polygon).
  Repeated closing endpoint may be normalized by the host; prevent
  zero-length edges and self-intersecting Area polygons or return a clear error.
  Measurements are PDF annotations with a derived visible label, not just
  a browser overlay.
- Exactly one **active** calibration per page for future marks. Changing it
  later does not reinterpret saved measurements because each contains a
  snapshot. `listPageCalibrations()` is a **proposed optional** host route
  supplying persisted calibrations and `versionId` for new sessions. Reject
  stale version responses. Without an active calibration, disable Measure.
- Independent gates: `measure.calibrate` is needed to set the scale;
  `measure.distance/perimeter/area` unlock their respective tools only
  when also supported by host. Other Measure tools remain disabled.

## Replace text (content editing, not secure erasure)

- `text.replace` searches literal Unicode text and supplies replacement.
  `scope` must be precisely one of displayed-page region, explicit 1-based
  pages, or whole document. Empty `search` and empty `pages[]` are invalid.
  Replacement may be empty **only if host accepts deletion semantics**:
  approval required. Recommend previewing affected text and reporting the
  number of replacements before applying.
- The host should remove old visible text before inserting replacement, but
  its chosen closest available **base font** can change appearance, width,
  line breaks and alignment. This is not guaranteed to preserve original
  fonts/layout. If PyMuPDF cannot edit a particular text run reliably, reject
  it and surface an actionable error rather than silently skipping.
- `text.replace` is not a secure redaction API and must not be marketed
  as such. UI should confirm document-wide replacements.
- Scope-specific flags `replaceText.region/pages/document` default to false.
  If only region is supported, the whole-document option must stay locked.

## Questions for 360i sign-off

1. Is `terms[]` redaction literal **case-sensitive** by default, or should a
   `matchCase` setting be part of the union? How will 360i preview the
   exact matched regions/count before irreversible save?
2. For Perimeter: should an **open** polyline report total path length,
   or should P3 enforce the **closed polygonal perimeter** above?
3. Is `listPageCalibrations()` acceptable, and should saved calibration
   metadata live outside PDF annotations or inside 360i document versions?
4. For Replace text: may `replacement=""` delete matched runs, and should
   `caseSensitive` default to true or false? Confirm closest-base-font
   warning and document-wide confirmation.
5. Does 360i want separate capability flags for term-redaction previews or
   a single `secureErase` guarantee plus `regions/terms` as proposed?

No source files, TypeScript exports, UI commands, Playwright tests or PyMuPDF
implementations are included in this documentation-only PR.
