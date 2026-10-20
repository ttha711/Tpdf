import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { OcrService } from "@tpdf/core";
import { createPdfiumOcrRenderer } from "./tpdf-ocr-renderer.mjs";
import { usefulOcrText, assertSearchableOcr } from "./tpdf-ocr-verification.mjs";
import { extractPdfPages } from "./tpdf-agent-web-index.mjs";
import { randomUUID } from "node:crypto";

function publicJob(job) {
  if (!job) return null;
  const { outputBytes: _outputBytes, outputPath: _outputPath, ...rest } = job;
  return rest;
}

export function createOcrJobQueue(dataDir, options = {}) {
  const service = new OcrService();
  const root = resolve(dataDir, "ocr");
  const requestedConcurrency = Number(options.concurrency || 1);
  const concurrency = Number.isFinite(requestedConcurrency)
    ? Math.max(1, Math.min(Math.trunc(requestedConcurrency), 2))
    : 1;
  const pending = [];
  const inputs = new Map();
  let active = 0;

  async function ensure() {
    await mkdir(root, { recursive: true });
  }

  async function cleanupInput(jobId) {
    const inputPath = inputs.get(jobId);
    inputs.delete(jobId);
    if (inputPath) await rm(inputPath, { force: true }).catch(() => {});
  }

  async function runJob(jobId) {
    const job = service.get(jobId);
    const inputPath = inputs.get(jobId);
    if (!job || !inputPath || job.status === "cancelled") {
      await cleanupInput(jobId);
      return;
    }

    active += 1;
    let renderer;
    try {
      const bytes = new Uint8Array(await readFile(inputPath));
      renderer = await createPdfiumOcrRenderer(bytes);
      // PDF.js parses actual PDF text; PDFium extraction may report metadata
      // or invisible non-searchable content for a raster-only page.
      const nativePages = await extractPdfPages(inputPath);
      const result = await service.run(jobId, bytes, {
        getNativeText: async (pageIndex) => {
          const extracted = nativePages.pages[pageIndex]?.text;
          return usefulOcrText(extracted) ? extracted : "";
        },
        renderPage: (pageIndex) => renderer.renderPage(pageIndex),
        isCancelled: () => service.get(jobId)?.status === "cancelled",
      });
      if (result?.status === "done" && result.outputBytes?.length) {
        // Validate PDF.js text extraction before publishing an OCR result.
        const verificationDir = join(root, jobId);
        await mkdir(verificationDir, { recursive: true });
        const beforePath = join(verificationDir, "verify-input-" + randomUUID() + ".pdf");
        const afterPath = join(verificationDir, "verify-output-" + randomUUID() + ".pdf");
        try {
          await writeFile(beforePath, bytes);
          await writeFile(afterPath, result.outputBytes);
          const before = await extractPdfPages(beforePath);
          const after = await extractPdfPages(afterPath);
          assertSearchableOcr(before.pages.map((item) => item.text),
            after.pages.map((item) => item.text));
        } finally {
          await rm(beforePath, { force: true }).catch(() => {});
          await rm(afterPath, { force: true }).catch(() => {});
        }
        // OcrService marks computation done before this queue has durably written
        // the downloadable output. Keep the public job non-terminal until the
        // output file is ready so poll -> download cannot observe a race.
        result.status = "running";
        result.progress = 99;
        const jobDir = join(root, jobId);
        const outputPath = join(jobDir, "output.pdf");
        await mkdir(jobDir, { recursive: true });
        await writeFile(outputPath, result.outputBytes);
        result.outputPath = outputPath;
        result.outputBytes = undefined;
        result.progress = 100;
        result.status = "done";
      }
    } catch (error) {
      const current = service.get(jobId);
      if (current && current.status !== "cancelled") {
        current.status = "failed";
        current.error = error instanceof Error ? error.message : "OCR failed";
      }
    } finally {
      await renderer?.close?.().catch(() => {});
      await cleanupInput(jobId);
      active -= 1;
      void pump();
    }
  }

  async function pump() {
    while (active < concurrency && pending.length > 0) {
      const jobId = pending.shift();
      if (!jobId) continue;
      const job = service.get(jobId);
      if (!job || job.status === "cancelled") {
        await cleanupInput(jobId);
        continue;
      }
      void runJob(jobId);
    }
  }

  return {
    async ensure() {
      await ensure();
    },

    enqueue(filePath, language = "eng+vie") {
      return publicJob(service.enqueue(filePath, language));
    },

    async submit(jobId, inputPath) {
      const job = service.get(jobId);
      if (!job) return null;
      if (job.status !== "queued") return publicJob(job);
      inputs.set(jobId, inputPath);
      pending.push(jobId);
      void pump();
      return publicJob(job);
    },

    list() {
      return service.list().map(publicJob);
    },

    get(jobId) {
      return publicJob(service.get(jobId));
    },

    cancel(jobId) {
      const job = service.cancel(jobId);
      if (job?.status === "cancelled") {
        const index = pending.indexOf(jobId);
        if (index >= 0) pending.splice(index, 1);
        void cleanupInput(jobId);
      }
      return publicJob(job);
    },

    async getOutput(jobId) {
      const job = service.get(jobId);
      if (!job || job.status !== "done" || !job.outputPath) return null;
      return {
        path: job.outputPath,
        bytes: await readFile(job.outputPath),
      };
    },
  };
}
