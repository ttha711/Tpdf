import test from "node:test";
import assert from "node:assert/strict";
import { emptyHistory, change, undo, redo, normalizeRegion, validRegion } from "../dist/history.js";

test("undo/redo restores complete edit snapshots", () => {
  const first = change(emptyHistory(), { kind: "rotate", page: 2 });
  const second = change(first, { kind: "delete", page: 1 });
  assert.equal(second.current.length, 2);
  assert.deepEqual(undo(second).current, first.current);
  assert.deepEqual(redo(undo(second)).current, second.current);
  assert.equal(change(undo(second), { kind: "insert", page: 1 }).future.length, 0);
});
test("page rectangle coordinates are top-left percentages and clamped", () => {
  const rect = normalizeRegion(2, 75, 80, 25, 10, "note");
  assert.deepEqual(rect, { page: 2, x: 25, y: 10, width: 50, height: 70, note: "note" });
  assert.equal(validRegion(rect, 2), true);
  assert.equal(validRegion({ ...rect, x: 80 }, 2), false);
  assert.equal(normalizeRegion(1, 10, 10, 10, 30), null);
});
