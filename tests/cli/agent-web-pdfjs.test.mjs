import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { extractPdfPages } from "../../server/tpdf-agent-web-index.mjs";

let pdfLib = null, pdfJsAvailable = false;
try {
  pdfLib = await import("pdf-lib");
  await import("pdfjs-dist/legacy/build/pdf.mjs");
  pdfJsAvailable = true;
} catch {
  // Dependencies are optional for isolated tests; run after npm ci.
}
test("real PDF.js server worker extracts cited text page by page", { skip: !pdfJsAvailable }, async () => {
  const root = await mkdtemp(join(tmpdir(), "tpdf-pdfjs-extract-"));
  try {
    const doc = await pdfLib.PDFDocument.create();
    const first = doc.addPage([612, 792]);
    first.drawText("Ground floor revision", { x: 50, y: 700 });
    const second = doc.addPage([612, 792]);
    second.drawText("Second floor construction", { x: 50, y: 700 });
    const path = join(root, "sample.pdf");
    await writeFile(path, await doc.save());
    const result = await extractPdfPages(path, 1, 2, 20_000);
    assert.equal(result.pageCount, 2);
    assert.deepEqual(result.pages.map((page) => page.page), [1, 2]);
    assert.match(result.pages[0].text, /Ground floor revision/);
    assert.match(result.pages[1].text, /Second floor construction/);
  } finally { await rm(root, { recursive: true, force: true }); }
});
