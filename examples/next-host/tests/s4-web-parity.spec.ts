import {test,expect,type Page} from "@playwright/test";
const base="/office/pdf?tiles=1&tileonly=1&shell=app&p1=1&p2=1&p3=1";
const catalog:Record<string,string[]>={
  View:["Read / Select","Pan","Fit width","Fit page","Zoom in","Zoom out",
    "Rotate left","Rotate right","Search","Pages","Comments"],
  Annotate:["Comment","Link","Highlight","Strikeout","Underline","Squiggly",
    "Draw","Ink highlight","Add text","Insert text","Replace text","Callout","Style"],
  Shapes:["Rectangle","Circle","Line","Arrow","Polygon","Polyline","Style"],
  Insert:["Stamp","Attachment","Signature","Image","Style"],
  Form:["Text field","Checkbox","Radio button","Dropdown","List box","Fill mode","Style"],
  Redact:["Redact","Redaction panel"],
  Measure:["Distance","Perimeter","Area","Calibrate"]
};
async function open(page:Page){
  await page.setViewportSize({width:375,height:812});
  await page.goto(base);
  await expect(page.locator(".tpdf-tile-document")).toBeVisible({timeout:30000});
}
test("Tpdf mobile AppHeader exact order, 1-tab overview, Select dock, no titlebar search/save",async({page})=>{
  await open(page);
  const header=page.getByTestId("mobile-app-header");
  await expect(header).toBeVisible();
  const order=await header.locator(":scope > button").evaluateAll(buttons=>
    buttons.map(button=>button.getAttribute("aria-label")));
  expect(order).toEqual(["Go to Home","Application menu","Open tabs overview (1 tabs)"]);
  await expect(header.getByTestId("shell-save-status")).toContainText("Saved");
  await expect(header.getByRole("button",{name:"Save"})).toHaveCount(0);
  await expect(header.getByRole("button",{name:"Search"})).toHaveCount(0);
  await expect(page.getByRole("button",{name:"Select",exact:true})).toBeVisible();
  await expect(page.getByRole("button",{name:"Read",exact:true})).toHaveCount(0);
  await header.getByRole("button",{name:"Open tabs overview (1 tabs)"}).click();
  const dialog=page.getByRole("dialog",{name:"Open documents"});
  await expect(dialog.getByText("Currently open")).toBeVisible();
  await expect(dialog.getByText(/Page 1 of 100/)).toBeVisible();
  await dialog.getByRole("button",{name:/Open .*pdf/}).first().click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator(".tpdf-tile-document")).toBeVisible();
});
for(const [group,labels] of Object.entries(catalog)){
  test("Tpdf group tab "+group+" shows source-ordered icon+label tools",async({page})=>{
    await open(page);
    await page.getByRole("tab",{name:group,exact:true}).click();
    const toolbar=page.getByRole("toolbar",{name:group+" tools"});
    await expect(toolbar).toBeVisible();
    const names=await toolbar.locator("button").evaluateAll(nodes=>
      nodes.map(node=>node.getAttribute("aria-label")));
    expect(names).toEqual(labels);
    expect(await toolbar.locator("button svg").count()).toBe(labels.length);
    await expect(page.getByLabel("PDF mode")).toHaveCount(0);
    const root=page.locator(".tpdf-editor");
    await expect(root).toHaveAttribute("data-tpdf-layout","mobile");
  });
}
test("Tpdf group actions select tools directly and unavailable P4/P2b buttons stay locked",async({page})=>{
  await open(page);
  await page.getByRole("tab",{name:"Annotate"}).click();
  await page.getByRole("toolbar",{name:"Annotate tools"})
    .getByRole("button",{name:"Highlight"}).click();
  await expect(page.getByRole("toolbar",{name:"Annotate tools"})
    .getByRole("button",{name:"Highlight"})).toHaveAttribute("aria-pressed","true");
  await expect(page.getByRole("toolbar",{name:"Annotate tools"})
    .getByRole("button",{name:"Comment"})).toBeDisabled();
  await page.getByRole("tab",{name:"Form"}).click();
  await expect(page.getByRole("toolbar",{name:"Form tools"})
    .getByRole("button",{name:"Radio button"})).toBeDisabled();
  await page.getByRole("toolbar",{name:"Form tools"}).getByRole("button",{name:"Text field"}).click();
  await expect(page.locator(".tpdf-p2-panel")).toBeVisible();
  await page.getByRole("tab",{name:"Redact"}).click();
  await page.getByRole("toolbar",{name:"Redact tools"}).getByRole("button",{name:"Redact"}).click();
  await expect(page.getByTestId("p3-panel")).toBeVisible();
  await page.getByRole("tab",{name:"View"}).click();
  const view=page.getByRole("toolbar",{name:"View tools"});
  await expect(view.getByRole("button",{name:"Rotate left"})).toBeDisabled();
  await expect(view.getByRole("button",{name:"Comments"})).toBeDisabled();
  await view.getByRole("button",{name:"Zoom in"}).click();
  await expect(page.locator(".tpdf-tile-document")).toBeVisible();
  await view.getByRole("button",{name:"Fit page"}).click();
  await expect(page.locator(".tpdf-tile-document")).toBeVisible();
});
test("Tpdf All tools source order, host groups appended below Document tools",async({page})=>{
  await open(page);
  await page.getByRole("button",{name:"Tools",exact:true}).click();
  const sheet=page.getByRole("dialog",{name:"All tools"});
  await expect(sheet.getByText("Every group matches the scrollable PDF toolbar.")).toBeVisible();
  const groups=await sheet.locator("[data-tpdf-tool-group]").evaluateAll(nodes=>
    nodes.map(node=>node.getAttribute("data-tpdf-tool-group")));
  expect(groups).toEqual(["view","annotate","shapes","insert","form","redact","measure","document"]);
  await expect(sheet.getByRole("button",{name:"Save PDF"})).toBeVisible();
  await expect(sheet.getByRole("button",{name:"Edit PDF text"})).toBeDisabled();
  await expect(sheet.locator("[data-tpdf-host-tools]")).toHaveCount(4);
});
test("Tpdf floating status chip scroll-idles, opens lazy Page previews and supports Jump/Escape",async({page})=>{
  await open(page);
  const scroll=page.locator(".tpdf-scroll");
  await scroll.evaluate(node=>node.scrollTop=400);
  const chip=page.getByRole("button",{name:"Choose page"});
  await expect(chip).toBeVisible();
  await expect(chip).toContainText(/Page \d+ \/ 100/);
  await expect(page.locator(".tpdf-mobile-dock-status")).toContainText("%");
  await expect(chip).toBeHidden({timeout:5000});
  await scroll.evaluate(node=>node.scrollTop+=500);
  await chip.click();
  const dialog=page.getByRole("dialog",{name:"Page previews"});
  await expect(dialog).toBeVisible();
  await expect(dialog.locator(".tpdf-page-grid button")).toHaveCount(100);
  await expect(dialog.locator(".tpdf-page-grid [aria-current=page]")).toHaveCount(1);
  await dialog.getByRole("spinbutton",{name:"Jump to page"}).fill("35");
  await dialog.getByRole("button",{name:"Go"}).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator('[data-tpdf-page="35"]')).toBeVisible();
  await page.locator(".tpdf-scroll").evaluate(node=>node.scrollTop+=200);
  await page.getByRole("button",{name:"Choose page"}).click();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog",{name:"Page previews"})).toHaveCount(0);
  await expect(page.getByRole("button",{name:"Tools",exact:true})).toBeVisible();
});
test("Tpdf mobile sidebar has Thumbnails and Outline and remains independent of PDF.js in tilesOnly",async({page})=>{
  await open(page);
  await page.getByRole("button",{name:"Pages and outline"}).click();
  const nav=page.getByRole("dialog",{name:"PDF navigation"});
  await expect(nav.getByRole("tab",{name:"Thumbnails"})).toBeVisible();
  await nav.getByRole("tab",{name:"Outline"}).click();
  await expect(nav.getByRole("button",{name:/Floor plans/})).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(nav).toHaveCount(0);
});

