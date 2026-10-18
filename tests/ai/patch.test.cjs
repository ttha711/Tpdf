const { test } = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./load-source.cjs');
const file='apps/web/src/components/live-editor/aiPatchService.ts';
const block={id:'b1',type:'paragraph',content:'Original',html:'<p>Original</p>',style:{font:'Arial',size:12,color:'#000'}};
const request={prompt:'Improve',selectedBlocks:[block],allBlocks:[block],referenceImage:null};
const updates=[{id:'b1',content:'Replacement'}];
const failures=[
  {error:'FAILED',updates}, {success:false,updates}, {ok:false,updates}, {status:'failed',updates},
  {data:{error:'FAILED'},updates}, {result:{success:false},updates}, {response:{status:'error'},updates},
];
for (const [i,payload] of failures.entries()) for (const route of ['desktop','network']) {
  test(`${route} rejects error envelope ${i} even when updates exist`,async()=>{
    const globals=route==='desktop'
      ? {window:{tpdf:{applyAiPatch:async()=>payload}}}
      : {window:{},localStorage:{getItem:k=>k.endsWith('endpoint')?'https://ai.test':null},fetch:async()=>({ok:true,json:async()=>payload})};
    const {generateAiPatch}=load(file,{},globals);
    await assert.rejects(()=>generateAiPatch(request),/failure/i);
    assert.equal(request.selectedBlocks[0].content,'Original');
  });
}
const {validateAiPatch}=load(file);
for (const payload of [
  {message:'Try later'}, 'plain prose is not a patch', {updates:[]},
  {updates:[{id:'b1'}]}, {updates:[{id:'b1',content:2}]},
  {updates:[{id:'b1',type:'script'}]}, {updates:[{id:'b1',style:null}]},
  {updates:[{id:'b1',style:{size:12}}]}, {updates:[{id:'b1',content:'X',unknown:'Y'}]},
  {updates:[...updates,...updates]}, {updates:[{id:'b2',content:'Outside'}]},
]) test(`rejects malformed or unscoped patch ${JSON.stringify(payload).slice(0,100)}`,()=>{
  assert.throws(()=>validateAiPatch(payload,request));
});

test('successful structured patch remains accepted',()=>{
  assert.deepEqual(JSON.parse(JSON.stringify(validateAiPatch({ok:true,error:null,updates},request))),{updates});
});

test('valid empty replacement text is retained as an intentional deletion',()=>{
  const out=validateAiPatch({updates:[{id:'b1',content:''}]},request);
  assert.equal(out.updates[0].content,'');
});

test('full valid block style remains accepted',()=>{
  const out=validateAiPatch({updates:[{id:'b1',style:block.style}]},request);
  assert.equal(out.updates[0].style.size,12);
});
