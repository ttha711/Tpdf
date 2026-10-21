import test from "node:test";
import assert from "node:assert/strict";
import { changedWords } from "../dist/textDiff.js";

test("only the changed words are searched and replaced", () => {
  assert.deepEqual(changedWords("Fire escape minimum width 1.4 m", "Fire escape minimum width 1.5 m"), { search: "1.4", replacement: "1.5" });
  assert.deepEqual(changedWords("a b c", "a x y c"), { search: "b", replacement: "x y" });
  assert.deepEqual(changedWords("a b c", "a c"), { search: "b", replacement: "" });
  assert.deepEqual(changedWords("a b", "a b c"), { search: "b", replacement: "b c" });
  assert.equal(changedWords("same", "same"), null);
});
