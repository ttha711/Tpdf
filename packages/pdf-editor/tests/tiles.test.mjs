import test from "node:test";
import assert from "node:assert/strict";
import { tileLevel, wantedTiles, pageBoxes, fallbackTile } from "../dist/tiles.js";

const adapter = { meta: async () => ({ versionId: "v1", pages: [] }),
  tileUrl: (page, level, x, y) => `/tiles/${page}/${level}/${x}/${y}` };
test("level rounds up zoom*dpr and caps at 16", () => {
  assert.equal(tileLevel(0.51, 2), 2);
  assert.equal(tileLevel(0.25, 2), 0.5);
  assert.equal(tileLevel(8, 2), 16);
  assert.equal(tileLevel(20, 2), 16);
});
test("tile geometry preserves clipped fractional right/bottom edges", () => {
  const meta = { versionId: "v1", pages: [{ width: 1031.25, height: 1030.75 }] };
  const page = pageBoxes(meta, 1)[0];
  assert.equal(page.height, 1030.75);
  const list = wantedTiles(adapter, meta, 1, 1,
    { left: 0, top: 0, width: 2000, height: 2000 });
  const edge = list.find((tile) => tile.level === 1 && tile.x === 2 && tile.y === 2);
  assert.ok(edge);
  assert.equal(edge.left, 1024);
  assert.equal(edge.top, 1024);
  assert.equal(edge.width, 7.25);
  assert.equal(edge.height, 6.75);
});
test("no remote requests for other pages and visible budget <=96", () => {
  const meta = { versionId: "v1", pages: Array.from({ length: 100 },
    () => ({ width: 3400, height: 2400 })) };
  const tiles = wantedTiles(adapter, meta, 8, 2,
    { left: 10000, top: 60000, width: 390, height: 840 });
  assert.ok(tiles.length > 0);
  assert.ok(tiles.length <= 96);
  assert.ok(new Set(tiles.map((tile) => tile.key)).size === tiles.length);
  assert.ok(new Set(tiles.map((tile) => tile.page)).size <= 2);
});
test("lower-level fallback covers same target coordinate", () => {
  const meta = { versionId: "v1", pages: [{ width: 3370, height: 2384 }] };
  const target = wantedTiles(adapter, meta, 4, 2, { left: 2000, top: 300, width: 900, height: 800 })[0];
  assert.ok(target);
  const coarse = fallbackTile(target, 0.5, adapter, "v1");
  assert.ok(coarse.left <= target.left);
  assert.ok(coarse.top <= target.top);
  assert.ok(coarse.left + 512 / coarse.level > target.left);
  assert.ok(coarse.top + 512 / coarse.level > target.top);
});
