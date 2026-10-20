import { test, expect } from "@playwright/test";
const url = "/office/pdf?tiles=1&tileonly=1&shell=app";
const screens = [ { width: 375, height: 812 }, { width: 390, height: 844 } ];

for (const viewport of screens) {
  test(`mobile app shell ${viewport.width}x${viewport.height} screenshots and tool interactions`, async ({ page }) => {
    test.setTimeout(70000);
    await page.setViewportSize(viewport);
    const pdfLoads: string[] = [];
    page.on("request", (request) => { if (request.url().includes("fixture.pdf")) pdfLoads.push(request.url()); });
    await page.goto(url);
    const shell = page.locator('[data-tpdf-shell="app"]');
    await expect(shell).toBeVisible({ timeout: 30000 });
    await expect(page.locator(".tpdf-tile-document")).toBeVisible({ timeout: 30000 });
    const tileImgs = page.locator("[data-tpdf-tile]");
    await expect.poll(() => tileImgs.evaluateAll((nodes) => nodes.filter((n) => {
      const img = n as HTMLImageElement;
      return img.complete && img.naturalWidth > 0;
    }).length), { timeout: 30000 }).toBeGreaterThan(0);
    expect(pdfLoads).toEqual([]);
    const metrics = await page.evaluate(() => {
      const viewer = document.querySelector(".tpdf-app-viewer")!.getBoundingClientRect();
      const buttons = [...document.querySelectorAll(".tpdf-app-dock button")];
      return { body: document.documentElement.scrollWidth, window: innerWidth,
        viewerHeight: viewer.height, tapMin: Math.min(...buttons.map((b) =>
          b.getBoundingClientRect().height)) };
    });
    expect(metrics.body).toBeLessThanOrEqual(metrics.window + 1);
    expect(metrics.viewerHeight).toBeGreaterThan(viewport.height * 0.45);
    expect(metrics.tapMin).toBeGreaterThanOrEqual(44);
    await page.screenshot({ path: `test-results/screenshots/s3-${viewport.width}-open.png` });
    await page.getByRole("tab", { name: "Annotate" }).click();
    await expect(page.getByRole("tab", { name: "Annotate" })).toHaveAttribute("aria-selected", "true");
    await expect(page.getByLabel("PDF mode")).toHaveValue("highlight");
    await page.screenshot({ path: `test-results/screenshots/s3-${viewport.width}-annotate.png` });
    await page.getByRole("button", { name: "Tools", exact: true }).click();
    await expect(page.getByRole("dialog", { name: "All tools" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Page numbers" })).toBeVisible();
    await page.screenshot({ path: `test-results/screenshots/s3-${viewport.width}-tools.png` });
    await page.getByRole("button", { name: "Page numbers" }).click();
    await expect(page.getByTestId("tool-run")).toContainText("page-numbers page");
    expect(await tileImgs.count()).toBeLessThanOrEqual(96);
    expect(Number(await page.locator(".tpdf-tile-document").getAttribute("data-tpdf-active")))
      .toBeLessThanOrEqual(8);
    console.log("S3_MOBILE", viewport.width, metrics, "tiles", await tileImgs.count());
  });
}

test("tilesOnly searchPages results navigate via metadata with no PDF.js source fetch", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const pdfRequests: string[] = [];
  page.on("request", (request) => { if (request.url().includes("fixture.pdf")) pdfRequests.push(request.url()); });
  await page.goto(url);
  await expect(page.locator(".tpdf-tile-document")).toBeVisible({ timeout: 30000 });
  await page.getByRole("button", { name: "Find" }).first().click();
  await page.getByLabel("Find", { exact: true }).last().fill("stair");
  await page.getByTestId("shell-search").getByRole("button", { name: "Find" }).click();
  await page.getByRole("button", { name: /Page 35:/ }).click();
  await expect(page.locator(".tpdf-app-status")).toContainText("Page 35 / 100");
  expect(pdfRequests).toEqual([]);
});

test("tilesOnly host applyChanges saves annotation as change list, no PDF bytes", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(url);
  await expect(page.locator(".tpdf-tile-document")).toBeVisible({ timeout: 30000 });
  await page.getByRole("tab", { name: "Annotate" }).click();
  const overlay = page.locator('[data-tpdf-page="1"] .tpdf-page-overlay');
  await expect(overlay).toBeVisible();
  const rect = await overlay.boundingBox();
  expect(rect).toBeTruthy();
  const x = Math.max(10, rect!.x + 35), y = rect!.y + 50;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 80, y + 42, { steps: 5 });
  await page.mouse.up();
  await expect(page.locator(".tpdf-mark-highlight")).toHaveCount(1);
  await expect(page.getByTestId("shell-save-status")).toContainText("Unsaved");
  await page.getByRole("button", { name: "Save version" }).first().click();
  await expect(page.getByTestId("shell-save-status")).toContainText("Saved");
  await expect(page.locator(".tpdf-mark-highlight")).toHaveCount(0);
});
