import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_FORM_CAPABILITIES } from "../dist/p2Types.js";
import { formCaps, validateCreate, validateP2Batch } from "../dist/p2Validation.js";
import { listedFields, optionsFromText } from "../dist/p2ViewModel.js";
const region = { page:1,x:10,y:12,width:30,height:8,note:"" };
const create = (field) => ({kind:"form.create",schemaVersion:1,field});
const fill = (name,fieldType,value) => ({kind:"form.fill",schemaVersion:1,name,fieldType,value});
const field = (type,name,extra={}) => ({type,name,region,...extra});
const inventory = {versionId:"tile-v1",fields:[{
  name:"existing",type:"text",value:"old",widgets:[{region}],required:false,
}]};
const check = (edits,inv=inventory,caps=DEFAULT_FORM_CAPABILITIES) =>
  validateP2Batch(edits,inv,caps,20,"tile-v1");
test("capabilities default false, text/checkbox/dropdown/single-list are accepted",()=>{
  assert.deepEqual(formCaps(),{radio:false,multiSelect:false,checkboxExportValue:false});
  check([
    create(field("text","comments",{required:true,maxLength:12,multiline:true,tooltip:"Nhãn"})),
    fill("comments","text","Hello"),
    create(field("checkbox","approved",{defaultValue:false})),
    fill("approved","checkbox",true),
    create(field("dropdown","status",{options:[{label:"Approved",value:"ok"}],defaultValue:"ok",editable:true})),
    fill("status","dropdown","ok"),
    create(field("listBox","priority",{options:[{label:"High",value:"H"},{label:"Low",value:"L"}],
      defaultValues:["H"],multiSelect:false})),
    fill("priority","listBox",["L"]),
  ]);
});
test("applies strictly in list order, can fill just-created, rejects reverse/duplicates",()=>{
  const p = create(field("text","new"));
  check([p,fill("new","text","valid")]);
  assert.throws(()=>check([fill("new","text","bad"),p]),/Unknown/);
  assert.throws(()=>check([p,p]),/Duplicate/);
  assert.throws(()=>check([fill("existing","checkbox",true)]),/mismatched/);
  assert.throws(()=>validateP2Batch([p],inventory,formCaps(),20,"stale-v2"),/Stale/);
});
test("P2b unsupported radio, multiselect, non-Yes checkbox export reject",()=>{
  assert.throws(()=>validateCreate(field("radio","gender",{choices:[
    {region,label:"Female",exportValue:"F"},{region,label:"Male",exportValue:"M"}]})),/Radio/);
  assert.throws(()=>validateCreate(field("checkbox","special",{exportValue:"Checked"})),/Yes/);
  assert.throws(()=>validateCreate(field("listBox","multi",{options:[{label:"A",value:"A"}],
    multiSelect:true,defaultValues:["A"]})),/Multi-select/);
  assert.throws(()=>check([create(field("listBox","single",{
    options:[{label:"A",value:"A"},{label:"B",value:"B"}]})),
    fill("single","listBox",["A","B"])]),/Only one/);
  assert.equal(validateCreate(field("checkbox","special",{exportValue:"Checked"}),
    {...DEFAULT_FORM_CAPABILITIES,checkboxExportValue:true}).exportValue,"Checked");
});
test("link only HTTP(S) or page, attachment permits zero-size icon anchor",()=>{
  check([{kind:"link",schemaVersion:1,region,target:{kind:"url",url:"https://example.com/path"}}]);
  check([{kind:"link",schemaVersion:1,region,target:{kind:"page",page:2,point:{x:50,y:25}}}]);
  for (const url of ["javascript:alert(1)","data:text/html,a","file:///secret","ftp://x"]) {
    assert.throws(()=>check([{kind:"link",schemaVersion:1,region,
      target:{kind:"url",url}}]),/HTTP/);
  }
  check([{kind:"attachment",schemaVersion:1,
    region:{...region,width:0,height:0},assetId:"board-file-1"}]);
  assert.throws(()=>check([{kind:"attachment",schemaVersion:1,region,
    assetId:""}]),/assetId/);
});
test("inventory groups widgets by field; staged create/fill reflected without losing host fields",()=>{
  const operations=[
    create(field("checkbox","approved",{defaultValue:false})),
    fill("approved","checkbox",true),
  ];
  const list=listedFields(inventory,operations);
  assert.equal(list.length,2);
  assert.equal(list[0].name,"existing");
  assert.equal(list[1].value,true);
  assert.equal(list[1].widgets[0].exportValue,"Yes");
  assert.deepEqual(optionsFromText("Approved=ok\nPending=wait"),[
    {label:"Approved",value:"ok"},{label:"Pending",value:"wait"}]);
});
