import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';
const require=createRequire(new URL('../doomvault/package.json',import.meta.url));
const ts=require('typescript');
test('diagnostic event buffer is bounded, expires and contains only technical codes',()=>{
 let now=1000000;
 const exports={};
 vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../doomvault/src/services/diagnostic-events.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports,Date:{now:()=>now}});
 for(let i=0;i<30;i++)exports.recordRequestFailure(503);
 assert.equal(exports.recentRequestFailures().length,20);
 exports.recordRequestFailure('network');
 assert.equal(exports.recentRequestFailures().at(-1),'Conexão ou prazo excedido');
 assert.equal(exports.recentRequestFailures().every(x=>x==='HTTP 503'||x==='Conexão ou prazo excedido'),true);
 now+=16*60*1000;
 assert.equal(exports.recentRequestFailures().length,0);
});
