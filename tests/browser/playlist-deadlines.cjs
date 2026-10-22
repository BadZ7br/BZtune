/** Stalled HTTP, JSON and native IPC must release controls without repeating writes. */
const assert = require('node:assert/strict');
const path = require('node:path');
const {createRequire} = require('node:module');
const {chromium} = createRequire(path.resolve(__dirname,'../../doomvault/package.json'))('playwright');
const {fixture} = require('./frontend-contracts.cjs');
const created = {id:'created',name:'Playlist lenta',description:'',created_at:'2026-01-01',count:0,tracks:[]};
const alert = page => page.getByRole('alert').filter({visible:true});
(async()=>{
 const browser=await chromium.launch({...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{}),args:['--no-sandbox']});
 try {
  let release,writes=0,committed=false;
  const http=await fixture(browser,{tab:'playlists',override:async(r,u)=>{
   if(u.pathname!=='/api/playlists')return false;
   if(r.request().method()==='POST'){
    writes++;await new Promise(resolve=>{release=resolve});committed=true;
    await r.fulfill({json:{playlist:created}});return true;
   }
   if(committed){await r.fulfill({json:{playlists:[created]}});return true;}
  }});
  await http.page.getByRole('button',{name:/Playlist de Teste/}).first().waitFor();
  await http.page.clock.install();
  await http.page.getByRole('textbox',{name:'Nome da playlist',exact:true}).fill(created.name);
  const sent=http.page.waitForRequest(r=>r.url().endsWith('/api/playlists')&&r.method()==='POST');
  await http.page.getByRole('button',{name:'Criar playlist',exact:true}).click();await sent;
  await http.page.clock.fastForward(31000);
  await alert(http.page).filter({hasText:'não foi confirmada no prazo'}).waitFor();
  assert.equal(await http.page.getByRole('button',{name:'Criar playlist',exact:true}).isEnabled(),true);
  await http.page.getByRole('button',{name:'Criar playlist',exact:true}).click();
  await alert(http.page).filter({hasText:/última alteração/}).waitFor();assert.equal(writes,1);
  release();
  // Explicit read after the delayed server commit; no automatic second POST.
  for(let i=0;i<50&&!committed;i++)await new Promise(resolve=>setTimeout(resolve,10));
  await http.page.getByRole('button',{name:'Atualizar playlists',exact:true}).click();
  await http.page.getByRole('button',{name:/Playlist lenta/}).waitFor();assert.equal(writes,1);
  assert.deepEqual(http.errors,[]);await http.page.close();console.log('PASS HTTP write timeout, controls released, no duplicate write and explicit reconciliation');

  const native=await fixture(browser,{tab:'playlists'});
  await native.page.getByRole('button',{name:/Playlist de Teste/}).first().waitFor();
  await native.page.evaluate(()=>{
   window.nativeWrites=0;window.nativeLists=[];
   window.__TAURI__={core:{invoke:(_command,{request})=>{
    if(request.action==='list')return Promise.resolve({playlists:window.nativeLists});
    window.nativeWrites++;return new Promise(resolve=>{window.finishNative=()=>{
     const playlist={id:'native',name:'Nativa lenta',description:'',created_at:'2026-01-01',count:0,tracks:[]};
     window.nativeLists=[playlist];resolve({playlist});
    }});
   }}};
  });
  await native.page.clock.install();
  await native.page.getByRole('textbox',{name:'Nome da playlist',exact:true}).fill('Nativa lenta');
  await native.page.getByRole('button',{name:'Criar playlist',exact:true}).click();
  await native.page.clock.fastForward(31000);
  await alert(native.page).filter({hasText:'não foi confirmada no prazo'}).waitFor();
  await native.page.getByRole('button',{name:'Atualizar playlists',exact:true}).click();
  await alert(native.page).filter({hasText:'ainda está pendente'}).waitFor();
  await native.page.getByRole('button',{name:'Criar playlist',exact:true}).click();
  assert.equal(await native.page.evaluate(()=>window.nativeWrites),1);
  await native.page.evaluate(()=>window.finishNative());
  await native.page.getByRole('button',{name:'Atualizar playlists',exact:true}).click();
  await native.page.getByRole('button',{name:/Nativa lenta/}).waitFor();
  await alert(native.page).waitFor({state:'hidden'});assert.equal(await native.page.evaluate(()=>window.nativeWrites),1);
  assert.deepEqual(native.errors,[]);await native.page.close();console.log('PASS native timeout, pending write lock, late result and explicit reconciliation');

  const picker=await fixture(browser,{tab:'library'});
  await picker.page.getByRole('button',{name:'Faixas',exact:true}).click();
  await picker.page.getByRole('button',{name:'Reproduzir Faixa Local 1',exact:true}).click();
  await picker.page.getByRole('button',{name:'Expandir player',exact:true}).click();
  await picker.page.evaluate(()=>{
   window.stallPlaylistList=true;
   window.__TAURI__={core:{invoke:()=>window.stallPlaylistList?new Promise(()=>{}):Promise.resolve({playlists:[
    {id:'p',name:'Playlist recuperada',description:'',created_at:'2026-01-01',count:0,tracks:[]}
   ]})}};
  });
  await picker.page.clock.install();
  await picker.page.getByRole('button',{name:'Adicionar Faixa Local 1 à playlist',exact:true}).click();
  await picker.page.clock.fastForward(31000);
  const chooser=picker.page.getByRole('dialog',{name:'Escolher playlist',exact:true});
  await chooser.getByRole('alert').waitFor();
  assert.equal(await chooser.getByText('Processando...', {exact:true}).count(),0);
  await picker.page.evaluate(()=>{window.stallPlaylistList=false});
  await chooser.getByRole('button',{name:'Atualizar playlists',exact:true}).click();
  await chooser.getByRole('button',{name:'Playlist recuperada',exact:true}).waitFor();
  assert.deepEqual(picker.errors,[]);await picker.page.close();console.log('PASS local playlist selector read timeout and explicit retry');

  // Keep the response headers but stall the body, exercising the whole-request deadline.
  const queue=await fixture(browser);
  await queue.page.getByRole('button',{name:'Expandir player',exact:true}).click();
  const queueToggle=queue.page.getByRole('button',{name:'Fila',exact:true});
  if(await queueToggle.getAttribute('aria-expanded')==='false')await queueToggle.click();
  await queue.page.evaluate(()=>{
   window.realFetch=window.fetch;
   window.fetch=(input,init)=>String(input).endsWith('/api/library/tracks')&&window.hangQueue
    ? Promise.resolve({ok:true,json:()=>new Promise(()=>{})}) : window.realFetch(input,init);
   window.hangQueue=true;
  });
  await queue.page.clock.install();
  await queue.page.getByRole('button',{name:'Adicionar músicas da biblioteca',exact:true}).click();
  await queue.page.clock.fastForward(31000);
  const panel=queue.page.getByRole('region',{name:'Adicionar músicas à fila',exact:true});
  await panel.getByRole('alert').waitFor();assert.equal(await panel.getByRole('status').count(),0);
  await queue.page.evaluate(()=>{window.hangQueue=false});
  await queue.page.getByRole('button',{name:'Tentar carregar biblioteca novamente',exact:true}).click();
  await panel.getByRole('button',{name:'Adicionar Faixa Local 1 à fila',exact:true}).click();
  await panel.getByRole('button',{name:'Adicionar Faixa Local 1 à fila',exact:true,disabled:true}).waitFor();
  assert.deepEqual(queue.errors,[]);await queue.page.close();console.log('PASS queue stalled JSON deadline, local retry and enqueue');
 } finally {await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
