import test from "node:test";
import assert from "node:assert/strict";
import { validateP3, allowedP3 } from "../dist/p3Validation.js";
import { scaledMeasurement, measureLabel, checkCalibration } from "../dist/p3Geometry.js";
import { SHELL_BUILTINS, enabledBuiltin } from "../dist/appShellModel.js";

const full={
  redact:{secureErase:true,regions:true,terms:true},
  measure:{calibrate:true,distance:true,perimeter:true,area:true},
  replaceText:{region:true,pages:true,document:true,count:true},
};
const r={page:1,x:10,y:10,width:20,height:12,note:""};
const a={x:10,y:10},b={x:60,y:10},d={x:60,y:60},e={x:10,y:60};
const calibration={id:"page-1-v1",page:1,points:[a,b],realLength:10,unit:"m"};
const validate=(edit,size={width:1000,height:600})=>validateP3(edit,full,100,size);
test("redaction must erase real contents, only stage regions or literal terms on explicit pages",()=>{
  assert.equal(allowedP3("redact"),false);
  assert.equal(allowedP3("redact",{redact:{regions:true,terms:true}}),false);
  validate({kind:"redact",schemaVersion:1,regions:[r]});
  validate({kind:"redact",schemaVersion:1,regions:[],terms:["Door"],pages:[1,7]});
  assert.throws(()=>validate({kind:"redact",schemaVersion:1,regions:[]}),/No regions/);
  assert.throws(()=>validate({kind:"redact",schemaVersion:1,regions:[],terms:["door"]}),/explicit pages/);
  assert.throws(()=>validate({kind:"redact",schemaVersion:1,regions:[],terms:["door"],pages:[0]}),/explicit pages/);
  assert.throws(()=>validateP3({kind:"redact",schemaVersion:1,regions:[r]},{
    redact:{secureErase:false,regions:true}},100),/Secure redaction/);
});
test("calibration is per-page, positive, two distinct points, snapshot produces 2 decimals",()=>{
  checkCalibration(calibration,100);
  validate({kind:"measure.calibrate",schemaVersion:1,calibration});
  const distance={kind:"measure",schemaVersion:1,type:"distance",page:1,
    points:[a,b],calibration};
  validate(distance);
  assert.equal(measureLabel(scaledMeasurement("distance",[a,b],calibration,1000,600),"m",false),
    "10.00 m");
  const perimeter=scaledMeasurement("perimeter",[a,b,d,e],calibration,1000,1000);
  const area=scaledMeasurement("area",[a,b,d,e],calibration,1000,1000);
  assert.equal(perimeter,40);
  assert.equal(area,100);
  assert.equal(measureLabel(area,"m",true),"100.00 m²");
  assert.throws(()=>checkCalibration({...calibration,realLength:0},100),/Invalid/);
  assert.throws(()=>checkCalibration({...calibration,points:[a,a]},100),/Invalid/);
  assert.throws(()=>validate({...distance,page:2}),/match measurement/);
  assert.throws(()=>validate({...distance,points:[a]}),/vertices/);
});
test("replace text is scoped and capability-gated, not secure redact",()=>{
  const base={kind:"text.replace",schemaVersion:1,search:"old",replacement:"new"};
  validate({...base,scope:{kind:"region",region:r}});
  validate({...base,scope:{kind:"pages",pages:[1,4]}});
  validate({...base,scope:{kind:"document"},caseSensitive:true});
  assert.throws(()=>validate({...base,scope:{kind:"pages",pages:[]}}),/pages/);
  assert.throws(()=>validate({...base,search:" ",scope:{kind:"document"}}),/Invalid replacement/);
  assert.throws(()=>validateP3({...base,scope:{kind:"document"}},{
    ...full,replaceText:{region:true,count:true}},100),/scope unsupported/);
  assert.equal(allowedP3("replaceText",{replaceText:{region:true}}),false);
});
test("viewer P3 tools require host capabilities; P1/P2 remain functional",()=>{
  for(const id of ["redact","calibrate","distance","perimeter","area","replaceText"]){
    const item=SHELL_BUILTINS.find(v=>v.id===id);
    assert.ok(item && item.tool===id);
    assert.equal(enabledBuiltin(item,true,true,true,true,true,true,true,true),false);
    assert.equal(enabledBuiltin(item,true,true,true,true,true,true,true,true,{
      caps:full,enabled:true,count:true,calibrated:true}),true,id);
  }
  const measure=SHELL_BUILTINS.find(v=>v.id==="distance");
  assert.equal(enabledBuiltin(measure,true,true,true,true,true,true,true,true,{
    caps:full,enabled:true,count:true,calibrated:false}),false);
  const future=SHELL_BUILTINS.find(v=>v.id==="applyRedact");
  assert.equal(enabledBuiltin(future,true,true,true,true,true,true,true,true,{
    caps:full,enabled:true,count:true,calibrated:true}),false);
});
