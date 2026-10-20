import test from "node:test";
import assert from "node:assert/strict";
import { SHELL_TABS, SHELL_BUILTINS, visibleBuiltins, APP_WORDS } from "../dist/appShellModel.js";

test("app shell has ordered six tabs and bilingual defaults", () => {
  assert.deepEqual(SHELL_TABS, ["view", "annotate", "shapes", "insert", "forms", "all"]);
  assert.equal(APP_WORDS.en.annotate, "Annotate");
  assert.equal(APP_WORDS.vi.allTools, "Tất cả công cụ");
  assert.ok(SHELL_BUILTINS.every((item) => item.label && item.group));
});
test("tile read-only shows selection/view, host applyChanges enables mark and page tools", () => {
  const forbidden = visibleBuiltins("all", false, false).map((x) => x.id);
  assert.ok(forbidden.includes("region"));
  assert.ok(forbidden.includes("fit"));
  for (const id of ["highlight", "note", "draw", "cover", "signature",
    "insert", "delete", "rotate"]) assert.ok(!forbidden.includes(id), id);
  const enabled = visibleBuiltins("all", true, false).map((x) => x.id);
  for (const id of ["highlight", "note", "draw", "cover", "signature",
    "insert", "delete", "rotate"]) assert.ok(enabled.includes(id), id);
  assert.ok(!enabled.includes("form"), "no local PDF.js AcroForm in tilesOnly");
});
