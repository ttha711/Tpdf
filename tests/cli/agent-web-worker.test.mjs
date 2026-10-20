import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const py = process.env.TPDF_PYTHON_PATH || "python3";
const script = fileURLToPath(new URL("../../server/workers/agent_web_worker.py", import.meta.url));
const probe = spawnSync(py, ["-c", "import fitz, PIL"], { encoding: "utf8", timeout: 10000 });
const available = probe.status === 0;
const createDocs = [
 "import fitz,sys",
 "first=fitz.open();page=first.new_page();page.insert_text((75,75),'Existing floor plan');first.save(sys.argv[1]);first.close()",
 "second=fitz.open(sys.argv[1]);second[0].insert_text((75,175),'New drawing label');second.save(sys.argv[2]);second.close()",
].join("\n");
function run(spec) {
  const result = spawnSync(py, [script], { input: JSON.stringify(spec), encoding: "utf8", timeout: 20000 });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  return JSON.parse(result.stdout);
}
test("real PDF image export and pixel-based revision compare", { skip: !available }, () => {
  const dir = mkdtempSync(join(tmpdir(), "tpdf-worker-test-"));
  try {
    const a = join(dir, "a.pdf"), b = join(dir, "b.pdf");
    const made = spawnSync(py, ["-c", createDocs, a, b], { encoding: "utf8", timeout: 10000 });
    assert.equal(made.status, 0, made.stderr);
    for (const format of ["png", "jpeg"]) {
      const images = run({ type: "export-images", pdf: a, pages: [1], format, dpi: 72, dir });
      assert.equal(images.images[0].page, 1);
      assert.ok(readFileSync(images.images[0].path).length > 200);
    }
    const compared = run({ type: "compare", left: a, right: b });
    assert.equal(compared.differences[0].page, 1);
    assert.ok(compared.differences[0].changedPercent > 0);
    const region = compared.differences[0].region;
    assert.ok(region.x >= 0 && region.x + region.width <= 100);
    assert.ok(region.y >= 0 && region.y + region.height <= 100);
    assert.deepEqual(run({ type: "compare", left: a, right: a }).differences, []);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
