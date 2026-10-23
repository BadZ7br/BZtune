/** Download and restore the same JSON; include session-only lyrics under quota failure. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {createRequire}=require('node:module');
const {chromium}=createRequire(path.resolve(__dirname,'../../doomvault/package.json'))('playwright');
const {fixture}=require('./frontend-contracts.cjs');
async function download(page){
 const ready=page.waitForEvent('download');
 await page.getByRole('button',{name:'Exportar JSON',exact:true}).click();
 const file=await ready;
 return {json:fs.readFileSync(await file.path(),'utf8'),filename:file.suggestedFilename()};
}
async function tools(page){
 await page.locator('.sidebar').getByRole('button',{name:'Ferramentas',exact:true}).click();
 await page.getByRole('button',{name:'Backup e diagnóstico',exact:true}).click();
}
async function restore(page,file){
 const before=await page.evaluate(()=>performance.timeOrigin);
 try{
  // The document reload is required; unrelated resource load events are not.
  await Promise.all([
   page.waitForEvent('domcontentloaded'),
   page.locator('input[type=file][accept=".json,application/json"]').setInputFiles({name:file.filename,mimeType:'application/json',buffer:Buffer.from(file.json)})
  ]);
  assert.notEqual(await page.evaluate(()=>performance.timeOrigin),before,'restore must actually reload the document');
 }catch(error){
  const state=await page.evaluate(()=>({url:location.href,readyState:document.readyState,timeOrigin:performance.timeOrigin,alerts:[...document.querySelectorAll('[role="alert"]')].filter(e=>e.getClientRects().length).map(e=>e.textContent)})).catch(e=>({diagnosticError:e.message}));
  console.error('Backup restore state:',JSON.stringify(state));throw error;
 }
}
(async()=>{
 const browser=await chromium.launch({...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{}),args:['--no-sandbox']});
 try{
  const f=await fixture(browser,{tab:'maintenance',preserveStorageOnReload:true,seed:{
   'bztune-lyrics-v1:oldtrack':JSON.stringify({source:'LRCLIB',instrumental:false,syncedLyrics:'',plainLyrics:''}),
   'bztune-future-option':'original unknown value'
  }});
  const file=await download(f.page);assert.equal(file.filename,'BZtune-Configuracoes.json');
  const backup=JSON.parse(file.json);
  assert.equal(backup.settings['doomvault-favorites'],'["album1"]');
  assert.equal(backup.excludedSettings['bztune-future-option'],'original unknown value');
  assert.equal(typeof backup.excludedSettings['bztune-lyrics-v1:oldtrack'],'string');
  await f.page.getByRole('alert').filter({visible:true,hasText:'Backup parcial'}).waitFor();
  await f.page.evaluate(()=>{localStorage.setItem('doomvault-favorites','[]');localStorage.removeItem('bztune-future-option');localStorage.removeItem('bztune-lyrics-v1:oldtrack')});
  let confirmation='';f.page.once('dialog',async dialog=>{confirmation=dialog.message();await dialog.accept()});
  await restore(f.page,file);
  assert.match(confirmation,/não serão restaurados/);
  assert.equal(await f.page.evaluate(()=>localStorage.getItem('doomvault-favorites')),'["album1"]');
  assert.equal(await f.page.evaluate(()=>localStorage.getItem('bztune-future-option')),null);
  assert.equal(await f.page.evaluate(()=>localStorage.getItem('bztune-lyrics-v1:oldtrack')),null);
  await f.page.getByRole('button',{name:'Exportar JSON',exact:true}).waitFor();
  await f.page.evaluate(()=>{Storage.prototype.key=function(){throw Error('Leitura bloqueada no teste')}});
  let unexpectedDownloads=0;f.page.on('download',()=>unexpectedDownloads++);
  await f.page.getByRole('button',{name:'Exportar JSON',exact:true}).click();
  await f.page.getByRole('alert').filter({visible:true,hasText:'Leitura bloqueada no teste'}).waitFor();
  assert.equal(await f.page.getByRole('status').filter({visible:true,hasText:'JSON de configurações gerado.'}).count(),0);
  assert.equal(unexpectedDownloads,0);
  assert.deepEqual(f.errors,[]);await f.page.close();console.log('PASS downloaded JSON restores favorites; unusable cache and unknown data preserved separately with explicit warnings');

  const session=await fixture(browser,{preserveStorageOnReload:true,seed:{'doomvault-lrc-v11:abcdefghijk':'[00:01]Old saved words'}});
  await session.page.getByRole('button',{name:'Expandir player',exact:true}).click();
  const panel=session.page.getByRole('region',{name:'Letras da música',exact:true});
  await panel.getByText('Old saved words',{exact:true}).waitFor();
  await session.page.evaluate(()=>{
   window.originalSetItem=Storage.prototype.setItem;
   Storage.prototype.setItem=function(key,value){
    if(key.startsWith('doomvault-lrc-v11:')||key.startsWith('bztune-lyrics-source-v1:')||key==='bztune-settings-v1')throw new DOMException('Quota full','QuotaExceededError');
    return window.originalSetItem.call(this,key,value);
   };
  });
  await panel.locator('input[type=file]').setInputFiles({name:'session.lrc',mimeType:'text/plain',buffer:Buffer.from('[00:01]Latest session words')});
  await panel.getByText('Latest session words',{exact:true}).waitFor();
  assert.equal(await session.page.evaluate(()=>localStorage.getItem('doomvault-lrc-v11:abcdefghijk')),'[00:01]Old saved words');
  await session.page.getByRole('button',{name:'Minimizar para o mini-player',exact:true}).click();
  await session.page.locator('.sidebar').getByRole('button',{name:'Sistema',exact:true}).click();
  await session.page.getByRole('button',{name:/^Interface/}).click();
  await session.page.getByRole('group',{name:'Tema do BZtune',exact:true}).getByRole('button',{name:/^Claro/}).click();
  await session.page.waitForFunction(()=>document.documentElement.dataset.bzTheme==='light');
  assert.equal(await session.page.evaluate(()=>JSON.parse(localStorage.getItem('bztune-settings-v1')).theme),'dark');
  await tools(session.page);
  const pending=await download(session.page);const saved=JSON.parse(pending.json);
  assert.equal(saved.settings['doomvault-lrc-v11:abcdefghijk'],'[00:01]Latest session words');
  assert.equal(saved.settings['bztune-lyrics-source-v1:abcdefghijk'],'manual');
  assert.equal(JSON.parse(saved.settings['bztune-settings-v1']).theme,'light');
  await session.page.getByRole('status').filter({visible:true,hasText:'incluindo alterações pendentes'}).waitFor();
  assert.equal(await session.page.evaluate(()=>localStorage.getItem('doomvault-lrc-v11:abcdefghijk')),'[00:01]Old saved words');
  await session.page.evaluate(()=>{Storage.prototype.setItem=window.originalSetItem});
  session.page.once('dialog',dialog=>dialog.accept());
  await restore(session.page,pending);
  assert.equal(await session.page.evaluate(()=>localStorage.getItem('doomvault-lrc-v11:abcdefghijk')),'[00:01]Latest session words');
  await session.page.waitForFunction(()=>document.documentElement.dataset.bzTheme==='light');
  await session.page.getByRole('button',{name:'Expandir player',exact:true}).click();
  await session.page.getByRole('region',{name:'Letras da música',exact:true}).getByText('Latest session words',{exact:true}).waitFor();
  assert.deepEqual(session.errors,[]);await session.page.close();console.log('PASS session-only LRC and source included in download, disk left unchanged, same JSON restored after reload');
 }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
