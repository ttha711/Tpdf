import { test, expect, type Page } from "@playwright/test";
const url="/office/pdf?tiles=1&tileonly=1&shell=app&p1=1&p2=1&p3=1";
const sizes=[{width:1280,height:800,layout:"desktop"},
  {width:1024,height:768,layout:"desktop"},
  {width:768,height:1024,layout:"tablet"},
  {width:375,height:812,layout:"mobile"}] as const;
async function ready(page:Page,layout:string){
  await expect(page.locator(".tpdf-editor")).toHaveAttribute("data-tpdf-layout",layout,
    {timeout:30000});
  await expect(page.locator(".tpdf-tile-document")).toBeVisible({timeout:30000});
}
for(const size of sizes){
  test("S4 layout "+size.width+"x"+size.height+" fits host container",async({page})=>{
    await page.setViewportSize(size);
    await page.goto(url);
    await ready(page,size.layout);
    if(size.layout==="mobile"){
      await expect(page.locator(".tpdf-app-dock")).toBeVisible();
      await expect(page.getByTestId("desktop-shell")).toHaveCount(0);
    }else{
      await expect(page.getByTestId("desktop-shell")).toBeVisible();
      await expect(page.getByTestId("desktop-ribbon")).toBeVisible();
      await expect(page.locator(".tpdf-app-dock")).toHaveCount(0);
      await expect(page.getByRole("tab",{name:"Annotate"})).toBeVisible();
      await expect(page.getByRole("tab",{name:"Measure"})).toBeVisible();
      await expect(page.getByRole("tab",{name:"Convert"})).toBeVisible();
      if(size.layout==="tablet"){
        await expect(page.getByTestId("desktop-sidebar")).toHaveCount(0);
        await page.getByRole("button",{name:"Open sidebar"}).click();
      }
      await expect(page.getByTestId("desktop-sidebar")).toBeVisible();
      await expect(page.getByRole("combobox",{name:"Desktop zoom"})).toBeVisible();
    }
    const bounds=await page.evaluate(()=>{
      const root=document.querySelector(".tpdf-editor")!.getBoundingClientRect();
      const viewer=document.querySelector(".tpdf-scroll")!.getBoundingClientRect();
      return { rootWidth:root.width,viewerWidth:viewer.width,
        overflow:document.documentElement.scrollWidth-innerWidth,
        readerHeight:viewer.height, zoom:Number(document.querySelector(".tpdf-app-status span:last-child")?.textContent?.replace("%","")) };
    });
    expect(bounds.overflow).toBeLessThanOrEqual(1);
    expect(bounds.readerHeight).toBeGreaterThan(200);
    console.log("S4_LAYOUT",size,bounds);
    await page.screenshot({path:"test-results/screenshots/s4-"+size.width+"x"+size.height+".png"});
  });
}
test("S4 uses container width, not viewport, when embedded at 600px",async({page})=>{
  await page.setViewportSize({width:1280,height:800});
  await page.goto(url+"&embedwidth=600");
  await ready(page,"mobile");
  await expect(page.locator(".tpdf-app-dock")).toBeVisible();
  await expect(page.getByTestId("desktop-shell")).toHaveCount(0);
  const width=await page.locator(".tpdf-editor").evaluate(node=>node.getBoundingClientRect().width);
  expect(width).toBeLessThanOrEqual(600);
});
test("S4 desktop host commands, bookmark navigation and keyboard find",async({page})=>{
  await page.setViewportSize({width:1280,height:800});
  await page.goto(url);await ready(page,"desktop");
  await page.getByRole("tab",{name:"Convert"}).click();
  await page.getByRole("button",{name:"PDF to Word"}).click();
  await expect(page.getByTestId("tool-run")).toHaveText("pdf-to-word");
  await page.getByRole("button",{name:"bookmarks panel"}).click();
  await page.getByRole("button",{name:/Floor plans/}).click();
  await expect(page.getByRole("spinbutton",{name:"Go to page"})).toHaveValue("12");
  await page.locator(".tpdf-editor").focus();
  await page.keyboard.press("Control+f");
  const find=page.getByRole("textbox",{name:"Find in PDF"});
  await expect(find).toBeFocused();
  await find.fill("schedule");
  await find.press("Enter");
  await expect(page.getByTestId("desktop-search-results")).toContainText("Page 35");
  await page.getByRole("button",{name:/Page 35/}).click();
  await expect(page.getByRole("spinbutton",{name:"Go to page"})).toHaveValue("35");
});
test("S4 inspector uses existing P3 without editing adapter contracts",async({page})=>{
  await page.setViewportSize({width:1280,height:800});
  await page.goto(url);await ready(page,"desktop");
  await page.getByRole("tab",{name:"Redact"}).click();
  await page.getByRole("toolbar",{name:"redact commands"})
    .getByRole("button",{name:/Redact/i}).first().click();
  const inspector=page.getByTestId("desktop-inspector");
  await expect(inspector).toBeVisible();
  await expect(inspector.getByTestId("p3-panel")).toBeVisible();
  await inspector.getByRole("button",{name:"Close inspector"}).click();
  await expect(inspector).toHaveCount(0);
  await page.getByRole("button",{name:"Open inspector"}).click();
  await expect(inspector).toBeVisible();
  await page.getByRole("combobox",{name:"Desktop zoom"}).selectOption("125");
  await expect(page.getByRole("combobox",{name:"Desktop zoom"})).toContainText("125%");
  await page.getByRole("combobox",{name:"Desktop zoom"}).selectOption("width");
  await expect(page.locator(".tpdf-tile-document")).toBeVisible();
});
test("S4 sidebar resize via keyboard and toolbar keys do not scroll host page",async({page})=>{
  await page.setViewportSize({width:1280,height:800});
  await page.goto(url);await ready(page,"desktop");
  const separator=page.getByRole("separator",{name:"Resize sidebar"});
  await separator.focus();
  const before=Number(await separator.getAttribute("aria-valuenow"));
  await page.keyboard.press("ArrowRight");
  const after=Number(await separator.getAttribute("aria-valuenow"));
  expect(after).toBeGreaterThan(before);
  await page.locator(".tpdf-editor").focus();
  await page.keyboard.press("PageDown");
  await expect(page.getByRole("spinbutton",{name:"Go to page"})).toHaveValue("2");
});
