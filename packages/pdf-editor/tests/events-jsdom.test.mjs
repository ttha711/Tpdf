import test from "node:test";
import assert from "node:assert/strict";
let JSDOM;
try { ({ JSDOM } = await import("jsdom")); } catch {}

test("React page surface dispatches selected region in page percentages (jsdom)",
  { skip: !JSDOM }, async () => {
    const dom = new JSDOM("<!doctype html><html><body><div id='root'></div></body></html>",
      { url: "https://host.example.test" });
    const { window } = dom;
    const prev = { window: globalThis.window, document: globalThis.document,
      navigator: globalThis.navigator, IntersectionObserver: globalThis.IntersectionObserver,
      IS_REACT_ACT_ENVIRONMENT: globalThis.IS_REACT_ACT_ENVIRONMENT };
    try {
      globalThis.window = window;
      globalThis.document = window.document;
      Object.defineProperty(globalThis, "navigator", { configurable: true, value: window.navigator });
      globalThis.IS_REACT_ACT_ENVIRONMENT = true;
      const React = await import("react");
      const { createRoot } = await import("react-dom/client");
      const { PageSurface } = await import("../dist/PageSurface.js");
      const node = window.document.querySelector("#root");
      const parent = window.document.createElement("div");
      node.appendChild(parent);
      window.HTMLElement.prototype.setPointerCapture = function () {};
      window.HTMLElement.prototype.getBoundingClientRect = function () {
        return { x: 0, y: 0, left: 0, top: 0, right: 200, bottom: 400,
          width: 200, height: 400, toJSON() {} };
      };
      window.IntersectionObserver = class {
        observe() {} disconnect() {}
      };
      globalThis.IntersectionObserver = window.IntersectionObserver;
      let eventRegion = null;
      const pdf = { getPage: async () => { throw Error("Hidden page should not render"); } };
      const root = createRoot(parent);
      await React.act(async () => root.render(React.createElement(PageSurface, {
        pdf, number: 2, scale: 1, parent, tool: "region",
        marks: [], highlight: null, readOnly: false,
        onRegion: (region) => { eventRegion = region; },
      })));
      const overlay = parent.querySelector(".tpdf-page-overlay");
      assert.ok(overlay);
      await React.act(async () => {
        overlay.dispatchEvent(new window.MouseEvent("pointerdown", {
          bubbles: true, clientX: 20, clientY: 40 }));
        overlay.dispatchEvent(new window.MouseEvent("pointerup", {
          bubbles: true, clientX: 120, clientY: 200 }));
      });
      assert.ok(eventRegion);
      assert.deepEqual({ page: eventRegion.page, x: eventRegion.x, y: eventRegion.y,
        width: eventRegion.width, height: eventRegion.height },
      { page: 2, x: 10, y: 10, width: 50, height: 40 });
      await React.act(async () => root.unmount());
    } finally {
      globalThis.window = prev.window;
      globalThis.document = prev.document;
      Object.defineProperty(globalThis, "navigator", { configurable: true, value: prev.navigator });
      globalThis.IS_REACT_ACT_ENVIRONMENT = prev.IS_REACT_ACT_ENVIRONMENT;
      globalThis.IntersectionObserver = prev.IntersectionObserver;
      dom.window.close();
    }
  });
