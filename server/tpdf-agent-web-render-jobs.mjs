import { spawn } from "node:child_process";
import { mkdir, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

const workerPath = fileURLToPath(new URL("./workers/agent_web_worker.py", import.meta.url));
const error = (message, statusCode = 400) => Object.assign(new Error(message), { statusCode });
const UUID = /^[0-9a-f-]{36}$/i;

export function validateImageRequest(request) {
  if (!Array.isArray(request.pages) || request.pages.length < 1 || request.pages.length > 8 ||
      request.pages.some((n) => !Number.isInteger(n) || n < 1) ||
      !["png", "jpeg"].includes(request.format) ||
      !Number.isInteger(request.dpi) || request.dpi < 36 || request.dpi > 180) {
    throw error("Use 1-8 pages, png/jpeg, and 36-180 DPI.");
  }
}
export function runRasterWorker(spec, signal, options = {}) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(error("Job cancelled.", 409));
    const child = spawn(options.python || process.env.TPDF_PYTHON_PATH || "python3",
      ["-u", options.script || workerPath], { stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
    let stdout = "", stderr = "", done = false;
    const finish = (err, data) => {
      if (done) return;
      done = true; clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      if (err) reject(err); else resolve(data);
    };
    const abort = () => child.kill("SIGKILL");
    if (signal?.aborted) abort();
    signal?.addEventListener("abort", abort, { once: true });
    const timer = setTimeout(abort, options.timeoutMs || 100_000);
    child.stdout.on("data", (part) => {
      stdout += part.toString();
      if (stdout.length > 2_000_000) abort();
    });
    child.stderr.on("data", (part) => { stderr = (stderr + part.toString()).slice(-1000); });
    child.once("error", (cause) => finish(error(cause.message, 503)));
    child.once("close", (code) => {
      if (signal?.aborted) return finish(error("Job cancelled.", 409));
      let result;
      try { result = JSON.parse(stdout); }
      catch { return finish(error(stderr || "Raster worker exited without JSON.", 503)); }
      if (code !== 0 || result.error) return finish(error(result.error || stderr || "Raster worker failed.", 422));
      finish(null, result);
    });
    child.stdin.on("error", () => {});
    child.stdin.end(JSON.stringify(spec));
  });
}
export function createAgentWebJobExecutor({ tenantRuntime, loadDocument, storeNew, mutate, maxBytes }) {
  return async function execute(request, signal, jobId = randomUUID()) {
    if (!UUID.test(request.documentId)) throw error("Invalid source documentId.");
    const source = await loadDocument(request.documentId);
    if (source.size > maxBytes) throw error("Source PDF exceeds operation size limit.", 413);
    if (signal.aborted) throw error("Cancelled.", 409);
    if (request.type === "merge" || request.type === "split") {
      const saved = await mutate(source, request, signal);
      return { documentId: saved.id, document: saved };
    }
    const { PDFDocument, rgb } = await import("pdf-lib");
    const root = join(tenantRuntime.active().tenantRoot, "agent-web-jobs", jobId);
    await mkdir(root, { recursive: true });
    let succeeded = false;
    try {
      if (request.type === "export-images") {
        validateImageRequest(request);
        const rendered = await runRasterWorker({ type: "export-images", pdf: source.pdfPath,
          pages: request.pages, format: request.format, dpi: request.dpi, dir: root }, signal);
        const output = await PDFDocument.create();
        for (const image of rendered.images) {
          if (signal.aborted) throw error("Cancelled.", 409);
          const bytes = await readFile(image.path);
          const embedded = request.format === "png" ? await output.embedPng(bytes) : await output.embedJpg(bytes);
          const p = output.addPage([embedded.width, embedded.height]);
          p.drawImage(embedded, { x: 0, y: 0, width: embedded.width, height: embedded.height });
        }
        const saved = await storeNew(Buffer.from(await output.save()), "raster-pages.pdf");
        succeeded = true;
        return { documentId: saved.id, document: saved,
          images: rendered.images.map((image) => ({ page: image.page, format: image.format,
            url: "/api/tpdf/agent/v1/jobs/" + jobId + "/images/" + image.page })) };
      }
      if (request.type === "compare") {
        if (!UUID.test(request.otherDocumentId)) throw error("Invalid comparison documentId.");
        const other = await loadDocument(request.otherDocumentId);
        if (other.size > maxBytes) throw error("Comparison PDF exceeds operation size limit.", 413);
        const diff = await runRasterWorker({ type: "compare", left: source.pdfPath, right: other.pdfPath }, signal);
        const doc = await PDFDocument.load(await readFile(source.pdfPath));
        for (const difference of diff.differences) {
          if (signal.aborted) throw error("Cancelled.", 409);
          if (difference.page > doc.getPageCount()) continue;
          const p = doc.getPage(difference.page - 1), box = difference.region;
          const { width, height } = p.getSize();
          p.drawRectangle({ x: width * box.x / 100, y: height * (1 - (box.y + box.height) / 100),
            width: width * box.width / 100, height: height * box.height / 100,
            borderColor: rgb(1, 0.1, 0.1), borderWidth: 1.2 });
        }
        const saved = await storeNew(Buffer.from(await doc.save()), "comparison.pdf");
        succeeded = true;
        return { documentId: saved.id, document: saved, ...diff };
      }
      throw error("Unknown job operation.");
    } finally {
      if (!succeeded) await rm(root, { recursive: true, force: true });
      else if (request.type === "compare") await rm(root, { recursive: true, force: true });
    }
  };
}
