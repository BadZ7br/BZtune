import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
const require = createRequire(new URL('../doomvault/package.json', import.meta.url));
const ts = require('typescript');
function load(name, globals={}) {
  const exports={};
  const compiled=ts.transpileModule(readFileSync(new URL(`../doomvault/src/services/${name}.ts`,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
  vm.runInNewContext(compiled,{exports,Error,...globals});return exports;
}
test('search rejects missing results and malformed members before rendering',()=>{
  const {parseSearch}=load('search');
  for(const value of [null,{query:'a'},{query:'a',results:{artists:[],albums:[],songs:[{title:{}}]}}])assert.throws(()=>parseSearch(value),/inválida/);
  assert.equal(parseSearch({query:'ok',results:{artists:[],albums:[],songs:[]}}).query,'ok');
});
test('configuration import validates every entry before applying any',()=>{
  const {parseBrowserBackup}=load('browser-backup');
  const envelope=settings=>({format:'bztune-browser-settings-v1',settings});
  assert.throws(()=>parseBrowserBackup(envelope({'doomvault-favorites':'[]','bztune-executable':'anything'})),/inválidas/);
  assert.throws(()=>parseBrowserBackup(envelope({'doomvault-eq-v11':'{}'})),/inválidas/);
  assert.throws(()=>parseBrowserBackup(envelope({'doomvault-player-state-v11':JSON.stringify({tracks:[{videoId:'id',title:{},artist:'A'}],index:0,repeat:'off',shuffle:false})})),/inválidas/);
  assert.equal(parseBrowserBackup(envelope({'doomvault-favorites':'["a"]','bztune-library-query':'test','bztune-library-sort':'count'})).length,3);
});
test('configuration import rolls earlier changes back when a later write fails',()=>{
  const {applyBrowserBackup}=load('browser-backup');
  const values=new Map([['first','old']]);let failed=false;
  const storage={getItem:k=>values.get(k)??null,setItem:(k,v)=>{if(k==='second'&&!failed){failed=true;throw Error('quota')}values.set(k,v)},removeItem:k=>values.delete(k)};
  assert.throws(()=>applyBrowserBackup([['first','new'],['second','value']],storage),/restauradas/);
  assert.equal(values.get('first'),'old');assert.equal(values.has('second'),false);
});
test('blocked storage stays usable in memory and retries the latest value',()=>{
  const values=new Map();let blocked=true;
  const storage={getItem:()=>{throw Error('blocked')},setItem:(k,v)=>{if(blocked)throw Error('quota');values.set(k,v)},removeItem:k=>values.delete(k)};
  const {readStorage,writeStorage,retryStorage,unsavedStorage}=load('storage',{localStorage:storage,window:{dispatchEvent(){}},Event:class{}});
  assert.equal(readStorage('a'),null);assert.equal(writeStorage('a','old'),false);writeStorage('a','latest');assert.equal(unsavedStorage(),true);
  blocked=false;assert.equal(retryStorage(),true);assert.equal(values.get('a'),'latest');
});
