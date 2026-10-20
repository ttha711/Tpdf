import test from "node:test";
import assert from "node:assert/strict";
import { usefulOcrText, assertSearchableOcr } from "../../server/tpdf-ocr-verification.mjs";

test("OCR never mistakes engine metadata for actual native text", () => {
  assert.equal(usefulOcrText({ page: 0, words: [] }), false);
  assert.equal(usefulOcrText(""), false);
  assert.equal(usefulOcrText("Fire escape"), true);
  assert.equal(usefulOcrText("Đường thoát hiểm"), true);
});
test("OCR output without new extractable text is rejected", () => {
  assert.throws(() => assertSearchableOcr([""], [""]), /page 1/);
  assert.throws(() => assertSearchableOcr(["", ""], ["Fire escape", ""]), /page 2/);
  assert.throws(() => assertSearchableOcr([""], []), /page count/);
  assert.deepEqual(assertSearchableOcr([""], ["Fire escape"]), { recognizedPages: 1, pageCount: 1 });
});
