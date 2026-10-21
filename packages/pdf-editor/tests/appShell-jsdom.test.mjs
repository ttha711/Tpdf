import test from "node:test";
import assert from "node:assert/strict";
let JSDOM;
try { ({ JSDOM } = await import("jsdom")); } catch {}

test("React app shell tabs and host tool context work without apps/web", { skip: !JSDOM }, async () => {
  const dom = new JSDOM("<!doctype html><html><body><div id='mount'></div></body></html>",
    { url: "https://360i.example.test" });
  const prior = { window: globalThis.window, document: globalThis.document,
    navigator: globalThis.navigator, IS_REACT_ACT_ENVIRONMENT: globalThis.IS_REACT_ACT_ENVIRONMENT };
  let root;
  try {
    globalThis.window = dom.window;
    globalThis.document = dom.window.document;
    Object.defineProperty(globalThis, "navigator",
      { configurable: true, value: dom.window.navigator });
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    const React = await import("react");
    const { createRoot } = await import("react-dom/client");
    const { AppShell } = await import("../dist/AppShell.js");
    const hostCalls = [], selectedTools = [], selection = {
      page: 2, x: 12, y: 17, width: 26, height: 15, note: "",
    };
    root = createRoot(dom.window.document.querySelector("#mount"));
    const props = {
      children: React.createElement("div", { id: "viewer" }, "PDF page"),
      locale: "en", text: { save: "Save version", search: "Find", pages: "Pages" },
      name: "a-really-long-drawing-filename.pdf", dirty: true, busy: false,
      page: 2, total: 100, zoom: 1, tile: true, canEdit: true,
      canForms: false, canSave: true, undoEnabled: true,
      redoEnabled: false, tool: "region", query: "", results: [], note: "",
      selection, tools: [{ id: "watermark", label: "Watermark", group: "360i tools",
        run: (ctx) => { hostCalls.push(ctx); } }],
      onTool: (tool) => selectedTools.push(tool), onNote: () => {},
      onSearchQuery: () => {}, onSearch: () => {}, onGoto: () => {},
      onBuiltin: () => {}, onSave: () => {}, onUndo: () => {}, onRedo: () => {},
      onToolError: (error) => { throw error; },
    };
    await React.act(async () => root.render(React.createElement(React.StrictMode, null,
      React.createElement(AppShell, props))));
    assert.ok(dom.window.document.querySelector(".tpdf-app-dock"));
    assert.equal(dom.window.document.querySelectorAll('[data-tpdf-mode-tab]').length, 8);
    assert.equal(dom.window.document.querySelector("[data-testid=shell-save-status]").textContent,
      "Unsaved");
    await React.act(async () =>
      dom.window.document.querySelector('[data-tpdf-mode-tab=annotate]').click());
    assert.equal(selectedTools.length, 0); // switching group never arms a tool implicitly
    await React.act(async () => dom.window.document.querySelector(
      '[data-tpdf-group-toolbar=annotate] [data-tpdf-mobile-tool=highlight]').click());
    assert.equal(selectedTools.at(-1),"highlight");
    await React.act(async () =>
      dom.window.document.querySelector(".tpdf-app-dock [aria-label=Tools]").click());
    assert.ok(dom.window.document.querySelector('[role=dialog]'));
    const tool = [...dom.window.document.querySelectorAll(".tpdf-app-tool-grid button")]
      .find((button) => button.textContent.includes("Watermark"));
    assert.ok(tool);
    await React.act(async () => tool.click());
    assert.deepEqual(hostCalls, [{ page: 2, selection }]);
    await React.act(async () => root.unmount());
    root = null;
  } finally {
    if (root) await import("react").then((React) => React.act(async () => root.unmount()));
    globalThis.window = prior.window;
    globalThis.document = prior.document;
    Object.defineProperty(globalThis, "navigator",
      { configurable: true, value: prior.navigator });
    globalThis.IS_REACT_ACT_ENVIRONMENT = prior.IS_REACT_ACT_ENVIRONMENT;
    dom.window.close();
  }
});
