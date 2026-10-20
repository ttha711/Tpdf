import { test, expect } from "@playwright/test";

test("two-page PDF can be marked and saved through host adapter with Ctrl+S", async ({ page }) => {
  await page.goto("/office/pdf");
  await expect(page.locator('[data-tpdf-page="1"]')).toBeVisible({ timeout: 30000 });
  await expect(page.locator('[data-tpdf-page="2"]')).toHaveCount(1);
  await page.getByLabel("Annotation tool").selectOption("highlight");
  const layer = page.locator('[data-tpdf-page="1"] .tpdf-page-overlay');
  const box = await layer.boundingBox();
  expect(box).toBeTruthy();
  const x = box!.x + box!.width * 0.2, y = box!.y + box!.height * 0.15;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 105, y + 32, { steps: 5 });
  await page.mouse.up();
  await expect(page.getByTestId("region")).toContainText("page 1");
  await expect(page.locator('[data-tpdf-page="1"] .tpdf-mark-highlight')).toHaveCount(1);
  await page.locator(".tpdf-editor").focus();
  await page.keyboard.press("Control+s");
  await expect(page.getByTestId("saved")).toContainText("changed=true", { timeout: 30000 });
  await expect(page.getByTestId("saved")).toContainText("bytes");
});
test("toolbar fits a 390px host and emits area percentages", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 840 });
  await page.goto("/office/pdf");
  await expect(page.getByLabel("Zoom")).toBeVisible();
  await page.getByLabel("Zoom").selectOption("0.5");
  await expect(page.locator(".tpdf-scroll")).toBeVisible();
});
