import test from "node:test";
import assert from "node:assert/strict";
import { MOBILE_PDF_GROUPS, DOCUMENT_TOOL_LABELS } from "../dist/mobilePdfToolCatalog.js";
import { webToolAction, webToolEnabled } from "../dist/webToolCommands.js";

const expected={
  view:["Read / Select","Pan","Fit width","Fit page","Zoom in","Zoom out",
    "Rotate left","Rotate right","Search","Pages","Comments"],
  annotate:["Comment","Link","Highlight","Strikeout","Underline","Squiggly","Draw",
    "Ink highlight","Add text","Insert text","Replace text","Callout","Style"],
  shapes:["Rectangle","Circle","Line","Arrow","Polygon","Polyline","Style"],
  insert:["Stamp","Attachment","Signature","Image","Style"],
  form:["Text field","Checkbox","Radio button","Dropdown","List box","Fill mode","Style"],
  redact:["Redact","Redaction panel"],
  measure:["Distance","Perimeter","Area","Calibrate"],
};
test("S4 exact apps/web/mobilePdfTools group ordering, labels and icons",()=>{
  assert.deepEqual(MOBILE_PDF_GROUPS.map(g=>g.id),Object.keys(expected));
  for(const group of MOBILE_PDF_GROUPS){
    assert.deepEqual(group.tools.map(t=>t.label),expected[group.id]);
    assert.ok(group.tools.every(tool=>tool.icon&&tool.id));
    assert.equal(new Set(group.tools.map(t=>t.id)).size,group.tools.length);
  }
  assert.equal(MOBILE_PDF_GROUPS.flatMap(g=>g.tools).length,49);
  assert.deepEqual([...DOCUMENT_TOOL_LABELS],["Edit PDF text","Find a tool",
    "Document info","AI assistant","Find document tools","Save PDF"]);
});
test("S4 comment is on only when the host enables comments; radio is a form tool",()=>{
  const all=MOBILE_PDF_GROUPS.flatMap(g=>g.tools);
  const get=id=>all.find(t=>t.id===id);
  for(const [key,type,id]of [
    ["read","builtin","select"],["pan","builtin","pan"],
    ["fit-width","builtin","fit"],["fit-page","builtin","fitPage"],
    ["zoom-in","builtin","zoomIn"],["ink","tool","draw"],
    ["ink-highlight","tool","inkHighlight"],["textfield","tool","textField"],
    ["select","tool","dropdown"],["redaction-panel","builtin","redactionPanel"],
    ["note","tool","comment"],["radio","tool","radio"]]){
    assert.deepEqual(webToolAction(get(key)),{type,id});
  }
  const app={canEdit:true,canP1:true,canP2:true,canText:true,canAsset:true,
    canForms:true,canFill:true,canAttachment:true,
    p3:{enabled:true,count:true,calibrated:true,caps:{
      redact:{secureErase:true,regions:true,terms:true},
      measure:{calibrate:true,distance:true,perimeter:true,area:true},
      replaceText:{count:true,region:true,document:true,pages:true}}},
    tools:[],style:{},onStyle:()=>{}};
  assert.equal(webToolEnabled(get("note"),app),false);
  assert.equal(webToolEnabled(get("note"),{...app,canComment:true}),true);
  assert.equal(webToolEnabled(get("radio"),app),true);
  assert.equal(webToolEnabled(get("comments"),app),false);
  assert.equal(webToolEnabled(get("highlight"),app),true);
  assert.equal(webToolEnabled(get("calibrate"),app),true);
  assert.equal(webToolEnabled(get("redact"),app),true);
  assert.equal(webToolEnabled(get("zoom-in"),app),true);
});
