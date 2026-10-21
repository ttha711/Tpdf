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
    await expect(page.getByRole("toolbar",{name:"Annotate tools"})).toBeVisible();
    await page.getByRole("toolbar",{name:"Annotate tools"})
      .getByRole("button",{name:"Highlight"}).click();
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
  await page.getByRole("button", { name: "Search", exact:true }).first().click();
  await page.getByTestId("shell-search").locator("input").fill("stair");
  await page.getByTestId("shell-search").getByRole("button", { name: "Search" }).click();
  await page.getByRole("button", { name: /Page 35:/ }).click();
  await expect(page.locator(".tpdf-mobile-dock-status")).toContainText("Page 35 / 100");
  expect(pdfRequests).toEqual([]);
});

test("tilesOnly host applyChanges saves annotation as change list, no PDF bytes", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(url);
  await expect(page.locator(".tpdf-tile-document")).toBeVisible({ timeout: 30000 });
  await page.getByRole("tab", { name: "Annotate" }).click();
  await page.getByRole("toolbar",{name:"Annotate tools"}).getByRole("button",{name:"Highlight"}).click();
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
  await page.getByRole("button", { name: "Save", exact:true }).last().click();
  await expect(page.getByTestId("shell-save-status")).toContainText("Saved");
  await expect(page.locator(".tpdf-mark-highlight")).toHaveCount(0);
  await expect(page.getByTestId("host-saved")).toContainText("applied=1");
});

test("tile page mutation is sent to host applyChanges without downloading PDF", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  const pdfRequests: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/fixture.pdf")) pdfRequests.push(request.url());
  });
  await page.goto(url);
  await expect(page.locator(".tpdf-tile-document")).toBeVisible({ timeout: 30000 });
  await page.getByRole("button", { name: "Tools", exact: true }).click();
  await page.getByRole("dialog", { name: "All tools" })
    .getByRole("button", { name: "Rotate right" }).click();
  await expect(page.getByTestId("shell-save-status")).toContainText("Unsaved");
  await page.getByRole("button", { name: "Save", exact:true }).last().click();
  await expect(page.getByTestId("host-saved")).toContainText("applied=1");
  expect(pdfRequests).toEqual([]);
});

test("A0 landscape Fit shrinks below 25% without horizontal scroll on 375px", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(url);
  const scroller = page.locator(".tpdf-scroll");
  await expect(page.locator(".tpdf-tile-document")).toBeVisible({ timeout: 30000 });
  await expect.poll(async () => scroller.evaluate((node) => ({
    scroll: node.scrollWidth, client: node.clientWidth,
    zoom: (document.querySelector('[data-tpdf-page="1"]')?.getBoundingClientRect().width||0)/3370*100,
  })), { timeout: 15000 }).toMatchObject({ scroll: 375, client: 375 });
  const metrics = await scroller.evaluate((node) => ({
    scrollWidth: node.scrollWidth, clientWidth: node.clientWidth,
    pageWidth: document.querySelector('[data-tpdf-page="1"]')?.getBoundingClientRect().width,
    zoom: (document.querySelector('[data-tpdf-page="1"]')?.getBoundingClientRect().width||0)/3370*100,
    level: document.querySelector(".tpdf-tile-document")?.getAttribute("data-tpdf-level"),
  }));
  expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth);
  expect(metrics.zoom).toBeGreaterThanOrEqual(5);
  expect(metrics.zoom).toBeLessThan(25);
  expect(metrics.level).toBe("0.25");
  console.log("S3_FIT_A0", metrics);
});

test("slow initial host tile displays page-size skeleton and removes it after decode", async ({ page }) => {
  test.setTimeout(65000);
  await page.setViewportSize({ width: 375, height: 812 });
  await page.route(/\/api\/tiles\/\d+\//, async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    await route.continue().catch(() => {});
  });
  await page.goto(url);
  const skeleton = page.locator('[data-tpdf-page="1"] .tpdf-tile-skeleton');
  await expect(skeleton).toBeVisible({ timeout: 30000 });
  const dims = await page.locator('[data-tpdf-page="1"]').evaluate((node) => {
    const outer = node.getBoundingClientRect();
    const inner = node.querySelector(".tpdf-tile-skeleton")!.getBoundingClientRect();
    return { width: outer.width, height: outer.height,
      equalWidth: Math.abs(outer.width - inner.width) < 1,
      equalHeight: Math.abs(outer.height - inner.height) < 1 };
  });
  expect(dims.equalWidth).toBe(true);
  expect(dims.equalHeight).toBe(true);
  await expect(skeleton).toHaveCount(0, { timeout: 30000 });
  await expect(page.locator("[data-tpdf-tile]").first()).toBeVisible();
  console.log("S3_SKELETON", dims);
});
