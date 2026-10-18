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

    await strip.getByRole("tab", { name: "Shapes" }).click();
    await expect(strip.getByRole("tab", { name: "Shapes" })).toHaveAttribute("aria-selected", "true");
    await expect(page.locator("body")).not.toHaveAttribute("data-embedpdf-overlay", "open");

    // Off-screen tabs remain accessible by horizontal pan, without a select menu.
    await scroller.evaluate(element => { element.scrollLeft = element.scrollWidth; });
    await strip.getByRole("tab", { name: "Redact" }).click();
    await expect(strip.getByRole("tab", { name: "Redact" })).toHaveAttribute("aria-selected", "true");
    await expect(page.locator("[data-tpdf-region='mobile-dock']")).toBeVisible();
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

    await sheet.locator('[data-tpdf-mobile-tool="rectangle"]').click();
    await expect(sheet).toBeHidden();
    await expect(strip.getByRole("tab", { name: "Shapes" })).toHaveAttribute("aria-selected", "true");
    await strip.getByRole("button", { name: "All PDF tools" }).click();
    await sheet.locator('[data-tpdf-mobile-tool="highlight"]').click();
    await expect(strip.getByRole("tab", { name: "Annotate" })).toHaveAttribute("aria-selected", "true");
    await expect(page.locator("[data-tpdf-engine='pdfium-wasm']")).toBeVisible();

    expect(await page.evaluate(() => document.querySelector("embedpdf-container") ===
      (window as typeof window & { __originalEmbedHost?: Element | null }).__originalEmbedHost)).toBe(true);
  });
});
