import { test, expect } from "@playwright/test";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

async function createFixturePdf() {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let i = 1; i <= 2; i++) {
    const page = doc.addPage([595, 842]);
    page.drawText(`Page ${i} - Mobile EmbedPDF Test`, { x: 50, y: 750, size: 20, font, color: rgb(0,0,0) });
  }
  return Buffer.from(await doc.save());
}

test.describe("Mobile EmbedPDF Modes & Tools UI/UX Audit", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test("hides mobile dock when EmbedPDF sheets open", async ({ page }) => {
    await page.goto("/", { waitUntil: "networkidle" });

    // Open fixture PDF
    const pdfBytes = await createFixturePdf();
    const fileChooserPromise = page.waitForEvent("filechooser");
    await page.getByRole("button", { name: /open pdf/i }).first().click();
    const chooser = await fileChooserPromise;
    await chooser.setFiles({ name: "embedpdf-test.pdf", mimeType: "application/pdf", buffer: pdfBytes });

    await page.waitForSelector("[data-tpdf-engine='pdfium-wasm']", { timeout: 30000 });
    await page.waitForTimeout(1000);

    const mobileDock = page.locator("[data-tpdf-region='mobile-dock']");

    // Initially when viewing without sheets open, mobile dock is present
    await expect(mobileDock).toBeVisible();

    // 1. Open Mode Picker Sheet
    await page.evaluate(() => {
      const host = document.querySelector("embedpdf-container");
      const btns = [...host.shadowRoot.querySelectorAll("button")];
      const trigger = btns.find(b => b.textContent?.trim() === "View" && b.getBoundingClientRect().y < 140);
      trigger?.click();
    });
    await page.waitForTimeout(500);

    // Verify overlay sync attribute is set
    await expect(page.locator("body")).toHaveAttribute("data-embedpdf-overlay", "open");
    // Verify dock is cleanly hidden to prevent collision
    await expect(mobileDock).toBeHidden();

    // Verify mode buttons in sheet are visible
    const sheetItems = await page.evaluate(() => {
      const host = document.querySelector("embedpdf-container");
      const btns = [...host.shadowRoot.querySelectorAll("button")];
      return btns
        .filter(b => b.getBoundingClientRect().y > 200 && b.getBoundingClientRect().height > 0)
        .map(b => b.textContent?.trim());
    });
    expect(sheetItems).toContain("View");
    expect(sheetItems).toContain("Annotate");
    expect(sheetItems).toContain("Shapes");
    expect(sheetItems).toContain("Insert");
    expect(sheetItems).toContain("Form");

    // 2. Switch to Insert mode
    await page.evaluate(() => {
      const host = document.querySelector("embedpdf-container");
      const btns = [...host.shadowRoot.querySelectorAll("button")];
      const item = btns.find(b => b.textContent?.trim() === "Insert" && b.getBoundingClientRect().y > 200);
      item?.click();
    });
    await page.waitForTimeout(600);

    // Overlay is closed, dock should reappear
    await expect(page.locator("body")).not.toHaveAttribute("data-embedpdf-overlay", "open");
    await expect(mobileDock).toBeVisible();

    // 3. Open Rubber Stamps sheet in Insert mode
    await page.evaluate(() => {
      const host = document.querySelector("embedpdf-container");
      const btns = [...host.shadowRoot.querySelectorAll("button")];
      const stamp = btns.find(b => (b.getAttribute("aria-label") || b.getAttribute("title") || "").includes("Rubber Stamp"));
      stamp?.click();
    });
    await page.waitForTimeout(500);

    // Verify overlay sync attribute and hidden dock during Rubber Stamps
    await expect(page.locator("body")).toHaveAttribute("data-embedpdf-overlay", "open");
    await expect(mobileDock).toBeHidden();

    // 4. Dismiss by tapping backdrop overlay
    await page.evaluate(() => {
      const host = document.querySelector("embedpdf-container");
      const overlay = host?.shadowRoot?.querySelector(".bg-bg-overlay");
      overlay?.click();
    });
    await page.waitForTimeout(500);

    // Overlay dismissed
    await expect(page.locator("body")).not.toHaveAttribute("data-embedpdf-overlay", "open");
    await expect(mobileDock).toBeVisible();
  });

  test("activates tools on first click and switches tools smoothly without viewer remount", async ({ page, request }) => {
    const upload = await request.post("/api/tpdf/documents?name=mobile-tools-instant.pdf", {
      headers: { "Content-Type": "application/pdf" },
      data: await createFixturePdf(),
    });
    expect(upload.status()).toBe(201);
    const document = await upload.json();

    await page.goto("/?open=" + encodeURIComponent(document.filePath), { waitUntil: "networkidle" });
    const viewer = page.locator("[data-tpdf-engine='pdfium-wasm']");
    await expect(viewer).toBeVisible({ timeout: 30000 });

    const dock = page.locator("[data-tpdf-region='mobile-dock']");
    await expect(dock).toBeVisible();

    // Tap Annotate in dock to reveal quick tools
    await dock.getByRole("button", { name: "Annotate" }).click();

    const dockTools = ["Highlight", "Add text", "Draw", "Rectangle"];
    for (const toolName of dockTools) {
      const btn = dock.locator(`.tpdf-mobile-dock-row--tools button[aria-label='${toolName}']`);
      await expect(btn).toBeVisible();
      await btn.click();
      // Must activate on the very first click
      await expect(btn).toHaveAttribute("aria-pressed", "true", { timeout: 3000 });
    }

    // Open sheet for secondary tools
    await dock.getByRole("button", { name: "Tools", exact: true }).click();
    await expect(page.locator("[data-tpdf-mobile-tools='open']")).toBeVisible();
    await page.locator('[data-tpdf-mobile-tool="measure"]').click();
    await expect(dock.getByRole("button", { name: "Annotate" })).toHaveAttribute("aria-pressed", "true");

    // Return to Read mode
    const readBtn = dock.getByRole("button", { name: "Read" });
    await readBtn.click();
    await expect(readBtn).toHaveAttribute("aria-pressed", "true");
  });
});
