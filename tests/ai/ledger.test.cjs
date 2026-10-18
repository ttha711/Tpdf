const { test }=require('node:test');
const assert=require('node:assert/strict');
const {load}=require('./load-source.cjs');
const {operationKey,recordExecution,completionProblem}=load('apps/web/src/agent/harnessLedger.ts');
const scope={documentIdentity:'A',documentRevision:'A:1'};
const fail={status:'failed',message:'failure'};
const pass={status:'completed',message:'done'};

test('retry identity includes document, revision, tool, and arguments',()=>{
  const base=operationKey('tool',{text:'D'},scope);
  for (const key of [
    operationKey('other',{text:'D'},scope),operationKey('tool',{text:'X'},scope),
    operationKey('tool',{text:'D'},{...scope,documentRevision:'A:2'}),
    operationKey('tool',{text:'D'},{...scope,documentIdentity:'B'}),
  ]) assert.notEqual(key,base);
});

test('clearing one failed operation does not clear another failure',()=>{
  const cp={};
  const a=operationKey('a',{},scope),b=operationKey('b',{},scope);
  recordExecution(cp,a,'a',fail);recordExecution(cp,b,'b',fail);recordExecution(cp,a,'a',pass);
  assert.notEqual(completionProblem(cp),null);
  recordExecution(cp,b,'b',pass);assert.equal(completionProblem(cp),null);
});

test('new successful invocation does not rewrite an old completed attempt',()=>{
  const cp={}; const key=operationKey('save',{},scope);
  recordExecution(cp,key,'save',pass);recordExecution(cp,key,'save',fail);recordExecution(cp,key,'save',pass);
  assert.equal(cp.executions.length,2);assert.equal(cp.executions[0].attempts,1);assert.equal(cp.executions[1].attempts,2);
});

test('invalid or excessively nested argument objects fail closed',()=>{
  assert.throws(()=>operationKey('a',{x:NaN},scope));
  const nested={}; nested.child=nested;
  assert.throws(()=>operationKey('a',nested,scope),/deeply nested/);
});

test('legacy unresolved failure cannot be mistaken for a completed run',()=>{
  assert.notEqual(completionProblem({unresolvedFailure:true}),null);
});
