import { test, expect } from "@playwright/test";
const url = "/office/pdf?tiles=1&tileonly=1&shell=app&p1=1";

async function drag(page: import("@playwright/test").Page) {
  const overlay = page.locator('[data-tpdf-page="1"] .tpdf-page-overlay');
  await expect(overlay).toBeVisible();
  const rect = await overlay.boundingBox();
  expect(rect).toBeTruthy();
  const x = rect!.x + 45, y = rect!.y + 42;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 85, y + 38, { steps: 7 });
  await page.mouse.up();
}
async function select(page: import("@playwright/test").Page, name: string) {
  await page.getByRole("button", { name: "Tools", exact: true }).click();
  await page.getByRole("dialog", { name: "All tools" })
    .getByRole("button", { name, exact: true }).first().click();
}
async function save(page: import("@playwright/test").Page) {
  await page.getByRole("button", { name: "Save", exact:true }).last().click();
  await expect(page.getByTestId("p1-payload")).not.toHaveText("", { timeout: 10000 });
  return JSON.parse(await page.getByTestId("p1-payload").textContent() || "[]");
}

test("P1 Rectangle uses unified style and saves typed percent-space geometry", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(url);
  await expect(page.locator(".tpdf-tile-document")).toBeVisible({ timeout: 30000 });
  await select(page, "Style");
  await expect(page.getByTestId("p1-stylebar")).toBeVisible();
  await page.getByLabel("Stroke color").fill("#00aa88");
  await page.getByLabel("Opacity").focus();
  await page.getByLabel("Opacity").press("Home");
  for (let i = 0; i < 10; i++) await page.getByLabel("Opacity").press("ArrowRight");
  await select(page, "Rectangle");
  await drag(page);
  await expect(page.locator(".tpdf-p1-rectangle")).toHaveCount(1);
  const changes = await save(page);
  expect(changes).toHaveLength(1);
  expect(changes[0].kind).toBe("mark");
  expect(changes[0].mark.type).toBe("rectangle");
  expect(changes[0].mark.schemaVersion).toBe(1);
  expect(changes[0].mark.style.strokeColor).toBe("#00aa88");
  expect(changes[0].mark.style.opacity).toBe(0.5);
  expect(changes[0].mark.region.x).toBeGreaterThan(0);
  expect(changes[0].mark.region.x).toBeLessThanOrEqual(100);
});

test("P1 text underline uses host-supplied real quads, not a guessed rectangle", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(url);
  await expect(page.locator(".tpdf-tile-document")).toBeVisible({ timeout: 30000 });
  await select(page, "Underline");
  await drag(page);
  await expect(page.locator(".tpdf-p1-underline")).toHaveCount(1);
  const changes = await save(page);
  expect(changes[0].mark.type).toBe("underline");
  expect(changes[0].mark.quads[0]).toHaveLength(4);
  expect(changes[0].mark.schemaVersion).toBe(1);
});

test("P1 image is a host asset reference and P2/P3 stay visibly disabled", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(url);
  await expect(page.locator(".tpdf-tile-document")).toBeVisible({ timeout: 30000 });
  await page.getByRole("button", { name: "Tools", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "All tools" });
  for (const future of ["Distance", "Replace text", "Text field", "Attachment", "Link"]) {
    await expect(dialog.getByRole("button", { name: new RegExp(future, "i") })).toBeDisabled();
  }
  await dialog.getByRole("button", { name: "Image", exact: true }).click();
  await drag(page);
  await expect(page.locator(".tpdf-p1-image")).toHaveCount(1);
  const changes = await save(page);
  expect(changes[0].mark).toMatchObject({
    type: "image", schemaVersion: 1, assetId: "host-image-fixture",
  });
  expect(JSON.stringify(changes)).not.toContain("base64");
});
