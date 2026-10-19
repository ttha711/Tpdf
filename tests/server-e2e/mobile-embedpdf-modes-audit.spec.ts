import { test, expect } from "@playwright/test";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

async function createFixturePdf() {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let i = 1; i <= 2; i++) {
    const page = doc.addPage([595, 842]);
    page.drawText(`Page ${i} - Mobile EmbedPDF Test`, {
      x: 50, y: 750, size: 20, font, color: rgb(0, 0, 0),
    });
  }
  return Buffer.from(await doc.save());
}

test.describe("Mobile EmbedPDF swipeable modes and complete tools grid", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  async function openFixture(page: import("@playwright/test").Page, request: import("@playwright/test").APIRequestContext) {
    const upload = await request.post("/api/tpdf/documents?name=mobile-tools-unified.pdf", {
      headers: { "Content-Type": "application/pdf" },
      data: await createFixturePdf(),
    });
    expect(upload.status()).toBe(201);
    const document = await upload.json();
    await page.goto("/?open=" + encodeURIComponent(document.filePath), { waitUntil: "networkidle" });
    await expect(page.locator("[data-tpdf-engine='pdfium-wasm']")).toBeVisible({ timeout: 30000 });
    await expect(page.locator("[data-tpdf-region='mobile-mode-strip']")).toBeVisible();
  }

  test("switches groups by swiping instead of opening a mode-picker sheet", async ({ page, request }) => {
    await openFixture(page, request);
    const strip = page.locator("[data-tpdf-region='mobile-mode-strip']");
    const scroller = strip.locator("[role='tablist']");
    await expect(strip.getByRole("tab")).toHaveCount(7);
    await expect(strip.getByRole("tab", { name: "View" })).toHaveAttribute("aria-selected", "true");

    const toolbarOrder = await page.evaluate(() => {
      const stripRect = document.querySelector<HTMLElement>(".tpdf-mobile-mode-strip")?.getBoundingClientRect();
      const shadow = document.querySelector("embedpdf-container")?.shadowRoot;
      const layout = shadow?.querySelector<HTMLElement>(".relative.flex.h-full.w-full.select-none.flex-col");
      const controlsRect = layout?.children[0]?.getBoundingClientRect();
      const toolsRect = layout?.children[1]?.getBoundingClientRect();
      return stripRect && controlsRect && toolsRect ? {
        controlsBottom: controlsRect.bottom,
        groupsTop: stripRect.top,
        groupsBottom: stripRect.bottom,
        toolsTop: toolsRect.top,
      } : null;
    });
    expect(toolbarOrder).not.toBeNull();
    expect(toolbarOrder!.groupsTop).toBeGreaterThanOrEqual(toolbarOrder!.controlsBottom - 1);
    expect(toolbarOrder!.groupsTop - toolbarOrder!.controlsBottom).toBeLessThanOrEqual(2);
    expect(toolbarOrder!.toolsTop).toBeGreaterThanOrEqual(toolbarOrder!.groupsBottom - 1);
    expect(toolbarOrder!.toolsTop - toolbarOrder!.groupsBottom).toBeLessThanOrEqual(2);
    await strip.getByRole("tab", { name: "Annotate" }).click();
    await expect(strip.getByRole("tab", { name: "Annotate" })).toHaveAttribute("aria-selected", "true");
    const annotateOrder = await page.evaluate(() => {
      const stripRect = document.querySelector<HTMLElement>(".tpdf-mobile-mode-strip")?.getBoundingClientRect();
      const layout = document.querySelector("embedpdf-container")?.shadowRoot
        ?.querySelector<HTMLElement>(".relative.flex.h-full.w-full.select-none.flex-col");
      const controlsRect = layout?.children[0]?.getBoundingClientRect();
      const toolsRect = layout?.children[1]?.getBoundingClientRect();
      return stripRect && controlsRect && toolsRect ? {
        controlsBottom: controlsRect.bottom,
        groupsTop: stripRect.top,
        groupsBottom: stripRect.bottom,
        toolsTop: toolsRect.top,
      } : null;
    });
    expect(annotateOrder).not.toBeNull();
    expect(annotateOrder!.groupsTop - annotateOrder!.controlsBottom).toBeLessThanOrEqual(2);
    expect(annotateOrder!.toolsTop - annotateOrder!.groupsBottom).toBeLessThanOrEqual(2);
    await strip.getByRole("tab", { name: "View" }).click();
    await expect(strip.getByRole("tab", { name: "View" })).toHaveAttribute("aria-selected", "true");

    await strip.getByRole("tab", { name: "Shapes" }).click();
    await expect(strip.getByRole("tab", { name: "Shapes" })).toHaveAttribute("aria-selected", "true");
    await expect(page.locator("body")).not.toHaveAttribute("data-embedpdf-overlay", "open");

    // Off-screen tabs remain accessible by horizontal pan, without a select menu.
    await scroller.evaluate(element => { element.scrollLeft = element.scrollWidth; });
    await strip.getByRole("tab", { name: "Redact" }).click();
    await expect(strip.getByRole("tab", { name: "Redact" })).toHaveAttribute("aria-selected", "true");
    await expect(page.locator("[data-tpdf-region='mobile-dock']")).toBeVisible();
  });

  test("keeps mobile actions unique and shows page status only while scrolling", async ({ page, request }) => {
    await openFixture(page, request);
    const dock = page.locator("[data-tpdf-region='mobile-dock']");
    await expect(dock.getByRole("button", { name: "Select" })).toBeVisible();
    await expect(dock.getByRole("button", { name: "Read" })).toHaveCount(0);
    await expect(page.locator(".tpdf-palette-trigger")).toBeHidden();
    await expect(page.locator(".tpdf-mobile-header-save")).toBeHidden();
    await expect(dock.locator(".tpdf-mobile-dock-status")).toHaveCount(0);

    const strip = page.locator("[data-tpdf-region='mobile-mode-strip']");
    await strip.getByRole("tab", { name: "Annotate" }).click();
    const toolbarLayout = page.locator("embedpdf-container")
      .locator(".relative.flex.h-full.w-full.select-none.flex-col").locator(":scope > *").nth(1);
    const nativeHistoryActions = await toolbarLayout.locator("button").evaluateAll((buttons) =>
      buttons.filter((button) =>
        /^(undo|redo)/i.test(`${button.getAttribute("aria-label") ?? ""} ${button.title}`),
      ).length,
    );
    expect(nativeHistoryActions).toBeGreaterThan(0);
    await expect(toolbarLayout.locator('button[aria-label^="Undo"], button[title^="Undo"]')).toBeHidden();
    await expect(toolbarLayout.locator('button[aria-label^="Redo"], button[title^="Redo"]')).toBeHidden();
    await expect(dock.getByRole("button", { name: "Undo" })).toBeVisible();
    await expect(dock.getByRole("button", { name: "Redo" })).toBeVisible();

    await strip.getByRole("tab", { name: "View" }).click();
    await page.locator("embedpdf-container").evaluate((host) => {
      const shadow = (host as HTMLElement & { shadowRoot?: ShadowRoot }).shadowRoot;
      const scroller = [...(shadow?.querySelectorAll<HTMLElement>("*") ?? [])]
        .find((node) => node.scrollHeight > node.clientHeight + 4 && getComputedStyle(node).overflowY === "auto");
      if (scroller) scroller.scrollTop = scroller.scrollHeight;
    });
    await expect(dock.locator(".tpdf-mobile-dock-status")).toBeVisible();
    const status = await dock.locator(".tpdf-mobile-dock-status").boundingBox();
    const dockBox = await dock.boundingBox();
    expect(status).not.toBeNull();
    expect(dockBox).not.toBeNull();
    expect(status!.width).toBeLessThan(220);
    expect(status!.y + status!.height).toBeLessThanOrEqual(dockBox!.y + 1);
    await expect(dock.locator(".tpdf-mobile-dock-status")).toBeHidden({ timeout: 4000 });
  });

  test("grid groups contain native tools and keep the viewer mounted while switching", async ({ page, request }) => {
    await openFixture(page, request);
    await page.evaluate(() => {
      (window as typeof window & { __originalEmbedHost?: Element | null }).__originalEmbedHost =
        document.querySelector("embedpdf-container");
    });
    const strip = page.locator("[data-tpdf-region='mobile-mode-strip']");
    await strip.getByRole("button", { name: "All PDF tools" }).click();
    const sheet = page.locator("[data-tpdf-mobile-tools='open']");
    await expect(sheet).toBeVisible();
    for (const group of ["view", "annotate", "shapes", "insert", "form", "redact", "measure"]) {
      await expect(sheet.locator(`[data-tpdf-tool-group="${group}"]`)).toBeVisible();
    }
    for (const id of ["highlight", "ink", "rectangle", "circle", "signature", "textfield", "redact", "area"]) {
      await expect(sheet.locator(`[data-tpdf-mobile-tool="${id}"]`)).toBeVisible();
    }
    await expect(sheet.locator(".tpdf-mobile-tool-sheet-item svg"))
      .toHaveCount(await sheet.locator(".tpdf-mobile-tool-sheet-item").count());

    await sheet.locator('[data-tpdf-mobile-tool="rectangle"]').click();
    await expect(sheet).toBeHidden();
    await expect(strip.getByRole("tab", { name: "Shapes" })).toHaveAttribute("aria-selected", "true");
    // Complete a real shape gesture. The PDF working-copy host must not restart
    // just because an annotation was committed.
    const canvas = await page.locator('[data-tpdf-engine="pdfium-wasm"]').boundingBox();
    expect(canvas).not.toBeNull();
    if (canvas) {
      await page.mouse.move(canvas.x + canvas.width * .35, canvas.y + canvas.height * .48);
      await page.mouse.down();
      await page.mouse.move(canvas.x + canvas.width * .62, canvas.y + canvas.height * .63, { steps: 7 });
      await page.mouse.up();
      await page.waitForTimeout(350);
    }
    expect(await page.evaluate(() => document.querySelector("embedpdf-container") ===
      (window as typeof window & { __originalEmbedHost?: Element | null }).__originalEmbedHost)).toBe(true);
    await strip.getByRole("button", { name: "All PDF tools" }).click();
    await sheet.locator('[data-tpdf-mobile-tool="highlight"]').click();
    await expect(strip.getByRole("tab", { name: "Annotate" })).toHaveAttribute("aria-selected", "true");
    await expect(page.locator("[data-tpdf-engine='pdfium-wasm']")).toBeVisible();

    expect(await page.evaluate(() => document.querySelector("embedpdf-container") ===
      (window as typeof window & { __originalEmbedHost?: Element | null }).__originalEmbedHost)).toBe(true);
  });
});
