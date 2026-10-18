// These tests deliberately mock React, Express transport and the OCR engine, not the source under test.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {load}=require('./load-source.cjs');
const state=()=>({hasDocument:true,fileName:'A.pdf',documentRevision:'A:1',currentPage:1,totalPages:4});
const tools=[{id:'run-ocr',title:'Run OCR',description:'OCR',risk:'safe',requiresDocument:true}];
const executor=load('apps/web/src/agent/executor.ts',{'./definitions':{getAgentToolDefinition:id=>tools.find(t=>t.id===id)}});

for (const result of [{status:'failed',error:'OCR crashed'},{status:'completed'}]) {
  test(`OCR without a usable output cannot report completion: ${result.status}`,async()=>{
    let writes=0;
    const ocr=load('apps/web/src/hooks/document-actions/useOcrAction.ts',{
      './pdfUtils':{isLikelyPdf:()=>true,isParseablePdf:async()=>true},
    },{window:{setInterval:()=>1,clearInterval(){}}});
    const {runOcr}=ocr.useOcrAction({
      bridge:{enqueueOcr:async()=>({id:'ocr'}),runOcr:async()=>result,listOcrJobs:async()=>[]},
      fileName:'A.pdf',docBytes:new Uint8Array([37,80,68,70]),getDocumentBytes:async()=>null,
      page:1,hasDesktopBridge:true,replaceDocumentBytes:()=>writes++,setDocBytes(){},setOcrJobs(){},setViewerError(){},
    });
    const out=await executor.executeAgentCommand({tool:'run-ocr'},{state:state(),actions:{runOcr}});
    assert.equal(out.status,'failed');assert.equal(writes,0);
  });
}

function editor(extraEnv={}) {
  const routes=new Map(); const next=(_q,_s,n)=>n();
  const app={get:(p,...hs)=>routes.set('GET '+p,hs),post:(p,...hs)=>routes.set('POST '+p,hs),use(){},listen(){}};
  const express=Object.assign(()=>app,{json:()=>next,static:()=>next});
  load('apps/editor/server.ts',{
    express,'express-rate-limit':()=>next,vite:{createServer:async()=>({middlewares:next})},
    './server/routes/index':next,'./server/routes/largePdfJobs':next,
    './server/middleware/rateLimiter':{generalLimiter:next},
    './server/middleware/errorHandler':{errorHandler:next,notFoundHandler:next},
  },{process:{env:{NODE_ENV:'production',TPDF_EDITOR_API_TOKEN:'fake-test-token-not-a-real-secret',...extraEnv},cwd:()=>'/tmp'}});
  return (method,path,{protocol='http',headers={},body={}}={})=>{
    const hdr=Object.fromEntries(Object.entries({host:'editor.test',...headers}).map(([k,v])=>[k.toLowerCase(),v]));
    const req={method,protocol,headers:hdr,body,get:n=>hdr[n.toLowerCase()]};
    const res={code:200,cookies:[],status(n){this.code=n;return this;},json(v){this.body=v;return this;},
      end(){},cookie(n,v,o){this.cookies.push({name:n,value:v,options:o});return this;},clearCookie(){},setHeader(){}};
    assert.ok(routes.has(method+' '+path),`Missing route ${path}`);
    for(const fn of routes.get(method+' '+path)){let advance=false;fn(req,res,()=>{advance=true;});if(!advance)break;}
    return res;
  };
}
const loginBody={token:'fake-test-token-not-a-real-secret'};

test('configured TLS proxy can sign in and cookie survives status check and logout',()=>{
  const req=editor({TPDF_EDITOR_PUBLIC_ORIGIN:'https://editor.test'});
  const login=req('POST','/auth/editor',{headers:{origin:'https://editor.test','sec-fetch-site':'same-origin'},body:loginBody});
  assert.equal(login.code,204);const c=login.cookies[0];
  assert.notEqual(c.value,loginBody.token);assert.equal(c.options.path,'/');assert.equal(c.options.httpOnly,true);
  const headers={cookie:`${c.name}=${c.value}`};
  assert.equal(req('GET','/auth/editor/status',{headers}).body.authenticated,true);
  req('POST','/auth/editor/logout',{headers});
  assert.equal(req('GET','/auth/editor/status',{headers}).body.authenticated,false);
});

