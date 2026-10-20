import { readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { assertDocumentId, sanitizeFileName } from "./tpdf-storage.mjs";
import { createAgentWebText } from "./tpdf-agent-web-text.mjs";

export function createAgentWebApi({ auth, tenantRuntime, storage, ocrQueue, sendJson, sendError, readJsonBody, maxBytes }) {
  const text = createAgentWebText({ storage });
  const prefix = "/api/tpdf/agent/v1";
  const scoped = (req, url) => tenantRuntime.run(
    auth.authorize(req, url).user,
    auth.authorizeIdentity.projectId,
    () => {},
  );
  async function loadDocument(id) {
    const record = await storage.getDocument(assertDocumentId(id));
    if (!record || record.size <= 0) throw Object.assign(new Error("Document not found."), { statusCode: 404 });
    if (storage.ensureDocumentFile && !await storage.ensureDocumentFile(id)) {
      throw Object.assign(new Error("Document unavailable."), { statusCode: 404 });
    }
    return record;
  }
  async function storeNew(bytes, name) {
    if (bytes.length < 5 || Buffer.from(bytes).subarray(0, 5).toString("ascii") !== "%PDF-") {
      throw Object.assign(new Error("Invalid PDF."), { statusCode: 400 });
    }
    if (bytes.length > maxBytes) throw Object.assign(new Error("PDF too large."), { statusCode: 413 });
    await tenantRuntime.assertCanAdd(bytes.length);
    const record = await storage.createDocument(sanitizeFileName(name));
    try {
      await writeFile(record.tempPath, bytes);
      await rename(record.tempPath, record.pdfPath);
      const saved = await storage.finalizeDocument(record.id, bytes.length);
      return { id: saved.id, fileName: saved.fileName, size: saved.size, url: `${prefix}/documents/${saved.id}/file` };
    } catch (error) {
      await storage.removeDocument(record.id).catch(() => {});
      throw error;
    }
  }
  async function streamUpload(req) {
    const chunks = [];
    let size = 0;
    for await (const chunk of req) {
      size += chunk.length;
      if (size > maxBytes) throw Object.assign(new Error("PDF too large."), { statusCode: 413 });
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  }
  async function mutate(record, body) {
    const { PDFDocument, degrees } = await import("pdf-lib");
    const source = await PDFDocument.load(await readFile(record.pdfPath), { updateMetadata: false });
    const pageCount = source.getPageCount();
    const validPage = (n) => Number.isInteger(n) && n >= 1 && n <= pageCount;
    let output = source;
    if (body.type === "rotate") {
      if (![90, 180, 270, -90, -180, -270].includes(body.degrees)) throw new Error("Invalid rotation.");
      const target = body.pages ?? Array.from({ length: pageCount }, (_, i) => i + 1);
      if (!Array.isArray(target) || target.some((n) => !validPage(n))) throw new Error("Invalid pages.");
      for (const n of target) {
        const page = source.getPage(n - 1);
        page.setRotation(degrees((page.getRotation().angle + body.degrees + 360) % 360));
      }
    } else if (["delete", "reorder", "split"].includes(body.type)) {
      let pages;
      if (body.type === "delete") {
        if (!Array.isArray(body.pages) || !body.pages.length || body.pages.some((n) => !validPage(n))) throw new Error("Invalid pages.");
        const removed = new Set(body.pages);
        pages = Array.from({ length: pageCount }, (_, i) => i + 1).filter((n) => !removed.has(n));
      } else {
        pages = body.pages;
        if (!Array.isArray(pages) || !pages.length || pages.some((n) => !validPage(n))) throw new Error("Invalid pages.");
        if (body.type === "reorder" && (pages.length !== pageCount || new Set(pages).size !== pageCount)) throw new Error("Invalid page order.");
      }
      if (!pages.length) throw new Error("Cannot remove every page.");
      output = await PDFDocument.create();
      const copied = await output.copyPages(source, pages.map((n) => n - 1));
      copied.forEach((page) => output.addPage(page));
    } else if (body.type === "crop") {
      if (!Array.isArray(body.pages) || body.pages.some((n) => !validPage(n)) ||
          ![body.x, body.y, body.width, body.height].every((n) => Number.isFinite(n) && n >= 0) ||
          body.width <= 0 || body.height <= 0) throw new Error("Invalid crop.");
      body.pages.forEach((n) => source.getPage(n - 1).setCropBox(body.x, body.y, body.width, body.height));
    } else if (body.type === "fill-form") {
      const form = source.getForm();
      if (!body.fields || typeof body.fields !== "object" || Array.isArray(body.fields)) throw new Error("Invalid fields.");
      for (const [name, value] of Object.entries(body.fields)) {
        if (typeof value !== "string") throw new Error("Form values must be strings.");
        form.getTextField(name).setText(value);
      }
    } else if (body.type === "merge") {
      if (!Array.isArray(body.documentIds) || !body.documentIds.length || body.documentIds.length > 10) throw new Error("Invalid documentIds.");
      for (const id of body.documentIds) {
        const second = await loadDocument(id);
        const other = await PDFDocument.load(await readFile(second.pdfPath));
        const copied = await source.copyPages(other, other.getPageIndices());
        copied.forEach((page) => source.addPage(page));
      }
    } else {
      throw Object.assign(new Error("Unsupported operation."), { statusCode: 400 });
    }
    return storeNew(Buffer.from(await output.save()), `version-${record.fileName}`);
  }
  async function dispatch(req, res, url) {
    if (url.pathname === prefix + "/documents" && req.method === "POST") {
      const saved = await storeNew(await streamUpload(req), url.searchParams.get("name") || "upload.pdf");
      return sendJson(res, 201, { document: saved });
    }
    const match = url.pathname.match(/^\/api\/tpdf\/agent\/v1\/documents\/([0-9a-f-]{36})(?:\/(info|text|search|file|operations|ocr))?$/i);
    if (match) {
      const record = await loadDocument(match[1]);
      const action = match[2] || "info";
      if (action === "file" && req.method === "GET") {
        const data = await readFile(record.pdfPath);
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Cache-Control", "no-store");
        res.setHeader("Content-Length", String(data.length));
        res.end(data);
        return;
      }
      if (action === "info" && req.method === "GET") return sendJson(res, 200, { id: record.id, name: record.fileName, size: record.size });
      if (action === "text" && req.method === "GET") return sendJson(res, 200, await text.extract(record, url.searchParams));
      if (action === "search" && req.method === "POST") {
        const body = await readJsonBody(req, 16_384);
        return sendJson(res, 200, await text.search(record, String(body.query || "")));
      }
      if (action === "operations" && req.method === "POST") {
        if (record.size > maxBytes) return sendError(res, 413, "Operation input too large.");
        try {
          const saved = await mutate(record, await readJsonBody(req, 256 * 1024));
          return sendJson(res, 201, { document: saved, sourceDocumentId: record.id });
        } catch (error) {
          if (error.statusCode) throw error;
          return sendError(res, 400, error.message);
        }
      }
      if (action === "ocr" && req.method === "POST") {
        const job = ocrQueue.enqueue(record.filePath, "eng+vie");
        const inputPath = join(tenantRuntime.active().tenantRoot, "ocr", job.id, "agent-input.pdf");
        const { mkdir } = await import("node:fs/promises");
        await mkdir(join(tenantRuntime.active().tenantRoot, "ocr", job.id), { recursive: true });
        await writeFile(inputPath, await readFile(record.pdfPath));
        await ocrQueue.submit(job.id, inputPath);
        return sendJson(res, 202, { jobId: job.id, status: "queued" });
      }
      return sendError(res, 405, "Method not allowed.");
    }
    const job = url.pathname.match(/^\/api\/tpdf\/agent\/v1\/ocr\/jobs\/([0-9a-f-]{36})(?:\/(output|cancel))?$/i);
    if (job) {
      if (job[2] === "cancel" && req.method === "POST") return sendJson(res, 200, ocrQueue.cancel(job[1]));
      if (job[2] === "output" && req.method === "GET") {
        const output = await ocrQueue.getOutput(job[1]);
        if (!output) return sendError(res, 404, "OCR output not ready.");
        const saved = await storeNew(output.bytes, "ocr-result.pdf");
        return sendJson(res, 201, { document: saved });
      }
      if (!job[2] && req.method === "GET") {
        const info = ocrQueue.get(job[1]);
        return info ? sendJson(res, 200, info) : sendError(res, 404, "Job not found.");
      }
      return sendError(res, 405, "Method not allowed.");
    }
    return sendError(res, 404, "Agent Web route not found.");
  }
  return async (req, res, url) => {
    if (!auth.enabled || !tenantRuntime.authEnabled) return sendError(res, 503, "Agent Web requires configured bridge and Tpdf tenant isolation.");
    let identity;
    try { identity = auth.authorize(req, url); }
    catch (error) { return sendError(res, error.statusCode || 401, error.message); }
    try { return await tenantRuntime.run(identity.user, identity.projectId, () => dispatch(req, res, url)); }
    catch (error) { return sendError(res, error.statusCode || 500, error.message); }
  };
}
