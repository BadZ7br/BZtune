import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';
const ts=createRequire(new URL('../doomvault/package.json',import.meta.url))('typescript');
const compiled=ts.transpileModule(readFileSync(new URL('../doomvault/src/services/api-fetch.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
function load(fetch){const exports={},events=[];vm.runInNewContext(compiled,{exports,fetch,AbortSignal,require:()=>({recordRequestFailure:code=>events.push(code)})});return {...exports,events};}
test('observed requests preserve signals and responses, recording only technical failure codes',async()=>{
 const signal=new AbortController().signal,response={status:503};
 const m=load(async(url,init)=>{assert.equal(url,'private-query');assert.equal(init.signal,signal);return response;});
 assert.equal(await m.observedFetch('private-query',{signal}),response);assert.deepEqual(m.events,[503]);
});
test('transport errors propagate unchanged; caller cancellations are excluded',async()=>{
 const error=new Error('private details'),m=load(async()=>{throw error});
 await assert.rejects(m.observedFetch('private-query'),e=>e===error);assert.deepEqual(m.events,['network']);
 const controller=new AbortController();controller.abort();
 await assert.rejects(m.observedFetch('private-query',{signal:controller.signal}),e=>e===error);assert.deepEqual(m.events,['network']);
});

test('API deadlines are recorded while explicit caller cancellation remains excluded', async()=>{
 const m=load((url,{signal})=>new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(signal.reason),{once:true})));
 const keepAlive=setTimeout(()=>{},1000);
 try {
  await assert.rejects(m.apiFetch('private-query',{},5));
  assert.deepEqual(m.events,['network']);
  const controller=new AbortController();
  const pending=m.apiFetch('private-query',{signal:controller.signal},100);
  controller.abort();await assert.rejects(pending);
  assert.deepEqual(m.events,['network']);
 } finally {clearTimeout(keepAlive);}
});
