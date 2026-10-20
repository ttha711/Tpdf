import test from "node:test";
import assert from "node:assert/strict";
import { PDFDocument } from "pdf-lib";
import { applyChanges } from "../dist/pdfChanges.js";

test("highlight changes PDF bytes without mutating source PDF", async () => {
  const original = await PDFDocument.create();
  original.addPage([400, 400]).drawText("Hello", { x: 50, y: 250 });
  const bytes = new Uint8Array(await original.save());
  const result = await applyChanges(bytes, [
    { kind: "mark", mark: { type: "highlight", region: {
      page: 1, x: 10, y: 10, width: 35, height: 15, note: "" } } },
  ]);
  assert.notDeepEqual(result, bytes);
  assert.equal((await PDFDocument.load(result)).getPageCount(), 1);
  assert.equal((await PDFDocument.load(bytes)).getPageCount(), 1);
});
test("page operations retain order and produce new page count", async () => {
  const original = await PDFDocument.create();
  for (let i = 0; i < 3; i++) original.addPage([400, 400]).drawText("page" + i);
  const output = await applyChanges(new Uint8Array(await original.save()), [
    { kind: "delete", page: 2 },
    { kind: "move", page: 2, to: 1 },
    { kind: "insert", page: 1 },
    { kind: "rotate", page: 1 },
  ]);
  const doc = await PDFDocument.load(output);
  assert.equal(doc.getPageCount(), 3);
  assert.equal(doc.getPage(0).getRotation().angle, 90);
});
