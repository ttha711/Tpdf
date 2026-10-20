import { test } from "node:test";
import assert from "node:assert/strict";
import { chooseSaveRoute, DEFAULT_LARGE_FILE_BYTES } from "../dist/saveRoute.js";
test("30 MiB boundary chooses byte saves only for known small sources", () => {
  assert.equal(chooseSaveRoute(30 * 1024 * 1024, true), "bytes");
  assert.equal(chooseSaveRoute(30 * 1024 * 1024 + 1, true), "changes");
  assert.equal(chooseSaveRoute(250 * 1024 * 1024, false), "blocked");
  assert.equal(chooseSaveRoute(undefined, false), "blocked");
  assert.equal(chooseSaveRoute(undefined, true), "changes");
  assert.equal(chooseSaveRoute(NaN, true), "changes");
  assert.equal(DEFAULT_LARGE_FILE_BYTES, 31457280);
  assert.throws(() => chooseSaveRoute(1, false, -1), /Invalid/);
});
test("public PDF change shapes are stable for host-side PyMuPDF", () => {
  const change = { kind: "mark", mark: { type: "draw",
    region: { page: 7, x: 10, y: 20, width: 30, height: 10, note: "" },
    points: [[10, 20], [40, 30]] } };
  assert.deepEqual(structuredClone(change).mark.points, [[10, 20], [40, 30]]);
});
