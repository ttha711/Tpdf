import { test, expect } from "@playwright/test";

test("retina fit chooses a level at least zoom times DPR", async ({ browser }) => {
  const context = await browser.newContext({ deviceScaleFactor: 2, viewport: { width: 1200, height: 800 } });
  const page = await context.newPage();
  const requests: string[] = [];
  page.on("request", (request) => { if (request.url().includes("/api/tiles/")) requests.push(request.url()); });
  await page.goto("/office/pdf?tiles=1");
  await expect(page.locator(".tpdf-tile-document")).toBeVisible({ timeout: 30000 });
  await expect.poll(() => requests.length).toBeGreaterThan(0);
  const level = Number(await page.locator(".tpdf-tile-document").getAttribute("data-tpdf-level"));
  const width = await page.locator('[data-tpdf-page="1"]').evaluate((el) => el.getBoundingClientRect().width);
  expect(level).toBeGreaterThanOrEqual(width / 3370.5 * 2 - 0.01);
  expect(requests[0]).toContain("/api/tiles/");
  await context.close();
});

test("800 percent never exceeds 96 images, 8 requests or all pages", async ({ browser }) => {
  const context = await browser.newContext({ deviceScaleFactor: 2, viewport: { width: 1200, height: 800 } });
  const page = await context.newPage();
  await page.goto("/office/pdf?tiles=1");
  await expect(page.locator(".tpdf-tile-document")).toBeVisible({ timeout: 30000 });
  await page.getByLabel("Zoom").selectOption("8");
  await expect(page.locator(".tpdf-tile-document")).toHaveAttribute("data-tpdf-level", "16");
  await page.waitForTimeout(1000);
  expect(await page.locator("[data-tpdf-tile]").count()).toBeLessThanOrEqual(96);
  expect(Number(await page.locator(".tpdf-tile-document").getAttribute("data-tpdf-active"))).toBeLessThanOrEqual(8);
  expect(await page.locator("[data-tpdf-page]").count()).toBeLessThan(100);
  await context.close();
});

test("scroll through 100 pages keeps tile cache bounded", async ({ page }) => {
  const aborted: string[] = [];
  page.on("requestfailed", (request) => { if (request.url().includes("/api/tiles")) aborted.push(request.url()); });
  await page.goto("/office/pdf?tiles=1");
  await expect(page.locator(".tpdf-tile-document")).toBeVisible({ timeout: 30000 });
  await page.locator(".tpdf-scroll").evaluate((el) => { el.scrollTop = el.scrollHeight * .9; });
  await expect.poll(async () => Number(await page.locator(".tpdf-tile-document").getAttribute("data-tpdf-cache"))).toBeLessThanOrEqual(256);
  expect(await page.locator("[data-tpdf-page]").count()).toBeLessThan(100);
  expect(Number(await page.locator(".tpdf-tile-document").getAttribute("data-tpdf-active"))).toBeLessThanOrEqual(8);
  void aborted;
});

test("right and bottom edge tiles are clipped precisely", async ({ page }) => {
  await page.goto("/office/pdf?tiles=1");
  await expect(page.locator(".tpdf-tile-document")).toBeVisible({ timeout: 30000 });
  await page.getByLabel("Zoom").selectOption("0.5");
  await page.locator(".tpdf-scroll").evaluate((el) => {
    el.scrollLeft = el.scrollWidth;
    el.scrollTop = 600;
  });
  await page.waitForTimeout(1800);
  const diagnostic = await page.locator(".tpdf-scroll").evaluate((el) => ({
    scrollLeft: el.scrollLeft, scrollTop: el.scrollTop, width: el.clientWidth,
    height: el.clientHeight, scrollWidth: el.scrollWidth,
    level: document.querySelector(".tpdf-tile-document")?.getAttribute("data-tpdf-level"),
    active: document.querySelector(".tpdf-tile-document")?.getAttribute("data-tpdf-active"),
    loaded: [...document.querySelectorAll("[data-tpdf-tile]")]
      .map((item) => item.getAttribute("data-tpdf-tile")).slice(0, 24),
  }));
  console.log("EDGE_TILE_DEBUG", diagnostic);
  const corner = page.locator('[data-tpdf-page="1"] [data-tpdf-tile$=":3:2"]');
  await expect(corner).toHaveCount(1, { timeout: 20000 });
  const positions = await corner.evaluate((img) => {
    const rect = img.parentElement!.getBoundingClientRect();
    const page = img.closest<HTMLElement>("[data-tpdf-page]")!.getBoundingClientRect();
    return { dx: rect.right - page.right, dy: rect.bottom - page.bottom,
      width: rect.width, height: rect.height };
  });
  expect(Math.abs(positions.dx)).toBeLessThan(1);
  expect(Math.abs(positions.dy)).toBeLessThan(1);
  expect(positions.width).toBeGreaterThan(0);
  expect(positions.height).toBeGreaterThan(0);
});
test("390px tile layout remains usable", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 840 });
  await page.goto("/office/pdf?tiles=1");
  await expect(page.locator(".tpdf-tile-document")).toBeVisible({ timeout: 30000 });
  await expect(page.getByLabel("Zoom")).toBeVisible();
  await expect(page.locator(".tpdf-scroll")).toBeVisible();
});
