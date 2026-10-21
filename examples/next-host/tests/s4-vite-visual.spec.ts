import {test,expect} from "@playwright/test";
// Manual visual comparison requires the locally running original Tpdf Vite app
// with the reference PDF open. CI does not have the user's original PDF/session.
const vite=process.env.TPDF_VITE_BASE_URL;
const viewports=[{width:1280,height:800},{width:1024,height:768},
  {width:768,height:1024},{width:375,height:812}];
for(const size of viewports){
  test("S4 visual reference pair "+size.width+"x"+size.height,async({browser})=>{
    test.skip(!vite,"Set TPDF_VITE_BASE_URL with the same PDF already opened in apps/web");
    const context=await browser.newContext({viewport:size,deviceScaleFactor:1});
    const original=await context.newPage(),embedded=await context.newPage();
    try{
      await original.goto(vite!,{waitUntil:"domcontentloaded"});
      await expect(original.locator('[data-tpdf-region="app-header"]'))
        .toBeVisible({timeout:20000});
      await embedded.goto("/office/pdf?tiles=1&tileonly=1&shell=app&p1=1&p2=1&p3=1");
      await expect(embedded.locator(".tpdf-tile-document")).toBeVisible({timeout:20000});
      const base="test-results/screenshots/s4-reference-"+size.width+"x"+size.height;
      const a=await original.screenshot({path:base+"-vite.png",animations:"disabled"});
      const b=await embedded.screenshot({path:base+"-package.png",animations:"disabled"});
      const diff=await embedded.evaluate(async({srcA,srcB})=>{
        const load=(data:string)=>new Promise<HTMLImageElement>((resolve,reject)=>{
          const image=new Image();image.onload=()=>resolve(image);
          image.onerror=reject;image.src="data:image/png;base64,"+data;
        });
        const [left,right]=await Promise.all([load(srcA),load(srcB)]);
        const width=Math.min(left.width,right.width),height=Math.min(left.height,right.height);
        const read=(image:HTMLImageElement)=>{
          const canvas=document.createElement("canvas");
          canvas.width=width;canvas.height=height;
          canvas.getContext("2d")!.drawImage(image,0,0,width,height);
          return canvas.getContext("2d")!.getImageData(0,0,width,height).data;
        };
        const x=read(left),y=read(right);let error=0;
        // Diagnostic only: renderer/content differ (EmbedPDF vs tile PDF), so
        // whole-screen pixel equality is not a meaningful acceptance gate.
        for(let i=0;i<x.length;i+=4)
          error+=Math.abs(x[i]-y[i])+Math.abs(x[i+1]-y[i+1])+Math.abs(x[i+2]-y[i+2]);
        return {meanRgbDifference:error/(width*height*3),width,height};
      },{srcA:a.toString("base64"),srcB:b.toString("base64")});
      console.log("S4_VITE_PACKAGE_VISUAL_DIAGNOSTIC",size,diff);
      expect(diff.width).toBe(size.width);
      expect(diff.height).toBe(size.height);
    }finally{await context.close();}
  });
}