test('foreign origins remain rejected behind a configured TLS proxy',()=>{
  const req=editor({TPDF_EDITOR_PUBLIC_ORIGIN:'https://editor.test'});
  assert.equal(req('POST','/auth/editor',{headers:{origin:'https://foreign.test'},body:loginBody}).code,403);
});

test('an unconfigured proxy is rejected instead of blindly trusting forwarded headers',()=>{
  const req=editor();
  const out=req('POST','/auth/editor',{headers:{origin:'https://editor.test','x-forwarded-proto':'https'},body:loginBody});
  assert.equal(out.code,403);
});

test('wrong credentials cannot create an editor session',()=>{
  const req=editor();const out=req('POST','/auth/editor',{body:{token:'wrong'}});
  assert.equal(out.code,401);assert.equal(out.cookies.length,0);
});

function hookHarness(run) {
  const states=[],messages=[];const noop=()=>{};
  const react={useState(init){const i=states.length;states.push(typeof init==='function'?init():init);
    return [states[i],v=>{states[i]=typeof v==='function'?v(states[i]):v;}];},useRef:v=>({current:v})};
  const hook=load('apps/web/src/components/AiAssistantPanel.hooks.ts',{
    react,'./uiAgentHarness':{createUiAgentHarness:()=>({run})},
    './useAiAssistantMessages':{useAiAssistantMessages:()=>({messages,chatEndRef:{current:null},
      addMessage:(sender,text,extra)=>{messages.push({sender,text,...extra});return String(messages.length);},setMessages:noop})},
    '../hooks/useMachineAgentBridge':{useMachineAgentBridge:()=>({agents:[],provider:'auto',availableProviders:[],history:[],
      chooseProvider:noop,refreshHistory:noop,startPairing:noop})},
    './useAiCommandRuntime':{useAiCommandRuntime:()=>({executeCommand:async()=>({status:'completed',message:'ok'})})},
    '../agent/enqueueAbortable':{enqueueAbortable:()=>{throw new Error('Unexpected execution');}},
  });
  return {api:hook.useAiAssistant(),states,messages};
}
const flush=async()=>{for(let i=0;i<5;i++)await new Promise(r=>setImmediate(r));};

test('resuming a clarification preserves the question and the same job',async()=>{
  const {runAgentHarness}=load('apps/web/src/agent/harness.ts');
  let turn=0,seen;
  const hook=hookHarness(async(goal,cp,approval,cancelled)=>runAgentHarness(cp??{goal,observations:[]},{
    getState:state,listTools:()=>tools,isCancelled:cancelled,execute:async()=>({status:'completed',message:'ok'}),
    model:async prompt=>{if(turn++===0)return {action:'ask',message:'Apply to every page?'};
      seen=prompt;return {action:'ask',message:'Please provide the watermark text.'};},
  }));
  hook.api.handleSuggestionClick('Watermark this PDF');await flush();const id=hook.states[2][0].id;
  hook.api.handleSuggestionClick('Yes');await flush();
  assert.match(seen,/Apply to every page/);assert.match(seen,/Yes/);
  assert.equal(hook.states[2].length,1);assert.equal(hook.states[2][0].id,id);
});

test('cancelling a waiting job is terminal and does not schedule an edit',async()=>{
  const hook=hookHarness(async(goal,cp)=>({status:'input_required',message:'Which page?',checkpoint:cp??{goal,observations:[]}}));
  hook.api.handleSuggestionClick('Watermark');await flush();hook.api.stopJob(hook.states[2][0].id);await flush();
  assert.equal(hook.states[2][0].status,'failed');assert.equal(hook.states[2][0].checkpoint,undefined);
});
