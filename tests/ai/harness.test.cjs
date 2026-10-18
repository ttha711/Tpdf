const { test } = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./load-source.cjs');
const { runAgentHarness } = load('apps/web/src/agent/harness.ts');
const definitions = [
  {id:'watermark-pdf',title:'Watermark',description:'Add watermark',risk:'safe',requiresDocument:true,requiredArgs:['text']},
  {id:'delete-pages',title:'Delete',description:'Delete pages',risk:'destructive',requiresDocument:true,requiredArgs:['pages']},
  {id:'save-pdf',title:'Save',description:'Save PDF',risk:'safe',requiresDocument:true},
];
const done = () => ({status:'completed',message:'Engine completed'});
const action = (tool, args = {}) => ({action:'execute',tool,args});
const finish = (message = 'Done') => ({action:'finish',message});
function setup(decisions, execute = async () => done()) {
  let state = {hasDocument:true,fileName:'A.pdf',documentRevision:'A:1',documentIdentity:'file-a'};
  const writes = [];
  const adapter = {
    getState: () => state,
    listTools: () => definitions,
    model: async () => decisions.shift(),
    execute: async (cmd) => { writes.push(cmd); return execute(cmd); },
  };
  return { adapter, writes, get: () => state, set: (next) => { state = {...state,...next}; } };
}
const checkpoint = () => ({goal:'Requested PDF operations',observations:[]});

test('own successful edit advances checkpoint before a valid approval', async () => {
  const h = setup([action('watermark-pdf',{text:'DRAFT'}),action('delete-pages',{pages:'2'}),finish()], async cmd => {
    if (cmd.tool === 'delete-pages' && !cmd.confirmed) return {status:'confirmation_required',message:'Delete?'};
    h.set({documentRevision:cmd.tool === 'watermark-pdf' ? 'A:2' : 'A:3'}); return done();
  });
  const first = await runAgentHarness(checkpoint(),h.adapter);
  assert.equal(first.status,'confirmation_required');
  assert.equal(first.checkpoint.documentRevision,'A:2');
  const second = await runAgentHarness(first.checkpoint,h.adapter,'approve');
  assert.equal(second.status,'completed'); assert.equal(second.checkpoint.documentRevision,'A:3');
});

test('two destructive steps require two separate valid approvals', async () => {
  let committed = 0;
  const h = setup([action('delete-pages',{pages:'2'}),action('delete-pages',{pages:'3'}),finish()], async cmd => {
    if (!cmd.confirmed) return {status:'confirmation_required',message:'Delete?'};
    h.set({documentRevision:`A:${++committed+1}`}); return done();
  });
  const a = await runAgentHarness(checkpoint(),h.adapter);
  const b = await runAgentHarness(a.checkpoint,h.adapter,'approve');
  assert.equal(b.status,'confirmation_required');
  const c = await runAgentHarness(b.checkpoint,h.adapter,'approve');
  assert.equal(c.status,'completed'); assert.equal(committed,2);
});

test('external edits while waiting for approval still block execution', async () => {
  const h = setup([action('delete-pages',{pages:'2'})],async () => ({status:'confirmation_required',message:'Delete?'}));
  const a = await runAgentHarness(checkpoint(),h.adapter);
  h.set({documentRevision:'external:2'});
  const b = await runAgentHarness(a.checkpoint,h.adapter,'approve');
  assert.equal(b.status,'failed'); assert.equal(h.writes.length,1);
});

test('same-filename document replacement during planning is rejected', async () => {
  const h = setup([]);
  h.adapter.model = async () => { h.set({documentIdentity:'other-a',documentRevision:'B:1'}); return action('save-pdf'); };
  const out = await runAgentHarness(checkpoint(),h.adapter);
  assert.equal(out.status,'failed'); assert.equal(h.writes.length,0);
});

test('exact failed operation may recover via successful retry', async () => {
  let n = 0;
  const h = setup([action('watermark-pdf',{text:'DRAFT'}),action('watermark-pdf',{text:'DRAFT'}),finish()],async () =>
    ++n === 1 ? {status:'failed',message:'Temporary failure; no commit'} : done());
  const out = await runAgentHarness(checkpoint(),h.adapter);
  assert.equal(out.status,'completed'); assert.equal(out.checkpoint.executions.length,1);
  assert.equal(out.checkpoint.executions[0].attempts,2);
});

