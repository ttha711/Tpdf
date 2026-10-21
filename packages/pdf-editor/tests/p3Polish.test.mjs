import test from "node:test";
import assert from "node:assert/strict";
import { redactHistoryWarning, summarizeRedactions } from "../dist/p3RedactionSummary.js";

const region = { page:3,x:10,y:10,width:30,height:14,note:"" };
test("Redact history warning changes only when host explicitly declares true",()=>{
  const purged=redactHistoryWarning(true);
  const legacy=redactHistoryWarning();
  assert.match(purged,/Older versions.*permanently deleted/i);
  assert.doesNotMatch(purged,/may still contain/i);
  assert.match(legacy,/Earlier versions may still contain the originals/);
  assert.equal(redactHistoryWarning(false),legacy);
});
test("pending redaction summary aggregates regions, terms and unique sorted pages",()=>{
  const changes=[
    {kind:"redact",schemaVersion:1,regions:[region],terms:["Invoice","Account"],pages:[3,1]},
    {kind:"redact",schemaVersion:1,regions:[{...region,page:2}],terms:["Receipt"],pages:[2,3]},
    {kind:"text.replace",schemaVersion:1,search:"A",replacement:"B",scope:{kind:"document"}},
  ];
  assert.deepEqual(summarizeRedactions(changes),{
    regions:2,terms:["Invoice","Account","Receipt"],pages:[1,2,3],
  });
  assert.deepEqual(summarizeRedactions([]),{regions:0,terms:[],pages:[]});
});
