import test from "node:test";
import assert from "node:assert/strict";
import { layoutForWidth } from "../dist/useContainerLayout.js";
import { handleDesktopKeys } from "../dist/desktopKeys.js";

test("S4 breakpoints belong to editor container, not viewport",()=>{
  for(const [width,layout] of [[375,"mobile"],[639,"mobile"],
    [640,"tablet"],[768,"tablet"],[1023,"tablet"],
    [1024,"desktop"],[1280,"desktop"]]){
    assert.equal(layoutForWidth(width),layout);
  }
});
test("S4 desktop shortcuts support find, redo, page steps but preserve typing",()=>{
  const actions=[];
  const root={current:{dispatchEvent:()=>actions.push("find")}};
  const options={root,goto:(n)=>actions.push(n),page:6,
    redo:()=>actions.push("redo"),readOnly:false};
  const event=(key,ctrlKey=false,element="DIV")=>({
    key,ctrlKey,metaKey:false,target:{closest:(selector)=>
      ["INPUT","TEXTAREA"].includes(element) ? {tagName:element} : null},
    preventDefault:()=>actions.push("prevent"),
  });
  assert.equal(handleDesktopKeys(event("f",true),"desktop",options),true);
  assert.equal(handleDesktopKeys(event("y",true),"desktop",options),true);
  assert.equal(handleDesktopKeys(event("PageDown"),"desktop",options),true);
  assert.equal(handleDesktopKeys(event("PageUp"),"desktop",options),true);
  assert.equal(handleDesktopKeys(event("PageDown",false,"INPUT"),"desktop",options),false);
  assert.equal(handleDesktopKeys(event("f",true),"mobile",options),false);
  assert.equal(handleDesktopKeys(event("y",true,"INPUT"),"desktop",options),false);
  assert.deepEqual(actions.filter(x=>x!=="prevent"),["find","redo",7,5]);
});
