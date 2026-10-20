import test from "node:test";
import assert from "node:assert/strict";
import { TileScheduler } from "../dist/tileScheduler.js";

const tile = (n) => ({
  key: "v1:0:1:" + n + ":0", url: "/tile/" + n, priority: n,
});
const flush = async () => { await new Promise((resolve) => setImmediate(resolve)); };

test("scheduler caps concurrent requests, cancels stale tiles and disposes twice", async () => {
  const originalFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = (url, { signal }) => new Promise((resolve, reject) => {
    const request = { url, signal, resolve, reject };
    requests.push(request);
    signal.addEventListener("abort", () => reject(
      Object.assign(new Error("aborted"), { name: "AbortError" })), { once: true });
  });
  const scheduler = new TileScheduler();
  try {
    scheduler.setWanted(Array.from({ length: 120 }, (_, i) => tile(i)));
    assert.equal(scheduler.active, 8);
    assert.equal(requests.length, 8);
    const oldRequests = requests.slice();

    scheduler.setWanted([tile(119)]);
    assert.equal(scheduler.active, 1);
    assert.ok(oldRequests.every((request) => request.signal.aborted));
    assert.equal(requests.length, 9);
    requests[8].resolve({ ok: true, blob: async () => new Blob(["tile"]) });
    await flush(); await flush();
    assert.equal(scheduler.active, 0);
    assert.ok(scheduler.get(tile(119).key));
    assert.equal(scheduler.cacheSize, 1);

    scheduler.dispose();
    scheduler.dispose();
    assert.equal(scheduler.active, 0);
    assert.equal(scheduler.cacheSize, 0);
    scheduler.setWanted([tile(200)]);
    assert.equal(requests.length, 9, "disposed instances must never restart");
  } finally {
    scheduler.dispose();
    globalThis.fetch = originalFetch;
  }
});

test("scheduler de-duplicates identical tiles and respects 96-item viewport input", () => {
  const scheduler = new TileScheduler();
  const originalFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = (url, { signal }) => {
    requests.push({ url, signal });
    return new Promise(() => {}); // mimic slow host
  };
  try {
    scheduler.setWanted(Array.from({ length: 96 }, (_, i) => tile(i)));
    assert.equal(scheduler.active, 8);
    scheduler.setWanted([tile(0), tile(0), tile(0), tile(1)]);
    assert.equal(scheduler.active, 2);
    assert.equal(requests.length, 8);
  } finally {
    scheduler.dispose();
    globalThis.fetch = originalFetch;
  }
});
