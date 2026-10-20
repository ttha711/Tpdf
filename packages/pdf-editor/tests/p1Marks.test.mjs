import test from "node:test";
import assert from "node:assert/strict";
import { buildP1Mark, validStyle } from "../dist/p1Marks.js";
import { DEFAULT_P1_STYLE, P1_TOOLS } from "../dist/p1Types.js";
import { SHELL_BUILTINS, enabledBuiltin, SHEET_GROUPS } from "../dist/appShellModel.js";

const region = { page: 1, x: 10, y: 20, width: 40, height: 30, note: "" };
const tl = {x: 10,y:20},tr={x:50,y:20},br={x:50,y:50},bl={x:10,y:50};
const path = [tl, {x:25,y:28}, br];
function input(tool, extra={}) {
  return { tool, region, style: DEFAULT_P1_STYLE, path, text: "Note",
    quads: [[tl,tr,br,bl]], assetId: "host-asset-123", ...extra };
}
test("P1 all declared marks serialize losslessly and with version discriminator", () => {
  assert.equal(P1_TOOLS.length, 17);
  for(const tool of P1_TOOLS) {
    const mark = buildP1Mark(input(tool));
    assert.equal(mark.type, tool);
    assert.equal(mark.schemaVersion, 1);
    assert.deepEqual(mark.region, region);
    assert.deepEqual(mark.style, DEFAULT_P1_STYLE);
    assert.equal(JSON.parse(JSON.stringify(mark)).schemaVersion, 1);
  }
});
test("markup requires validated true per-line quads, not guessed rectangles", () => {
  for(const tool of ["highlight","underline","strikeout","squiggly"]) {
    assert.throws(() => buildP1Mark(input(tool, {quads: []})), /quads/);
    assert.throws(() => buildP1Mark(input(tool, {quads: [[tl,tr,br]]})), /quads/);
    const mark = buildP1Mark(input(tool));
    assert.deepEqual(mark.quads, [[tl,tr,br,bl]]);
  }
});
test("asset IDs are required and large uploads never embed in marks", () => {
  for (const tool of ["stamp","image","signature"]) {
    assert.throws(() => buildP1Mark(input(tool,{assetId:""})), /assetId/);
    const mark=buildP1Mark(input(tool));
    assert.equal(mark.assetId, "host-asset-123");
    assert.ok(!("bytes" in mark));
  }
});
test("style and point bounds are validated before host save", () => {
  assert.ok(validStyle(DEFAULT_P1_STYLE));
  assert.throws(() => buildP1Mark(input("rectangle", {
    style: {...DEFAULT_P1_STYLE, opacity: 1.8},
  })), /style/);
  assert.throws(() => buildP1Mark(input("arrow", {
    path: [tl,{x:101,y:5}],
  })), /vertices/);
  assert.throws(() => buildP1Mark(input("addText",{text:"  "})), /Text is required/);
  assert.throws(() => buildP1Mark(input("polygon",{path:[tl,tr]})), /vertices/);
});
test("catalog shows P1 and future phases locked until supported", () => {
  assert.ok(SHEET_GROUPS.includes("redact"));
  assert.ok(SHEET_GROUPS.includes("measure"));
  for(const tool of P1_TOOLS) assert.ok(SHELL_BUILTINS.some((item) => item.id === tool));
  for(const id of ["redact","replaceText","distance","calibrate","textField","attachment","link"]) {
    const item = SHELL_BUILTINS.find((value) => value.id === id);
    assert.ok(item, id); assert.equal(enabledBuiltin(item,true,true,true,true),false);
  }
  assert.equal(enabledBuiltin(SHELL_BUILTINS.find((x)=>x.id==="underline"),true,false,false,false),false);
  assert.equal(enabledBuiltin(SHELL_BUILTINS.find((x)=>x.id==="underline"),true,false,true,false),true);
});
