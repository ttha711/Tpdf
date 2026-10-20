import { mkdir, copyFile } from "node:fs/promises";
import { resolve, dirname, join } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
if (!process.argv[2]) throw Error("Usage: node scripts/copy-assets.mjs <host public directory>");
const dest = resolve(process.argv[2], "tpdf-assets");
await mkdir(dest, { recursive: true });
const worker = require.resolve("pdfjs-dist/build/pdf.worker.min.mjs");
await copyFile(worker, join(dest, "pdf.worker.min.mjs"));
console.log("Copied PDF.js worker:", dest);
// The new editor uses PDF.js for page rendering; its pdfiumWasmUrl prop is
// reserved for optional EmbedPDF-powered host integrations.
