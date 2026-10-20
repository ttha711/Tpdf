import test from "node:test";
import assert from "node:assert/strict";
let JSDOM;
try { ({ JSDOM } = await import("jsdom")); } catch {}

test("StrictMode effect replay and real unmount/remount both render tiles",
  { skip: !JSDOM }, async () => {
  const dom = new JSDOM("<!doctype html><html><body><div id='root'></div></body></html>",
    { url: "https://host.example.test" });
  const previous = { window: globalThis.window, document: globalThis.document,
    navigator: globalThis.navigator, ResizeObserver: globalThis.ResizeObserver,
    fetch: globalThis.fetch, IS_REACT_ACT_ENVIRONMENT: globalThis.IS_REACT_ACT_ENVIRONMENT };
  const { window } = dom;
  const signals = [];
  let root;
  try {
    globalThis.window = window;
    globalThis.document = window.document;
    Object.defineProperty(globalThis, "navigator",
      { configurable: true, value: window.navigator });
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    globalThis.ResizeObserver = class { observe() {} disconnect() {} };
    globalThis.fetch = async (_url, { signal }) => {
      signals.push(signal);
      await Promise.resolve();
      if (signal.aborted) throw Object.assign(new Error("aborted"), { name: "AbortError" });
      return { ok: true, blob: async () => new Blob(["test image"], { type: "image/png" }) };
    };

    const React = await import("react");
    const { createRoot } = await import("react-dom/client");
    const { TileViewer } = await import("../dist/TileViewer.js");
    const parent = window.document.querySelector("#root");
    Object.defineProperty(parent, "clientWidth", { value: 900, configurable: true });
    Object.defineProperty(parent, "clientHeight", { value: 750, configurable: true });
    const meta = { versionId: "fixture-immutable-v1",
      pages: [{ width: 1024, height: 1024 }] };
    const tiles = {
      meta: async () => meta,
      tileUrl: (page, level, x, y) => "/tiles/" + [page, level, x, y].join("/"),
    };
    const onRegion = () => {};
    const onPage = () => {};
    const viewer = () => React.createElement(React.StrictMode, null,
      React.createElement(TileViewer, {
        tiles, meta, zoom: 1, parent, selected: null, onRegion, onPage,
      }));
    root = createRoot(parent);
    const waitForImages = async () => {
      for (let attempt = 0; attempt < 12; attempt++) {
        await React.act(async () => { await new Promise((r) => setTimeout(r, 1)); });
        if (parent.querySelectorAll("[data-tpdf-tile]").length) return;
      }
      assert.fail("StrictMode mounted a white page instead of tiles");
    };

    await React.act(async () => root.render(viewer()));
    await waitForImages();
    assert.ok(signals.some((signal) => signal.aborted),
      "StrictMode cleanup must abort the first scheduler");
    assert.ok(signals.some((signal) => !signal.aborted),
      "second setup must fetch on a fresh live scheduler");
    assert.ok(parent.querySelectorAll("[data-tpdf-tile]").length <= 96);
    assert.ok(Number(parent.querySelector(".tpdf-tile-document").dataset.tpdfActive) <= 8);

    const requestsBeforeRemount = signals.length;
    await React.act(async () => root.render(null));
    await React.act(async () => root.render(viewer()));
    await waitForImages();
    assert.ok(signals.length > requestsBeforeRemount,
      "real unmount/remount must issue new requests");
    assert.ok(parent.querySelectorAll("[data-tpdf-tile]").length > 0);
    await React.act(async () => root.unmount());
    root = undefined;
  } finally {
    if (root) await import("react").then((React) =>
      React.act(async () => root.unmount()));
    globalThis.window = previous.window;
    globalThis.document = previous.document;
    Object.defineProperty(globalThis, "navigator",
      { configurable: true, value: previous.navigator });
    globalThis.ResizeObserver = previous.ResizeObserver;
    globalThis.fetch = previous.fetch;
    globalThis.IS_REACT_ACT_ENVIRONMENT = previous.IS_REACT_ACT_ENVIRONMENT;
    dom.window.close();
  }
});
