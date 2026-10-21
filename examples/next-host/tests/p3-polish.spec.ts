import { test, expect, type Page } from "@playwright/test";
const base="/office/pdf?tiles=1&tileonly=1&shell=app&p3=1";
async function tool(page:Page,name:string){
  await page.getByRole("button",{name:"Tools",exact:true}).click();
  await page.getByRole("dialog",{name:"All tools"})
    .getByRole("button",{name,exact:true}).click();
}
async function stageTerms(page:Page){
  await tool(page,"Redact");
  await page.getByLabel("Redact terms").fill("Client ID\nInvoice");
  await page.getByLabel("Redact pages").fill("3,1");
  await page.getByRole("button",{name:"Stage text redaction"}).click();
  await expect(page.getByLabel("Redact terms")).toHaveValue("");
  await expect(page.getByTestId("p3-redact-pending")).toContainText("2 terms");
  await expect(page.getByTestId("p3-redact-pending")).toContainText("pages: 1, 3");
}
for (const purgesHistory of [false,true]){
  test("Redact history warning reflects purgesHistory="+purgesHistory,
    async({page})=>{
      await page.setViewportSize({width:375,height:812});
      await page.goto(base+(purgesHistory?"&purgehistory=1":""));
      await expect(page.locator(".tpdf-tile-document")).toBeVisible({timeout:30000});
      await stageTerms(page);
      const panel=page.getByTestId("p3-panel");
      await expect(panel.getByRole("list",{name:"Staged redaction terms"}))
        .toContainText("Client ID");
      await page.getByRole("button",{name:"Save",exact:true}).last().click();
      const dialog=page.getByRole("alertdialog",{name:"Confirm permanent redaction"});
      await expect(dialog).toBeVisible();
      if (purgesHistory) {
        await expect(dialog).toContainText("Older versions of this file will also be permanently deleted.");
        await expect(dialog).not.toContainText("may still contain the originals");
      } else {
        await expect(dialog).toContainText("Earlier versions may still contain the originals.");
        await expect(dialog).not.toContainText("will also be permanently deleted");
      }
      await dialog.getByRole("button",{name:"Cancel"}).click();
      await expect(page.getByTestId("p1-payload")).toHaveText("");
    });
}
test("mobile P3 panel collapses without hiding pending redact summary",async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await page.goto(base);
  await expect(page.locator(".tpdf-tile-document")).toBeVisible({timeout:30000});
  await stageTerms(page);
  const panel=page.getByTestId("p3-panel");
  const initial=await panel.evaluate(element=>element.getBoundingClientRect().height);
  await panel.getByRole("button",{name:"Hide P3 panel"}).click();
  await expect(panel).toHaveAttribute("data-collapsed","true");
  await expect(page.getByLabel("Redact terms")).toBeHidden();
  await expect(page.getByTestId("p3-redact-pending")).toContainText("2 terms");
  const collapsed=await panel.evaluate(element=>element.getBoundingClientRect().height);
  expect(collapsed).toBeLessThan(initial-15);
  await panel.getByRole("button",{name:"Show P3 panel"}).click();
  await expect(page.getByLabel("Redact terms")).toBeVisible();
  console.log("P3_PANEL_HEIGHT", {initial,collapsed});
});
test("Save notes show as dismissible toast and do not shrink tile viewer",async({page})=>{
  await page.setViewportSize({width:375,height:812});
  await page.goto(base+"&purgehistory=1");
  await expect(page.locator(".tpdf-tile-document")).toBeVisible({timeout:30000});
  await tool(page,"Replace text");
  const panel=page.getByTestId("p3-panel");
  await panel.getByRole("button",{name:"Hide P3 panel"}).click();
  await expect(page.getByLabel("Replace find")).toBeHidden();
  await panel.getByRole("button",{name:"Show P3 panel"}).click();
  await page.getByLabel("Replace find").fill("stair");
  await page.getByLabel("Replace with").fill("lobby");
  await page.getByLabel("Replace scope").selectOption("document");
  await page.getByRole("button",{name:"Count matches"}).click();
  await expect(page.getByTestId("p3-match-count")).toContainText("3 matches");
  await page.getByRole("button",{name:"Review replacement"}).click();
  await page.getByRole("button",{name:"Confirm replacement"}).click();
  const viewer=page.locator(".tpdf-app-viewer");
  const before=await viewer.evaluate(node=>node.getBoundingClientRect().height);
  await page.getByRole("button",{name:"Save",exact:true}).last().click();
  const toast=page.getByTestId("p3-save-notes");
  await expect(toast).toBeVisible({timeout:10000});
  await expect(toast).toContainText("rotated text runs");
  const after=await viewer.evaluate(node=>node.getBoundingClientRect().height);
  expect(Math.abs(before-after)).toBeLessThan(2);
  await toast.getByRole("button",{name:"Dismiss save notes"}).click();
  await expect(toast).toHaveCount(0);
  console.log("P3_NOTES_TOAST_VIEWER_HEIGHT",{before,after});
});
