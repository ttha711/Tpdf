import test from "node:test";
import assert from "node:assert/strict";
import { mergeStaged } from "../dist/p4Types.js";

const base = [{ id: "a", page: 1, point: { x: 10, y: 20 }, author: { name: "U" }, createdAt: "2026-01-01T00:00:00Z", text: "one", status: "open", replies: [{ id: "r", author: { name: "U" }, createdAt: "", text: "re", canEdit: true, canDelete: true }], canEdit: true, canDelete: true }];
const k = { schemaVersion: 1 };

test("staged comment changes are laid over the saved ones in order", () => {
  const view = mergeStaged(base, [
    { kind: "comment.add", ...k, tempId: "t1", page: 2, point: { x: 1, y: 2 }, text: "new" },
    { kind: "comment.reply", ...k, parentId: "t1", text: "to new" },
    { kind: "comment.reply", ...k, parentId: "a", text: "to one" },
    { kind: "comment.resolve", ...k, id: "a", resolved: true },
    { kind: "comment.edit", ...k, id: "r", text: "edited" },
  ]);
  assert.equal(view.length, 2);
  assert.equal(view[0].status, "resolved");
  assert.deepEqual(view[0].replies.map((x) => x.text), ["edited", "to one"]);
  assert.equal(view[1].unsaved, true);
  assert.equal(view[1].replies[0].text, "to new");
  assert.equal(base[0].status, "open");
});
test("deleting a root drops its replies, deleting a reply keeps the root", () => {
  assert.equal(mergeStaged(base, [{ kind: "comment.delete", ...k, id: "a" }]).length, 0);
  const view = mergeStaged(base, [{ kind: "comment.delete", ...k, id: "r" }]);
  assert.equal(view[0].replies.length, 0);
});
