import { spawn } from "node:child_process";

const PYTHON = `
import json, sys
try:
    import pymupdf as fitz
except ImportError:
    import fitz
doc = fitz.open(sys.argv[1])
if doc.needs_pass:
    raise ValueError("Encrypted PDFs are not supported.")
start = max(0, int(sys.argv[2]))
end = min(len(doc), start + int(sys.argv[3]))
pages = []
for index in range(start, end):
    page = doc[index]
    pages.append({"page": index + 1, "text": page.get_text("text")[:80000]})
print(json.dumps({"pageCount": len(doc), "pages": pages}, ensure_ascii=False))
`;

function worker(pdfPath, start, count, timeout = 20_000) {
  return new Promise((resolve, reject) => {
    const python = process.env.TPDF_PYTHON_PATH || "python3";
    const child = spawn(python, ["-c", PYTHON, pdfPath, String(start), String(count)], {
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    let stdout = "", stderr = "";
    const timer = setTimeout(() => child.kill("SIGKILL"), timeout);
    child.stdout.on("data", (bytes) => {
      stdout += bytes.toString();
      if (stdout.length > 6_000_000) child.kill("SIGKILL");
    });
    child.stderr.on("data", (bytes) => { stderr = (stderr + bytes.toString()).slice(-2048); });
    child.on("error", (err) => { clearTimeout(timer); reject(err); });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(Object.assign(new Error(stderr || "PDF text worker unavailable or timed out."), { statusCode: 503 }));
        return;
      }
      try { resolve(JSON.parse(stdout)); }
      catch { reject(Object.assign(new Error("Invalid PDF text worker output."), { statusCode: 503 })); }
    });
  });
}

export function createAgentWebText({ storage }) {
  async function extract(record, params) {
    const page = Number(params.get("page") || 1);
    const count = Number(params.get("count") || 1);
    if (!Number.isInteger(page) || page < 1 || !Number.isInteger(count) || count < 1 || count > 25) {
      throw Object.assign(new Error("page/count out of range (max 25 pages)."), { statusCode: 400 });
    }
    return { documentId: record.id, ...(await worker(record.pdfPath, page - 1, count)) };
  }
  async function search(record, query) {
    if (!query || query.length > 200) {
      throw Object.assign(new Error("query must be 1-200 characters."), { statusCode: 400 });
    }
    // Search is bounded to 250 pages per call; caller can page through text.
    const result = await worker(record.pdfPath, 0, 250, 60_000);
    const hits = [];
    for (const { page, text } of result.pages) {
      const at = text.toLocaleLowerCase().indexOf(query.toLocaleLowerCase());
      if (at >= 0) hits.push({ page, excerpt: text.slice(Math.max(0, at - 90), at + query.length + 90) });
      if (hits.length >= 100) break;
    }
    return { documentId: record.id, query, citations: hits, indexedPages: result.pages.length,
      pageCount: result.pageCount, truncated: result.pageCount > result.pages.length };
  }
  return { extract, search };
}
