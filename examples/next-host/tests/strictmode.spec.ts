import { test, expect } from "@playwright/test";

test("Next dev StrictMode renders image tiles after effect replay and real remount", async ({ page }) => {
  test.setTimeout(60000);
  const requested: string[] = [];
  page.on("request", (request) => {
    if (/\/api\/tiles\/\d+\//.test(request.url())) requested.push(request.url());
  });
  await page.goto("/office/pdf?tiles=1");
  const viewer = page.locator(".tpdf-tile-document");
  await expect(viewer).toBeVisible({ timeout: 30000 });
  const images = page.locator("[data-tpdf-tile]");
  const decodedCount = () => images.evaluateAll((nodes) => nodes.filter((node) => {
    const image = node as HTMLImageElement;
    return image.complete && image.naturalWidth > 0;
  }).length);
  await expect.poll(decodedCount, { timeout: 30000 }).toBeGreaterThan(0);
  const before = await images.evaluateAll((nodes) =>
    nodes.map((node) => (node as HTMLImageElement).src));
  const countBefore = requested.length;
  await page.getByTestId("remount-tile-viewer").click();
  await expect(viewer).toBeVisible();
  await expect.poll(decodedCount, { timeout: 30000 }).toBeGreaterThan(0);
  await expect.poll(async () => images.evaluateAll((nodes, first) =>
    nodes.some((node) => !first.includes((node as HTMLImageElement).src)), before))
    .toBe(true);
  expect(requested.length).toBeGreaterThan(countBefore);
  const mounted = await images.count();
  const active = Number(await viewer.getAttribute("data-tpdf-active"));
  expect(mounted).toBeGreaterThan(0);
  expect(mounted).toBeLessThanOrEqual(96);
  expect(active).toBeLessThanOrEqual(8);
  console.log("STRICTMODE_DEV", { imageCount: mounted, activeRequests: active,
    fetchCount: requested.length, remountAdded: requested.length - countBefore });
});

test("Next dev viewport change aborts stale tiles and keeps budgets", async ({ page }) => {
  test.setTimeout(60000);
  const failures: string[] = [];
  const requestUrls: string[] = [];
  page.on("request", (request) => {
    if (/\/api\/tiles\/\d+\//.test(request.url())) requestUrls.push(request.url());
  });
  page.on("requestfailed", (request) => {
    if (/\/api\/tiles\/\d+\//.test(request.url())) failures.push(request.failure()?.errorText || "");
  });
  await page.route(/\/api\/tiles\/\d+\//, async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 400));
    try { await route.continue(); } catch { /* Browser aborted the old tile. */ }
  });
  await page.goto("/office/pdf?tiles=1");
  const viewer = page.locator(".tpdf-tile-document");
  await expect(viewer).toBeVisible({ timeout: 30000 });
  await expect.poll(() => requestUrls.length).toBeGreaterThan(0);
  await page.locator(".tpdf-scroll").evaluate((node) => {
    node.scrollTop = node.scrollHeight - node.clientHeight;
  });
  await expect.poll(() => failures.length, { timeout: 15000 }).toBeGreaterThan(0);
  const active = Number(await viewer.getAttribute("data-tpdf-active"));
  expect(active).toBeLessThanOrEqual(8);
  expect(await page.locator("[data-tpdf-tile]").count()).toBeLessThanOrEqual(96);
  console.log("SCROLL_ABORT_DEV", { requested: requestUrls.length,
    aborted: failures.length, active });
});
