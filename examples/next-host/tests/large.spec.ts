import { test, expect } from "@playwright/test";

test("250-300 MiB: first-page Range budget, bounded canvas and Chromium memory", async ({
  page, request,
}) => {
  test.skip(!process.env.TPDF_LARGE_PDF_E2E, "Generate fixture and set TPDF_LARGE_PDF_E2E=1");
  test.setTimeout(180000);
  const base = "http://127.0.0.1:3400";
  const head = await request.head(base + "/large-fixture.pdf");
  expect(head.status()).toBe(200);
  expect(head.headers()["accept-ranges"]).toContain("bytes");
  const bytes = Number(head.headers()["content-length"]);
  expect(bytes).toBeGreaterThan(250 * 1024 * 1024);
  expect(bytes).toBeLessThan(300 * 1024 * 1024);
  const probe = await request.get(base + "/large-fixture.pdf", {
    headers: { Range: "bytes=0-65535" },
  });
  expect(probe.status()).toBe(206);
  expect((await probe.body()).length).toBe(65536);
  await request.post(base + "/__stats/reset");
  const started = Date.now();
  await page.goto("/office/pdf?large=1", { waitUntil: "domcontentloaded" });
  await expect(page.locator('[data-tpdf-page="1"] canvas[data-tpdf-painted="true"]'))
    .toBeVisible({ timeout: 20000 });
  const firstMs = Date.now() - started;
  const first = await (await request.get(base + "/__stats")).json();
  const fraction = first.totalBytes / bytes;
  const client = await page.context().newCDPSession(page);
  await client.send("HeapProfiler.enable");
  async function heapMB() {
    await client.send("HeapProfiler.collectGarbage");
    const heap = await client.send("Runtime.getHeapUsage");
    return heap.usedSize / (1024 * 1024);
  }
  const mainHeapMB = [await heapMB()];
  let maxCanvases = await page.locator(".tpdf-page-canvas").count();
  for (let n = 2; n <= 101; n++) {
    await page.evaluate((index) => {
      document.querySelector('[data-tpdf-page="' + index + '"]')?.scrollIntoView({
        block: "start", behavior: "instant",
      });
    }, n);
    if (n % 10 === 1) {
      await page.waitForTimeout(200);
      maxCanvases = Math.max(maxCanvases, await page.locator(".tpdf-page-canvas").count());
      mainHeapMB.push(await heapMB());
    }
  }
  await page.waitForTimeout(500);
  mainHeapMB.push(await heapMB());
  const finalStats = await (await request.get(base + "/__stats")).json();
  console.log("TPDF_S1_MEASUREMENTS " + JSON.stringify({
    fileMiB: +(bytes / (1024 * 1024)).toFixed(2),
    firstPageSeconds: +(firstMs / 1000).toFixed(2),
    firstPageServedMiB: +(first.totalBytes / (1024 * 1024)).toFixed(2),
    firstPageServedPercent: +(fraction * 100).toFixed(2),
    scrolledPages: 100, totalServedMiB: +(finalStats.totalBytes / (1024 * 1024)).toFixed(2),
    mainHeapMB, maxCanvases, requests: finalStats.requests,
  }));
  expect(firstMs).toBeLessThan(20000);
  expect(fraction).toBeLessThan(0.05);
  expect(maxCanvases).toBeLessThanOrEqual(8);
  // CDP main-thread heap after GC; not a claim about worker/GPU/process RSS.
  expect(Math.max(...mainHeapMB)).toBeLessThan(mainHeapMB[0] + 256);
  expect(mainHeapMB.at(-1)!).toBeLessThan(mainHeapMB[1] + 128);
});

test("large PDF viewer stays inside a 390 px Next host", async ({ page }) => {
  test.skip(!process.env.TPDF_LARGE_PDF_E2E, "Large fixture opt-in");
  await page.setViewportSize({ width: 390, height: 840 });
  await page.goto("/office/pdf?large=1");
  await expect(page.locator('[data-tpdf-page="1"] canvas[data-tpdf-painted="true"]'))
    .toBeVisible({ timeout: 20000 });
  await expect(page.getByLabel("Zoom")).toBeVisible();
  const sizes = await page.locator(".tpdf-editor").evaluate((el) =>
    ({ editor: el.getBoundingClientRect().width, viewport: window.innerWidth }));
  expect(sizes.editor).toBeLessThanOrEqual(sizes.viewport);
});
