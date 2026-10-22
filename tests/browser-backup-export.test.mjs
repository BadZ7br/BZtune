import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';
const require=createRequire(new URL('../doomvault/package.json',import.meta.url));
const ts=require('typescript');
function load(globals={}) {
 const cache=new Map();
 function module(name){
  if(cache.has(name))return cache.get(name);
  const exports={};cache.set(name,exports);
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL(`../doomvault/src/services/${name}.ts`,import.meta.url),'utf8'),{
   compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}
  }).outputText,{exports,Error,TextEncoder,window:{dispatchEvent(){}},Event:class{},require:name=>module(name.replace('./','')),...globals});
  return exports;
 }
 return {backup:module('browser-backup'),storage:module('storage')};
}
function disk(initial={}){
 const values=new Map(Object.entries(initial));
 return {values,get length(){return values.size},key:index=>[...values.keys()][index]??null,
  getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};
}
const usable={source:'LRCLIB',instrumental:false,syncedLyrics:'[00:01]Verse',plainLyrics:'Verse'};
test('export uses the import contract and preserves unusable caches and unknown keys separately',()=>{
 const {backup}=load();
 const input=new Map([['doomvault-favorites','["album"]'],['bztune-lyrics-v1:empty',JSON.stringify({...usable,syncedLyrics:'',plainLyrics:''})],
  ['bztune-unknown-future','raw original'],['bztune-lyrics-v1:valid',JSON.stringify(usable)],['other-app-key','private']]);
 const before=[...input];const result=backup.createBrowserBackup(input);const parsed=JSON.parse(result.json);
 assert.equal(backup.parseBrowserBackup(parsed).length,2);
 assert.deepEqual([...result.excludedKeys],['bztune-lyrics-v1:empty','bztune-unknown-future']);
 assert.equal(parsed.excludedSettings['bztune-unknown-future'],'raw original');
 assert.equal(parsed.excludedSettings['bztune-lyrics-v1:empty'],input.get('bztune-lyrics-v1:empty'));
 assert.equal(result.json.includes('other-app-key'),false);assert.deepEqual([...input],before);
 const target=disk();backup.applyBrowserBackup(backup.parseBrowserBackup(parsed),target);
 assert.equal(target.getItem('doomvault-favorites'),'["album"]');assert.equal(target.getItem('bztune-lyrics-v1:valid'),JSON.stringify(usable));
 assert.equal(target.getItem('bztune-unknown-future'),null);assert.equal(target.getItem('bztune-lyrics-v1:empty'),null);
});
test('snapshot exports the latest pending lyrics, source, delay and deletion without consuming pending writes',()=>{
 const stored=disk({'doomvault-favorites':'[]','doomvault-lrc-v11:track':'Old manual','bztune-lyrics-v1:track':JSON.stringify(usable)});
 const blocked={get length(){return stored.length},key:stored.key,getItem:stored.getItem,setItem(){throw Error('quota')},removeItem(){throw Error('blocked')}};
 const {backup,storage}=load({localStorage:blocked});
 storage.writeStorage('doomvault-lrc-v11:track','[00:01]New manual');
 storage.writeStorage('doomvault-lrc-v11:track','[00:01]Latest manual');
 storage.writeStorage('bztune-lyrics-source-v1:track','manual');
 storage.writeStorage('bztune-lyrics-offset-v1:online:manual:track','100');
 storage.removeStorage('bztune-lyrics-v1:track');
 const result=backup.createBrowserBackup(storage.snapshotStorage());const parsed=JSON.parse(result.json);
 assert.equal(parsed.settings['doomvault-lrc-v11:track'],'[00:01]Latest manual');
 assert.equal(parsed.settings['bztune-lyrics-source-v1:track'],'manual');
 assert.equal(parsed.settings['bztune-lyrics-offset-v1:online:manual:track'],'100');
 assert.equal('bztune-lyrics-v1:track' in parsed.settings,false);
 assert.equal(storage.unsavedStorage(),true);assert.equal(stored.getItem('doomvault-lrc-v11:track'),'Old manual');
 const target=disk();backup.applyBrowserBackup(backup.parseBrowserBackup(parsed),target);
 assert.equal(target.getItem('doomvault-lrc-v11:track'),'[00:01]Latest manual');assert.equal(target.getItem('bztune-lyrics-v1:track'),null);
});
test('current appearance preferences replace stale stored preferences in the exported file',()=>{
 const {backup}=load();
 const result=backup.createBrowserBackup(new Map([['bztune-settings-v1','{"theme":"dark"}']]),{'bztune-settings-v1':'{"theme":"light","accent":"#123456"}'});
 assert.equal(JSON.parse(result.json).settings['bztune-settings-v1'],'{"theme":"light","accent":"#123456"}');
 assert.equal(backup.parseBrowserBackup(JSON.parse(result.json)).length,1);
 const invalid='{"theme":"future-theme"}';
 const preserved=JSON.parse(backup.createBrowserBackup(new Map([['bztune-settings-v1',invalid]]),{'bztune-settings-v1':'{"theme":"light"}'}).json);
 assert.equal(preserved.excludedSettings['bztune-settings-v1'],invalid);
 assert.equal(preserved.settings['bztune-settings-v1'],'{"theme":"light"}');
});
test('a blocked or incomplete storage enumeration aborts the snapshot instead of hiding omissions',()=>{
 const {storage}=load();
 assert.throws(()=>storage.snapshotStorage({get length(){throw Error('SecurityError')}}),/SecurityError/);
 assert.throws(()=>storage.snapshotStorage({length:1,key:()=>null}),/ler todas/);
 assert.throws(()=>storage.snapshotStorage({length:1,key:()=> 'doomvault-favorites',getItem(){throw Error('blocked')}}),/blocked/);
});
test('an export larger than the import byte limit is refused, including preserved invalid data',()=>{
 const {backup}=load();
 assert.throws(()=>backup.createBrowserBackup(new Map([['doomvault-favorites','[]'],['bztune-unknown','á'.repeat(6*1024*1024)]])),/limite de restauração/);
 assert.throws(()=>backup.createBrowserBackup(new Map([['bztune-unknown','raw']])) ,/Nenhum backup foi gerado/);
});
test('malformed preserved metadata cannot bypass strict restoration validation; old version-1 files still work',()=>{
 const {backup}=load();const envelope={format:'bztune-browser-settings-v1',settings:{'doomvault-favorites':'[]'}};
 assert.equal(backup.parseBrowserBackup(envelope).length,1);
 for(const excludedSettings of [null,[],{'bztune-unknown':{}}])assert.throws(()=>backup.parseBrowserBackup({...envelope,excludedSettings}),/seção/);
 assert.throws(()=>backup.parseBrowserBackup({...envelope,settings:{'doomvault-favorites':'{}'},excludedSettings:{'doomvault-favorites':'[]'}}),/inválidas/);
});
