import { mkdir, readFile, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { runRasterWorker } from "./tpdf-agent-web-render-jobs.mjs";

// Use the proven server raster-export path if PDFium produces an OCR-empty image.
// This is optional: when PyMuPDF/Pillow is absent, OCR must fail explicitly.
export function createOcrRasterFallback(pdfPath, outputRoot) {
  const fallbackRoot = join(outputRoot, "ocr-retry");
  return {
    async renderPage(index) {
      await mkdir(fallbackRoot, { recursive: true });
      const result = await runRasterWorker({
        type: "export-images", pdf: pdfPath,
        pages: [index + 1], format: "png", dpi: 150, dir: fallbackRoot,
      }, undefined, { timeoutMs: 45_000 });
      const outputPath = result.images?.[0]?.path;
      if (outputPath !== join(fallbackRoot, String(index + 1) + ".png")) {
        throw new Error("OCR fallback returned an invalid image path.");
      }
      if ((await stat(outputPath)).size > 15 * 1024 * 1024) {
        throw new Error("OCR fallback image exceeds 15 MiB.");
      }
      const bytes = await readFile(outputPath);
      if (bytes.length < 24 || bytes.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") {
        throw new Error("OCR fallback renderer returned a non-PNG image.");
      }
      return { bytes: new Uint8Array(bytes), width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
    },
    cleanup: () => rm(fallbackRoot, { recursive: true, force: true }),
  };
}
