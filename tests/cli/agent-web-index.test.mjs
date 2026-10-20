import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createAgentWebIndex } from "../../server/tpdf-agent-web-index.mjs";

test("index persisted per tenant, reused, stale when PDF is replaced", async () => {
  const root = await mkdtemp(join(tmpdir(), "tpdf-index-test-"));
  try {
    const storage = { active: () => ({ tenantRoot: root }) };
    const doc = { id: "test-doc", pdfPath: join(root, "test.pdf") };
    await writeFile(doc.pdfPath, "%PDF-1.4 test");
    let extractions = 0;
    const index = createAgentWebIndex({ tenantRuntime: storage, extract: async () => {
      extractions++;
      return { pageCount: 2, pages: [{ page: 1, text: "Bản vẽ đường điện" }, { page: 2, text: "Bản vẽ kiến trúc" }] };
    } });
    const [a, b] = await Promise.all([index.build(doc), index.build(doc)]);
    assert.equal(a.pageCount, b.pageCount);
    assert.equal(extractions, 1);
    const matches = await index.search(doc, "duong dien");
    assert.equal(matches.results[0].page, 1);
    assert.equal(extractions, 1);
    assert.equal((await index.pages(doc, 2, 1)).pages[0].page, 2);
    await writeFile(doc.pdfPath, "%PDF-1.4 changed contents");
    assert.equal(await index.read(doc), null);
    await index.build(doc);
    assert.equal(extractions, 2);
  } finally { await rm(root, { recursive: true, force: true }); }
});
test("range and search validation rejects invalid input", async () => {
  const root = await mkdtemp(join(tmpdir(), "tpdf-index-input-"));
  try {
    const doc = { id: "validation", pdfPath: join(root, "file.pdf") };
    await writeFile(doc.pdfPath, "%PDF");
    const index = createAgentWebIndex({ tenantRuntime: { active: () => ({ tenantRoot: root }) },
      extract: async () => ({ pageCount: 1, pages: [{ page: 1, text: "hello" }] }) });
    await assert.rejects(() => index.pages(doc, 0, 2));
    await assert.rejects(() => index.pages(doc, 1, 26));
    await assert.rejects(() => index.search(doc, ""));
  } finally { await rm(root, { recursive: true, force: true }); }
});
