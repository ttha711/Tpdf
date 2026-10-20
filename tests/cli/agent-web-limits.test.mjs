import test from "node:test";
import assert from "node:assert/strict";
import { assertOperationBudget } from "../../server/tpdf-agent-web-limits.mjs";

test("merge/split cap is combined across PDF sources", () => {
  assert.deepEqual(assertOperationBudget([{ size: 200, pages: 2 }, { size: 100, pages: 3 }], 500), { bytes: 300, pages: 5 });
  assert.throws(() => assertOperationBudget([{ size: 200, pages: 3 }, { size: 301, pages: 3 }], 500), { statusCode: 413 });
  assert.throws(() => assertOperationBudget([{ size: 100, pages: 300 }, { size: 100, pages: 1 }], 500), { statusCode: 413 });
  assert.throws(() => assertOperationBudget([{ size: -1, pages: 1 }], 500));
});
