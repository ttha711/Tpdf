import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createOcrJobQueue } from "../../server/tpdf-ocr-queue.mjs";

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

test("OCR polling never exposes done before the output is readable", { timeout: 5000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), "tpdf-ocr-status-"));
  const verifying = deferred();
  const release = deferred();
  const job = { id: randomUUID(), filePath: "raster.pdf", language: "eng",
    status: "queued", progress: 0 };
  let reads = 0;
  const service = {
    enqueue: () => job,
    list: () => [job],
    get: (id) => id === job.id ? job : null,
    cancel: () => { job.status = "cancelled"; return job; },
    async run(_id, _bytes, options) {
      assert.equal(await options.getNativeText(0), "");
      const image = await options.renderPage(0);
      assert.equal(image.width, 400);
      job.outputBytes = Buffer.from("%PDF-1.4\nocr text layer fixture");
      job.status = "done"; // Reproduce OcrService's early done.
      job.progress = 100;
      return job;
    },
  };
  const queue = createOcrJobQueue(root, {
    service,
    rendererFactory: async () => ({
      renderPage: async () => ({ bytes: new Uint8Array([137, 80, 78, 71]), width: 400, height: 200 }),
      close: async () => {},
    }),
    extractPages: async () => {
      reads++;
      if (reads === 1 || reads === 2) return { pages: [{ page: 1, text: "" }] };
      if (reads === 3) {
        verifying.resolve();
        await release.promise; // Hold verification while client polls.
        return { pages: [{ page: 1, text: "Fire escape width minimum 1.2 m" }] };
      }
      throw new Error("Unexpected extraction call.");
    },
  });
  try {
    await queue.ensure();
    const input = join(root, "raster.pdf");
    await writeFile(input, "%PDF-1.4\n");
    await queue.submit(job.id, input);
    await Promise.race([verifying.promise, sleep(1500).then(() => { throw new Error("Verification did not start."); })]);
    for (let attempt = 0; attempt < 30; attempt++) {
      const status = queue.get(job.id);
      const output = await queue.getOutput(job.id);
      assert.notEqual(status.status, "done", "Job exposed done during PDF.js verification.");
      assert.equal(output, null, "Output must remain unavailable until verification completes.");
      await sleep(2);
    }
    release.resolve();
    let completed = false;
    for (let attempt = 0; attempt < 200; attempt++) {
      const status = queue.get(job.id);
      const output = await queue.getOutput(job.id);
      assert.ok(status.status !== "done" || output?.bytes?.length,
        "Observed status done while getOutput was empty.");
      if (status.status === "failed") throw new Error(status.error);
      if (status.status === "done") {
        assert.match(Buffer.from(output.bytes).toString("utf8"), /ocr text layer fixture/);
        completed = true;
        break;
      }
      await sleep(5);
    }
    assert.equal(completed, true, "OCR output never reached a readable done state.");
  } finally {
    release.resolve();
    await rm(root, { recursive: true, force: true });
  }
});
