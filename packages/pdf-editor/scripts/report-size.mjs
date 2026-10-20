import { readdir, readFile, writeFile } from "node:fs/promises";
import { gzipSync } from "node:zlib";
const dir = new URL("../dist/", import.meta.url);
async function collect(path) {
  const result = [];
  for (const entry of await readdir(path, { withFileTypes: true })) {
    const next = new URL(entry.name + (entry.isDirectory() ? "/" : ""), path);
    if (entry.isDirectory()) result.push(...await collect(next));
    else if (entry.name.endsWith(".js")) result.push(next);
  }
  return result;
}
const files = await collect(dir);
const sizes = await Promise.all(files.map(async (file) => ({
  file: file.pathname.replace(dir.pathname, ""),
  gzip: gzipSync(await readFile(file)).length,
  raw: (await readFile(file)).length,
})));
const sum = sizes.reduce((n, file) => n + file.gzip, 0);
const report = { gzipJsBytes: sum, gzipJsKiB: +(sum / 1024).toFixed(2),
  budgetKiB: 100, files, externalDependencies: ["react", "react-dom", "pdfjs-dist", "pdf-lib"],
  note: "Unbundled ESM package JS only; excludes host-installed external dependencies and workers." };
await writeFile(new URL("../dist/size-report.json", import.meta.url), JSON.stringify(report, null, 2));
console.log("TPDF JS gzip:", report.gzipJsKiB, "KiB (budget 100 KiB, external deps excluded)");
if (sum > 100 * 1024) process.exitCode = 1;
