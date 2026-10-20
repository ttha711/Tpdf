import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createAgentWebIndex } from "../../server/tpdf-agent-web-index.mjs";
import { runRasterWorker } from "../../server/tpdf-agent-web-render-jobs.mjs";
import { createOcrJobQueue } from "../../server/tpdf-ocr-queue.mjs";

// Explicit opt-in: Tesseract may download eng/vie language data.
// Run with TPDF_OCR_E2E=1 only when language assets are available or
// network download is approved; offline default must not break CLI tests.
test("raster export -> server OCR -> text endpoint backend extracts Fire escape",
  { skip: process.env.TPDF_OCR_E2E !== "1", timeout: 180_000 }, async () => {
    const { PDFDocument } = await import("pdf-lib");
    const dir = await mkdtemp(join(tmpdir(), "tpdf-ocr-raster-"));
    let queue;
    try {
      const original = await PDFDocument.create();
      original.addPage([612, 792]).drawText("Page one", { x: 90, y: 700, size: 14 });
      original.addPage([612, 792]).drawText("Fire escape width minimum 1.2 m for corridors",
        { x: 85, y: 675, size: 14 });
      const originalPath = join(dir, "source.pdf");
      await writeFile(originalPath, await original.save());
      const rendered = await runRasterWorker({ type: "export-images", pdf: originalPath,
        pages: [2], format: "png", dpi: 150, dir }, new AbortController().signal);
      const png = await readFile(rendered.images[0].path);
      const raster = await PDFDocument.create();
      const image = await raster.embedPng(png);
      raster.addPage([image.width, image.height]).drawImage(image, {
        x: 0, y: 0, width: image.width, height: image.height,
      });
      const inputPath = join(dir, "raster.pdf");
      await writeFile(inputPath, await raster.save());
      const index = createAgentWebIndex({ tenantRuntime: { active: () => ({ tenantRoot: dir }) } });
      const record = { id: "raster-input", pdfPath: inputPath };
      assert.equal((await index.pages(record, 1, 1)).pages[0].text.trim(), "");
      queue = createOcrJobQueue(dir);
      await queue.ensure();
      const job = queue.enqueue("raster.pdf", "eng");
      const workDir = join(dir, "ocr", job.id);
      await mkdir(workDir, { recursive: true });
      const source = join(workDir, "input.pdf");
      await writeFile(source, await readFile(inputPath));
      await queue.submit(job.id, source);
      let status;
      for (let retry = 0; retry < 300; retry++) {
        status = queue.get(job.id);
        if (["done", "failed", "cancelled"].includes(status?.status)) break;
        await new Promise((resolve) => setTimeout(resolve, 300));
      }
      assert.equal(status?.status, "done", status?.error || "OCR timed out.");
      const output = await queue.getOutput(job.id);
      assert.ok(output?.bytes?.length);
      const resultPath = join(dir, "ocr-result.pdf");
      await writeFile(resultPath, output.bytes);
      const extracted = await index.pages({ id: "ocr-result", pdfPath: resultPath }, 1, 1);
      assert.match(extracted.pages[0].text, /Fire escape/i);
    } finally { await rm(dir, { recursive: true, force: true }); }
  });
