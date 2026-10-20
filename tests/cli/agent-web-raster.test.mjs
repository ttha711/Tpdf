import test from "node:test";
import assert from "node:assert/strict";
import { validateImageRequest, runRasterWorker } from "../../server/tpdf-agent-web-render-jobs.mjs";

test("image export limits prevent unbounded input", () => {
  assert.doesNotThrow(() => validateImageRequest({ pages: [1, 4], dpi: 144, format: "jpeg" }));
  assert.throws(() => validateImageRequest({ pages: Array(9).fill(1), dpi: 72, format: "png" }));
  assert.throws(() => validateImageRequest({ pages: [0], dpi: 72, format: "png" }));
  assert.throws(() => validateImageRequest({ pages: [1], dpi: 300, format: "jpeg" }));
  assert.throws(() => validateImageRequest({ pages: [1], dpi: 72, format: "svg" }));
});
test("raster child can be cancelled before running long job", async () => {
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(() => runRasterWorker({}, controller.signal,
    { python: "node", script: "--version", timeoutMs: 500 }));
});
