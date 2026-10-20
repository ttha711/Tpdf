import test from "node:test";
import assert from "node:assert/strict";
import { normalizeVietnamese, tokenize, rankPages } from "../../server/tpdf-agent-web-ranking.mjs";

test("Vietnamese accents and d-stroke normalize", () => {
  assert.equal(normalizeVietnamese("Đường Điện, HỒ SƠ"), "duong dien, ho so");
  assert.deepEqual(tokenize("BẢN VẼ 2"), ["ban", "ve", "2"]);
});
test("BM25 ranks relevant pages with precise page citations", () => {
  const matches = rankPages([
    { page: 2, text: "Bản vẽ hệ thống điều hòa khí" },
    { page: 3, text: "Điều hòa điều hòa điều hòa cho tầng trệt" },
    { page: 4, text: "Mặt bằng kết cấu trệt" },
  ], "dieu hoa");
  assert.deepEqual(matches.map((m) => m.page), [3, 2]);
  assert.ok(matches[0].score > matches[1].score);
  assert.match(matches[0].snippet, /Điều hòa/);
});
test("rejects empty and excessive terms", () => {
  assert.throws(() => rankPages([], "?!"), /Invalid/);
  assert.throws(() => rankPages([], Array.from({ length: 31 }, (_, i) => "word" + i).join(" ")), /Invalid/);
});
