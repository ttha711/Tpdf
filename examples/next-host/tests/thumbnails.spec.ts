import { test, expect } from "@playwright/test";

test("page grid composes full thumbnails from 0.25-level tiles", async ({ page }) => {
  const tiles: string[] = [];
  page.on("request", (request) => { if (request.url().includes("/api/tiles/")) tiles.push(request.url()); });
  await page.goto("/office/pdf?tiles=1");
  await expect(page.locator(".tpdf-tile-document")).toBeVisible({ timeout: 30000 });
  await page.getByRole("button", { name: "Pages", exact: true }).click();
  await expect(page.locator("[data-tpdf-thumbnail='1']")).toBeVisible({ timeout: 20000 });
  await expect.poll(() => tiles.filter((t) => t.includes("/api/tiles/0/0.25/")).length)
    .toBeGreaterThanOrEqual(4);
  expect(await page.locator(".tpdf-page-grid img").count()).toBe(0);
  expect(Number(await page.locator(".tpdf-page-grid")
    .getAttribute("data-tpdf-thumbnail-active"))).toBeLessThanOrEqual(8);
});
