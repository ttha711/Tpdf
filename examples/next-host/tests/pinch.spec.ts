import { test, expect } from "@playwright/test";

test("two-touch pinch switches to sharper tiles after transient preview", async ({ page }) => {
  await page.goto("/office/pdf?tiles=1");
  const viewer = page.locator(".tpdf-tile-document");
  await expect(viewer).toBeVisible({ timeout: 30000 });
  const before = Number(await viewer.getAttribute("data-tpdf-level"));
  await page.locator(".tpdf-scroll").evaluate((root) => {
    const send = (type: string, id: number, x: number, y: number) => root.dispatchEvent(
      new PointerEvent(type, { bubbles: true, cancelable: true,
        pointerType: "touch", pointerId: id, clientX: x, clientY: y }));
    send("pointerdown", 1, 100, 200);
    send("pointerdown", 2, 200, 200);
    send("pointermove", 2, 400, 200);
    send("pointerup", 2, 400, 200);
    send("pointerup", 1, 100, 200);
  });
  await expect.poll(async () => Number(await viewer.getAttribute("data-tpdf-level")))
    .toBeGreaterThan(before);
});
