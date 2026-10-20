import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { Worker } from "node:worker_threads";
import { rankPages } from "./tpdf-agent-web-ranking.mjs";

const MAX_PAGES = 1500;
const MAX_BYTES = 250 * 1024 * 1024;
function bad(message, statusCode = 400) { return Object.assign(new Error(message), { statusCode }); }

export function extractPdfPages(path, start = 1, count = MAX_PAGES, timeoutMs = 90_000) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./tpdf-agent-web-index-worker.mjs", import.meta.url), {
      workerData: { path, start, count, maxPages: MAX_PAGES, maxBytes: MAX_BYTES },
      resourceLimits: { maxOldGenerationSizeMb: 512 },
    });
    let finished = false;
    const done = (err, data) => {
      if (finished) return;
      finished = true; clearTimeout(timer);
      void worker.terminate();
      if (err) reject(err); else resolve(data);
    };
    const timer = setTimeout(() => done(bad("PDF index worker timed out.", 504)), timeoutMs);
    worker.once("message", (value) => value.error
      ? done(bad(value.error, 422)) : done(null, value));
    worker.once("error", (err) => done(bad(err.message, 503)));
    worker.once("exit", (code) => { if (code !== 0) done(bad("PDF index worker stopped.", 503)); });
  });
}

export function createAgentWebIndex({ tenantRuntime, extract = extractPdfPages }) {
  const running = new Map();
  const indexPath = (id) => join(tenantRuntime.active().tenantRoot, "agent-web-index", id + ".json");
  async function fingerprint(record) {
    const meta = await stat(record.pdfPath);
    if (meta.size > MAX_BYTES) throw bad("PDF indexing size limit exceeded.", 413);
    return String(meta.size) + ":" + String(meta.mtimeMs);
  }
  async function read(record) {
    const version = await fingerprint(record);
    try {
      const data = JSON.parse(await readFile(indexPath(record.id), "utf8"));
      return data.version === version && Array.isArray(data.pages) ? data : null;
    } catch (error) {
      if (error.code === "ENOENT" || error instanceof SyntaxError) return null;
      throw error;
    }
  }
  async function build(record) {
    const existing = await read(record);
    if (existing) return { ...existing, reused: true };
    const scope = tenantRuntime.active().tenantRoot;
    const key = scope + ":" + record.id;
    if (running.has(key)) return running.get(key);
    const promise = (async () => {
      const version = await fingerprint(record);
      const result = await extract(record.pdfPath, 1, MAX_PAGES);
      if (result.pageCount > MAX_PAGES || result.pages.length !== result.pageCount) {
        throw bad("PDF page count exceeds index limit.", 413);
      }
      if (version !== await fingerprint(record)) throw bad("PDF changed during indexing.", 409);
      const data = { documentId: record.id, pageCount: result.pageCount, pages: result.pages, version };
      const target = indexPath(record.id);
      await mkdir(join(scope, "agent-web-index"), { recursive: true });
      const temp = target + "." + randomUUID() + ".tmp";
      try { await writeFile(temp, JSON.stringify(data)); await rename(temp, target); }
      finally { await import("node:fs/promises").then(({ rm }) => rm(temp, { force: true })); }
      return data;
    })().finally(() => running.delete(key));
    running.set(key, promise);
    return promise;
  }
  async function pages(record, start, count) {
    if (!Number.isInteger(start) || start < 1 || !Number.isInteger(count) || count < 1 || count > 25) {
      throw bad("page/count out of range (max 25 pages).");
    }
    const cached = await read(record);
    const result = cached || await extract(record.pdfPath, start, count, 20_000);
    return { documentId: record.id, pageCount: result.pageCount,
      pages: cached ? cached.pages.slice(start - 1, start - 1 + count) : result.pages,
      indexed: Boolean(cached) };
  }
  async function search(record, query) {
    if (typeof query !== "string" || query.length > 200) throw bad("Invalid query.");
    const data = await build(record);
    return { documentId: record.id, pageCount: data.pageCount,
      results: rankPages(data.pages, query), indexedPages: data.pages.length };
  }
  return { build, read, pages, search };
}
