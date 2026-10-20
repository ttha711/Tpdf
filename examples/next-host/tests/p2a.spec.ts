import { test, expect, type Page } from "@playwright/test";
const url = "/office/pdf?tiles=1&tileonly=1&shell=app&p2=1";
async function openTool(page:Page, name:string) {
  await page.getByRole("button",{name:"Tools",exact:true}).click();
  const sheet=page.getByRole("dialog",{name:"All tools"});
  await expect(sheet).toBeVisible();
  await sheet.getByRole("button",{name,exact:true}).click();
}
async function place(page:Page) {
  const overlay=page.locator('[data-tpdf-page="1"] .tpdf-page-overlay');
  await expect(overlay).toBeVisible({timeout:30000});
  const rect=await overlay.boundingBox();
  expect(rect).toBeTruthy();
  const x=rect!.x+35,y=rect!.y+35;
  await page.mouse.move(x,y);await page.mouse.down();
  await page.mouse.move(x+65,y+26,{steps:4});await page.mouse.up();
}
async function payload(page:Page) {
  await page.getByRole("button",{name:"Save version"}).first().click();
  await expect(page.getByTestId("p1-payload")).not.toHaveText("",{timeout:10000});
  return JSON.parse(await page.getByTestId("p1-payload").textContent()||"[]");
}
test("tile-only P2a create text then fill same field before saving keeps ordered changes", async ({page})=>{
  await page.setViewportSize({width:375,height:812});
  const pdfRequests:string[]=[];
  page.on("request",request=>{if(request.url().includes("fixture.pdf"))pdfRequests.push(request.url());});
  await page.goto(url);
  await expect(page.locator(".tpdf-tile-document")).toBeVisible({timeout:30000});
  await openTool(page,"Text field");
  await expect(page.getByRole("tab",{name:"Form"})).toHaveAttribute("aria-selected","true");
  await place(page);
  await page.getByLabel("Field name").fill("new-on-board");
  await page.getByLabel("Tooltip").fill("Họ tên");
  await page.getByLabel("Default text").fill("Original");
  await page.getByLabel("Max length").fill("64");
  await page.getByRole("button",{name:"Add field"}).click();
  await expect(page.locator('[data-tpdf-p2="form"]')).toHaveCount(1);
  await openTool(page,"Fill");
  await page.getByLabel("Choose field").selectOption("new-on-board");
  await page.getByLabel("Fill text").fill("Nguyễn Thị Ạ");
  await page.getByRole("button",{name:"Apply fill"}).click();
  const changes=await payload(page);
  expect(changes.map((c:{kind:string})=>c.kind)).toEqual(["form.create","form.fill"]);
  expect(changes[0].field).toMatchObject({
    type:"text",name:"new-on-board",tooltip:"Họ tên",defaultValue:"Original",maxLength:64,
  });
  expect(changes[1]).toMatchObject({name:"new-on-board",fieldType:"text",value:"Nguyễn Thị Ạ"});
  expect(pdfRequests).toEqual([]);
  const metrics=await page.evaluate(()=>({scrollWidth:document.documentElement.scrollWidth,
    windowWidth:innerWidth,viewerHeight:document.querySelector(".tpdf-app-viewer")!.getBoundingClientRect().height}));
  expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.windowWidth+1);
  console.log("P2A_CREATE_FILL",changes.length,metrics);
});
test("checkbox stays Yes and radio/multi-select capabilities are disabled in UI",async ({page})=>{
  await page.setViewportSize({width:390,height:844});
  await page.goto(url);
  await expect(page.locator(".tpdf-tile-document")).toBeVisible({timeout:30000});
  await page.getByRole("button",{name:"Tools",exact:true}).click();
  const dialog=page.getByRole("dialog",{name:"All tools"});
  await expect(dialog.getByRole("button",{name:/Radio/i})).toBeDisabled();
  await dialog.getByRole("button",{name:"Checkbox",exact:true}).click();
  await place(page);
  await page.getByLabel("Field name").fill("flag");
  await expect(page.getByLabel("Checkbox export value")).toBeDisabled();
  await expect(page.getByLabel("Checkbox export value")).toHaveValue("Yes");
  await page.getByRole("button",{name:"Add field"}).click();
  const changes=await payload(page);
  expect(changes[0].field).toMatchObject({type:"checkbox",name:"flag",exportValue:"Yes"});
});
test("single-select list box allows only one option, Fill selects one export value",async ({page})=>{
  await page.setViewportSize({width:390,height:844});
  await page.goto(url);await expect(page.locator(".tpdf-tile-document")).toBeVisible({timeout:30000});
  await openTool(page,"List box");await place(page);
  await page.getByLabel("Field name").fill("priority");
  await expect(page.getByText(/Multiple selection/)).toBeVisible();
  await expect(page.getByRole("checkbox",{name:/Multiple selection/})).toBeDisabled();
  await page.getByLabel("Field options").fill("High=H\nLow=L");
  await page.getByLabel("Default choice").selectOption("H");
  await page.getByRole("button",{name:"Add field"}).click();
  await openTool(page,"Fill");
  await page.getByLabel("Choose field").selectOption("priority");
  await page.getByLabel("Fill choice").selectOption("L");
  await page.getByRole("button",{name:"Apply fill"}).click();
  const changes=await payload(page);
  expect(changes[0].field.defaultValues).toEqual(["H"]);
  expect(changes[1]).toMatchObject({fieldType:"listBox",value:["L"]});
});
test("link URL or page point and file attachment preserve typed changes",async ({page})=>{
  await page.setViewportSize({width:390,height:844});
  await page.goto(url);await expect(page.locator(".tpdf-tile-document")).toBeVisible({timeout:30000});
  await openTool(page,"Link");await place(page);
  await page.getByLabel("Link URL").fill("https://openai.com/");
  await page.getByRole("button",{name:"Add link"}).click();
  await expect(page.locator('[data-tpdf-p2="link"]')).toHaveCount(1);
  await place(page);
  await page.getByLabel("Link destination").selectOption("page");
  await page.getByLabel("Destination page").fill("7");
  await page.getByLabel("Destination point X").fill("35");
  await page.getByLabel("Destination point Y").fill("55");
  await page.getByRole("button",{name:"Add link"}).click();
  await openTool(page,"Attachment");await place(page);
  await page.getByRole("button",{name:"Choose file and attach"}).click();
  await expect(page.locator('[data-tpdf-p2="attachment"]')).toHaveCount(1);
  const changes=await payload(page);
  expect(changes.map((c:{kind:string})=>c.kind)).toEqual(["link","link","attachment"]);
  expect(changes[0].target).toEqual({kind:"url",url:"https://openai.com/"});
  expect(changes[1].target).toEqual({kind:"page",page:7,point:{x:35,y:55}});
  expect(changes[2].assetId).toBe("host-board-attachment-1");
  expect(changes[2].region).toMatchObject({width:0,height:0});
  expect(JSON.stringify(changes)).not.toContain("base64");
});
