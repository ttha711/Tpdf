import { createServer } from "node:http";
import { stat, createReadStream } from "node:fs";
import { resolve, basename } from "node:path";

const root = resolve(process.env.TPDF_RANGE_ROOT || "public");
const port = Number(process.env.TPDF_RANGE_PORT || 3400);
let totalBytes = 0;
let requests = 0;
let fileRequests = [];
const origins = new Set(["http://127.0.0.1:3300", "http://localhost:3300"]);
createServer((req, res) => {
  const origin = req.headers.origin;
  if (origin && origins.has(origin)) res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Headers", "Range, Content-Type");
  res.setHeader("Access-Control-Expose-Headers", "Accept-Ranges, Content-Length, Content-Range, ETag");
  if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }
  if (req.url === "/__stats/reset" && req.method === "POST") {
    totalBytes = 0; requests = 0; fileRequests = [];
    res.writeHead(204); res.end(); return;
  }
  if (req.url === "/__stats" && req.method === "GET") {
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ totalBytes, requests, fileRequests })); return;
  }
  const key = req.url?.split("?")[0];
  if (!["/large-fixture.pdf", "/fixture.pdf"].includes(key) ||
      !["GET", "HEAD"].includes(req.method)) {
    res.writeHead(404); res.end("Not found"); return;
  }
  const file = resolve(root, basename(key));
  stat(file, (error, stats) => {
    if (error || !stats.isFile()) { res.writeHead(404); res.end("Missing fixture"); return; }
    const size = stats.size;
    res.setHeader("Accept-Ranges", "bytes");
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("ETag", `"${size}-${Math.floor(stats.mtimeMs)}"`);
    res.setHeader("Cache-Control", "no-store");
    let start = 0, end = size - 1, status = 200;
    const range = req.headers.range;
    if (range) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(range);
      if (!match || (!match[1] && !match[2])) {
        res.writeHead(416, { "Content-Range": `bytes */${size}` }); res.end(); return;
      }
      if (!match[1]) start = Math.max(0, size - Number(match[2]));
      else { start = Number(match[1]); end = match[2] ? Number(match[2]) : size - 1; }
      if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= size) {
        res.writeHead(416, { "Content-Range": `bytes */${size}` }); res.end(); return;
      }
      end = Math.min(size - 1, end); status = 206;
      res.setHeader("Content-Range", `bytes ${start}-${end}/${size}`);
    }
    res.setHeader("Content-Length", String(end - start + 1));
    res.writeHead(status);
    if (req.method === "HEAD") { res.end(); return; }
    const entry = { status, range: range || null, bytes: 0 };
    fileRequests.push(entry); requests += 1;
    const stream = createReadStream(file, { start, end, highWaterMark: 64 * 1024 });
    stream.on("data", (chunk) => { entry.bytes += chunk.length; totalBytes += chunk.length; });
    stream.on("error", (err) => { console.error(err); res.destroy(err); });
    res.on("close", () => { stream.destroy(); console.log(JSON.stringify({ path: key, ...entry })); });
    stream.pipe(res);
  });
}).listen(port, "127.0.0.1", () => console.log(`Range test host: ${root} on ${port}`));
