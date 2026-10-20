import { parentPort, workerData } from "node:worker_threads";
import { readFile, stat } from "node:fs/promises";

async function run({ path, start, count, maxPages, maxBytes }) {
  const metadata = await stat(path);
  if (metadata.size > maxBytes) throw Error("PDF is too large to index.");
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const task = getDocument({ data: new Uint8Array(await readFile(path)),
    useSystemFonts: true, disableFontFace: true, isEvalSupported: false });
  try {
    const doc = await task.promise;
    if (doc.numPages > maxPages) throw Error("PDF has too many pages to index.");
    const pages = [];
    let totalChars = 0;
    for (let page = start; page <= Math.min(doc.numPages, start + count - 1); page++) {
      const pdfPage = await doc.getPage(page);
      const content = await pdfPage.getTextContent();
      const text = content.items.map((entry) => "str" in entry ? entry.str : "").join(" ").slice(0, 30000);
      totalChars += text.length;
      if (totalChars > 12_000_000) throw Error("PDF text exceeds index budget.");
      pages.push({ page, text });
      pdfPage.cleanup();
    }
    return { pageCount: doc.numPages, pages };
  } finally { await task.destroy(); }
}
run(workerData).then((result) => parentPort.postMessage(result))
  .catch((error) => parentPort.postMessage({ error: String(error.message).slice(0, 400) }));