test("360i optional openDocuments supports opening and closing distinct host files",async({page})=>{
  await page.setViewportSize({width:375,height:812});
  await page.goto(base+"&tabs=1");
  await expect(page.locator(".tpdf-tile-document")).toBeVisible({timeout:30000});
  const header=page.getByTestId("mobile-app-header");
  await header.getByRole("button",{name:"Open tabs overview (2 tabs)"}).click();
  let overview=page.getByRole("dialog",{name:"Open documents"});
  await expect(overview.locator("[data-tpdf-tab-card]")).toHaveCount(2);
  await overview.getByRole("button",{name:"Open Floor-B.pdf"}).click();
  await expect(overview).toHaveCount(0);
  await expect(header.locator(".tpdf-app-file strong")).toContainText("Floor-B.pdf");
  await header.getByRole("button",{name:"Open tabs overview (2 tabs)"}).click();
  overview=page.getByRole("dialog",{name:"Open documents"});
  await expect(overview.locator('[data-tpdf-tab-card="doc-b"]')).toContainText("Currently open");
  await overview.getByRole("button",{name:"Close tab Floor-A.pdf"}).click();
  await expect(overview.locator("[data-tpdf-tab-card]")).toHaveCount(1);
  await overview.getByRole("button",{name:"Open Floor-B.pdf"}).click();
  await expect(header.getByRole("button",{name:"Open tabs overview (1 tabs)"})).toBeVisible();
});

test("Tpdf desktop ribbons preserve seven source tool groups and host-only groups",async({page})=>{
  await page.setViewportSize({width:1280,height:800});
  await page.goto(base);
  await expect(page.getByTestId("desktop-ribbon")).toBeVisible({timeout:30000});
  const tabs=await page.getByRole("tablist",{name:"PDF ribbon"}).getByRole("tab")
    .evaluateAll(nodes=>nodes.map(node=>node.textContent?.trim()));
  expect(tabs).toEqual(["View","Annotate","Shapes","Insert","Form","Redact",
    "Measure","Pages","Mark up","Protect","Convert","All tools"]);
  for(const [group,labels] of Object.entries(catalog)){
    await page.getByRole("tab",{name:group,exact:true}).click();
    const toolbar=page.getByRole("toolbar",{name:group.toLowerCase()+" commands"});
    const names=await toolbar.locator("button").evaluateAll(nodes=>
      nodes.map(node=>node.getAttribute("aria-label")||node.textContent?.trim()));
    expect(names).toEqual(labels);
  }
  await page.getByRole("tab",{name:"Annotate"}).click();
  await page.getByRole("toolbar",{name:"annotate commands"})
    .getByRole("button",{name:"Underline"}).click();
  await expect(page.getByRole("toolbar",{name:"annotate commands"})
    .getByRole("button",{name:"Underline"})).toHaveAttribute("aria-pressed","true");
});
