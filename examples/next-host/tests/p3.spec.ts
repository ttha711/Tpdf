import { test, expect, type Page } from "@playwright/test";
const url="/office/pdf?tiles=1&tileonly=1&shell=app&p3=1";
async function openTool(page:Page,name:string){
  await page.getByRole("button",{name:"Tools",exact:true}).click();
  await page.getByRole("dialog",{name:"All tools"}).getByRole("button",{name,exact:true}).click();
}
async function draw(page:Page,moves:Array<[number,number]>=[[30,30],[95,58]]){
  const overlay=page.locator('[data-tpdf-page="1"] .tpdf-page-overlay');
  await expect(overlay).toBeVisible({timeout:30000});
  const rect=await overlay.boundingBox();
  expect(rect).toBeTruthy();
  await page.mouse.move(rect!.x+moves[0][0],rect!.y+moves[0][1]);
  await page.mouse.down();
  for(const [x,y] of moves.slice(1))await page.mouse.move(rect!.x+x,rect!.y+y,{steps:3});
  await page.mouse.up();
}
async function save(page:Page){
  await page.getByRole("button",{name:"Save version"}).first().click();
}
async function getChanges(page:Page){
  await expect(page.getByTestId("p1-payload")).not.toHaveText("",{timeout:10000});
  return JSON.parse(await page.getByTestId("p1-payload").textContent()||"[]");
}
test("P3 Redact waits for explicit irreversible consent and displays host notes",async({page})=>{
  await page.setViewportSize({width:375,height:812});
  await page.goto(url);await expect(page.locator(".tpdf-tile-document")).toBeVisible({timeout:30000});
  await openTool(page,"Redact");
  await draw(page);
  await expect(page.locator('[data-tpdf-p3="redact"]')).toHaveCount(1);
  await expect(page.locator(".tpdf-p3-redact")).toContainText("Pending redaction");
  await save(page);
  await expect(page.getByRole("alertdialog",{name:"Confirm permanent redaction"})).toBeVisible();
  await expect(page.getByTestId("p1-payload")).toHaveText("");
  await page.getByRole("alertdialog").getByRole("button",{name:"Cancel"}).click();
  await expect(page.getByTestId("p1-payload")).toHaveText("");
  await save(page);
  await page.getByTestId("confirm-redaction-save").click();
  const changes=await getChanges(page);
  expect(changes[0]).toMatchObject({kind:"redact",schemaVersion:1});
  expect(changes[0].regions).toHaveLength(1);
  await expect(page.getByTestId("p3-save-notes")).toContainText("rotated text");
  await page.screenshot({path:"test-results/screenshots/p3-375-redact.png"});
});
test("P3 calibrate then measure distance preserves scale snapshot and two decimals",async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await page.goto(url);await expect(page.locator(".tpdf-tile-document")).toBeVisible({timeout:30000});
  await openTool(page,"Calibrate");
  await page.getByLabel("Real distance").fill("12");
  await page.getByLabel("Calibration unit").selectOption("m");
  await draw(page);
  await expect(page.locator('[data-tpdf-p3="measure.calibrate"]')).toHaveCount(1);
  await openTool(page,"Distance");
  await draw(page,[[40,70],[130,70]]);
  await expect(page.locator('[data-tpdf-p3="measure"]')).toHaveCount(1);
  const label=await page.locator('[data-tpdf-p3="measure"] text').textContent();
  expect(label).toMatch(/^\d+\.\d{2} m$/);
  await page.screenshot({path:"test-results/screenshots/p3-390-measure.png"});
  await save(page);
  const changes=await getChanges(page);
  expect(changes.map((c:{kind:string})=>c.kind)).toEqual(["measure.calibrate","measure"]);
  expect(changes[1].calibration).toEqual(changes[0].calibration);
  expect(changes[1].type).toBe("distance");
});
test("P3 counted document replace needs second confirmation, passes exact scope and notes",async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await page.goto(url);await expect(page.locator(".tpdf-tile-document")).toBeVisible({timeout:30000});
  await openTool(page,"Replace text");
  await page.getByLabel("Replace find").fill("stair");
  await page.getByLabel("Replace with").fill("lobby");
  await page.getByLabel("Replace scope").selectOption("document");
  await page.getByRole("button",{name:"Count matches"}).click();
  await expect(page.getByTestId("p3-match-count")).toContainText("3 matches");
  await page.getByRole("button",{name:"Review replacement"}).click();
  await expect(page.getByRole("dialog",{name:"Confirm text replacement"})).toBeVisible();
  await expect(page.getByRole("dialog")).toContainText("entire document");
  await page.getByRole("button",{name:"Confirm replacement"}).click();
  await save(page);
  const changes=await getChanges(page);
  expect(changes[0]).toMatchObject({kind:"text.replace",schemaVersion:1,
    search:"stair",replacement:"lobby",scope:{kind:"document"},caseSensitive:false});
  await expect(page.getByTestId("p3-save-notes")).toContainText("rotated");
  await page.screenshot({path:"test-results/screenshots/p3-390-replace.png"});
});
test("P3 stays disabled on P2 host without p3Capabilities",async({page})=>{
  await page.setViewportSize({width:375,height:812});
  await page.goto("/office/pdf?tiles=1&tileonly=1&shell=app&p2=1");
  await expect(page.locator(".tpdf-tile-document")).toBeVisible({timeout:30000});
  await page.getByRole("button",{name:"Tools",exact:true}).click();
  for(const name of ["Redact","Distance","Perimeter","Area","Calibrate","Replace text"]){
    await expect(page.getByRole("dialog").getByRole("button",
      {name:new RegExp("^"+name+"(?: |$)","i")})).toBeDisabled();
  }
});

test("host secure-erase verification failure never saves or reports success",async({page})=>{
  await page.setViewportSize({width:375,height:812});
  await page.goto(url+"&p3fail=1");
  await expect(page.locator(".tpdf-tile-document")).toBeVisible({timeout:30000});
  await openTool(page,"Redact");
  await draw(page);
  await save(page);
  await page.getByTestId("confirm-redaction-save").click();
  await expect(page.locator(".tpdf-error")).toContainText("matching text remains");
  await expect(page.getByTestId("host-saved")).toHaveText("");
  await expect(page.getByTestId("p1-payload")).toHaveText("");
  await expect(page.getByTestId("shell-save-status")).toContainText("Unsaved");
});
