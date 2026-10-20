import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);

test("compile percent geometry and validate parent origin", () => {
  const root = resolve(import.meta.dirname, "../..");
  const dir = mkdtempSync(join(tmpdir(), "tpdf-region-"));
  try {
    execFileSync("tsc", ["--strict", "--target", "ES2022", "--module", "commonjs", "--skipLibCheck",
      "--outDir", dir, join(root, "apps/web/src/embed/agentWebRegion.ts")]);
    const { selectedRegion, isValidRegion, trustedParentMessage } = require(join(dir, "agentWebRegion.js"));
    assert.deepEqual(selectedRegion(2, { x: 80, y: 70 }, { x: 20, y: 10 }),
      { page: 2, x: 20, y: 10, width: 60, height: 60, note: "" });
    assert.equal(isValidRegion({ page: 2, x: 90, y: 90, width: 20, height: 10, note: "" }, 2), false);
    const parent = {};
    assert.equal(trustedParentMessage("https://agent.test", parent, "https://agent.test", parent), true);
    assert.equal(trustedParentMessage("https://evil.test", parent, "https://agent.test", parent), false);
    assert.equal(trustedParentMessage("https://agent.test", {}, "https://agent.test", parent), false);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