test('retry argument object order does not change operation identity', async () => {
  let n=0;
  const h=setup([action('watermark-pdf',{text:'D',opacity:0.5}),action('watermark-pdf',{opacity:0.5,text:'D'}),finish()],async () =>
    ++n===1 ? {status:'failed',message:'Not committed'} : done());
  assert.equal((await runAgentHarness(checkpoint(),h.adapter)).status,'completed');
});

for (const replacement of [action('save-pdf'),action('watermark-pdf',{text:'OTHER'})]) {
  test(`unrelated success cannot clear failed ${replacement.tool} operation`,async () => {
    let n=0;
    const h=setup([action('watermark-pdf',{text:'DRAFT'}),replacement,finish()],async () =>
      ++n===1 ? {status:'failed',message:'No commit'} : done());
    assert.equal((await runAgentHarness(checkpoint(),h.adapter)).status,'failed');
  });
}

test('failed tool that changed revision is not automatically retried',async () => {
  const h=setup([action('watermark-pdf',{text:'D'}),action('watermark-pdf',{text:'D'}),finish()],async () => {
    h.set({documentRevision:'A:partial'}); return {status:'failed',message:'Partial mutation'};
  });
  assert.equal((await runAgentHarness(checkpoint(),h.adapter)).status,'failed'); assert.equal(h.writes.length,1);
});

test('unknown tool after a successful action blocks finish',async () => {
  const h=setup([action('save-pdf'),action('missing-tool'),finish()]);
  const out=await runAgentHarness(checkpoint(),h.adapter);
  assert.equal(out.status,'failed'); assert.equal(h.writes.length,1);
  assert.equal(out.checkpoint.executions.at(-1).status,'unavailable');
});

for (const message of ['Watermark added.','All set.','Da them watermark.','Everything looks good.']) {
  test(`no-tool finish is rejected independently of wording: ${message}`,async () => {
    const h=setup([finish(message)]);
    const out=await runAgentHarness(checkpoint(),h.adapter);
    assert.equal(out.status,'failed'); assert.equal(h.writes.length,0);
    assert.notEqual(out.message,message);
  });
}

test('a normal watermark and save chain completes',async () => {
  const h=setup([action('watermark-pdf',{text:'D'}),action('save-pdf'),finish()]);
  assert.equal((await runAgentHarness(checkpoint(),h.adapter)).status,'completed');
});

test('model cannot self-approve and a rejection executes nothing further',async () => {
  const h=setup([{...action('delete-pages',{pages:'2'}),confirmed:true}],async cmd => {
    assert.equal(cmd.confirmed,false); return {status:'confirmation_required',message:'Confirm deletion'};
  });
  const a=await runAgentHarness(checkpoint(),h.adapter);
  assert.equal(a.status,'confirmation_required');
  const b=await runAgentHarness(a.checkpoint,h.adapter,'reject');
  assert.equal(b.status,'failed'); assert.equal(h.writes.length,1);
});

test('approval exceptions are converted to failed results, not uncaught errors',async () => {
  const h=setup([action('delete-pages',{pages:'2'})],async cmd => {
    if (cmd.confirmed) throw new Error('Disk failure');
    return {status:'confirmation_required',message:'Confirm deletion'};
  });
  const a=await runAgentHarness(checkpoint(),h.adapter);
  const b=await runAgentHarness(a.checkpoint,h.adapter,'approve');
  assert.equal(b.status,'failed'); assert.match(b.message,/Disk failure/);
});

test('cancellation during model response cannot return a successful finish',async () => {
  let stopped=false;
  const h=setup([]); h.adapter.isCancelled=()=>stopped;
  h.adapter.model=async()=>{ stopped=true; return finish(); };
  assert.equal((await runAgentHarness(checkpoint(),h.adapter)).status,'failed');
});

test('a pending question remains in model context',async () => {
  const h=setup([{action:'ask',message:'Which page?'}]);
  const a=await runAgentHarness(checkpoint(),h.adapter);
  assert.equal(a.status,'input_required');
  h.adapter.model=async prompt=>{ assert.match(prompt,/Which page/); return {action:'ask',message:'Provide a page.'}; };
  assert.equal((await runAgentHarness(a.checkpoint,h.adapter)).status,'input_required');
});

test('non-JSON model responses fail after bounded retries',async () => {
  const h=setup(['bad response','bad response']);
  const out=await runAgentHarness(checkpoint(),h.adapter);
  assert.equal(out.status,'failed'); assert.equal(h.writes.length,0);
});
