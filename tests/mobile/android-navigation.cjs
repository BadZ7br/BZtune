/** Navigation/focus tests with an explicitly simulated native session. No physical audio is asserted. */
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
const {createRequire}=require('node:module');
const {chromium}=createRequire(path.resolve(__dirname,'../../doomvault/package.json'))('playwright');
const navigation=require('./navigation-helpers.cjs');
(async()=>{
 const browser=await chromium.launch({...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{}),args:['--no-sandbox']});
 try {
  const page=await browser.newPage({viewport:{width:412,height:892}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{
   window.calls=[];window.oldDetailsReleased=false;
   const state={title:'Faixa A',hasTrack:true,playing:true,loading:false,position:15000,duration:180000,failed:false,queue:[{id:'a',title:'Faixa A'},{id:'b',title:'Faixa B'}],index:0,shuffle:false,repeat:0,canNext:true,canPrevious:false};
   const tracks=Array.from({length:50},(_,i)=>({id:'local-'+i,title:'Música '+i,artist:'Artista',album:'Disco',year:'2026',duration:180000,favorite:i===7,cover:null}));
   window.__TAURI__={core:{invoke:async(name,args)=>{
    const cmd=name.split('|')[1];window.calls.push({cmd,args});
    if(cmd==='track_details') {
     if(args.id==='a')return new Promise(resolve=>{window.releaseOldDetails=()=>{window.oldDetailsReleased=true;resolve({id:'a',artist:'Artista antigo',album:'Disco antigo',cover:null});};});
     return window.badDetails?{id:'wrong-entry',artist:'Inválido',album:'Inválido',cover:null}:{id:args.id,artist:window.nativeArtist||'Artista B',album:'Disco de teste',cover:window.brokenCover?'data:image/jpeg;base64,AAAA':null};
    }
    if(cmd==='stage_backup')return {token:'same-queue-id',tracks:50,queued:1,favorites:1,playlists:0,albums:0,createdAt:'2026-10-31T00:00:00Z'};
    if(cmd==='restore_backup'){window.nativeArtist='Artista restaurado';window.brokenCover=false;state.playing=false;}
    if(cmd==='library_list') {
     const items=tracks.filter(t=>(!args.query||t.title.includes(args.query))&&(!args.favoritesOnly||t.favorite));
     return {items,total:items.length,page:0,pageSize:50,artists:['Artista'],albums:[]};
    }
    if(cmd==='albums')return {items:[],total:0,page:0,pageSize:50,artists:[]};
    if(cmd==='playlists')return {playlists:[],selected:null};
    if(cmd==='choose'){state.queue=[{id:'c',title:'Faixa B'}];state.index=0;state.title='Faixa B';state.playing=false;state.position=0;state.canNext=false;state.canPrevious=false;}
    if(cmd==='next'){state.index=1;state.title='Faixa B';state.canNext=false;state.canPrevious=true;}
    if(cmd==='pause')state.playing=false;
    if(cmd==='play')state.playing=true;
    if(cmd==='seek')state.position=args.position;
    return {...state,queue:[...state.queue]};
   }}};
  });
  await page.goto('http://127.0.0.1:1420/mobile.html');
  await navigation.trackTitle(page,'Faixa A').waitFor();
  assert.equal(await page.locator('.library-tracks>li').count(),0);
  assert.equal(await page.evaluate(()=>window.calls.some(c=>['library_list','albums','playlists'].includes(c.cmd))),false,'unvisited screens must not query data');
  await navigation.library(page);
  await page.getByText('50 música(s) nesta consulta.',{exact:true}).waitFor();
  assert.equal(await page.locator('.library-tracks>li').count(),50);
  const libraryCalls=await page.evaluate(()=>window.calls.filter(c=>c.cmd==='library_list').length);
  await navigation.library(page,'Álbuns');await page.getByText('0 álbum(ns) nesta consulta.',{exact:true}).waitFor();
  assert.equal(await page.locator('.library-tracks>li').count(),0,'inactive library must release its rendered rows');
  await page.waitForFunction(()=>window.calls.filter(c=>c.cmd==='snapshot').length>=3);
  assert.equal(await page.evaluate(()=>window.calls.filter(c=>c.cmd==='library_list').length),libraryCalls,'inactive library must not keep querying');
  assert.equal(await page.evaluate(()=>window.calls.filter(c=>c.cmd==='track_details').length),1,'artwork must not be fetched on every progress snapshot');
  await navigation.nav(page,'Busca');
  const search=page.getByRole('searchbox',{name:'Buscar músicas',exact:true});
  await page.waitForFunction(()=>document.activeElement?.matches('input[type=search]'));
  await search.fill('Música 7');await page.getByText('1 música(s) nesta consulta.',{exact:true}).waitFor();
  await navigation.nav(page,'Ajustes');await page.getByRole('region',{name:'Backup dos dados',exact:true}).waitFor();
  await navigation.nav(page,'Busca');assert.equal(await search.inputValue(),'Música 7');
  await navigation.player(page);let dialog=navigation.dialog(page);
  await dialog.getByRole('heading',{name:'Faixa A',exact:true}).waitFor();
  assert.equal(await page.evaluate(()=>document.activeElement?.getAttribute('aria-label')),'Minimizar player');
  await page.keyboard.press('Shift+Tab');assert.equal(await page.evaluate(()=>!!document.activeElement?.closest('.player-dialog')),true);
  await page.keyboard.press('Tab');assert.equal(await page.evaluate(()=>document.activeElement?.getAttribute('aria-label')),'Minimizar player');
  for(let i=0;i<18;i++){await page.keyboard.press('Tab');assert.equal(await page.evaluate(()=>!!document.activeElement?.closest('.player-dialog')),true,'Tab must stay in the modal');}
  await dialog.getByRole('button',{name:'Próxima',exact:true}).click();
  await dialog.getByRole('heading',{name:'Faixa B',exact:true}).waitFor();
  await dialog.getByText('Artista B',{exact:true}).waitFor();
  await page.evaluate(()=>window.releaseOldDetails());
  await page.waitForFunction(()=>window.oldDetailsReleased);
  assert.equal(await dialog.getByText('Artista antigo',{exact:true}).count(),0,'late previous-track details must be ignored');
  const commandsBeforeClose=await page.evaluate(()=>window.calls.filter(c=>['play','pause','stop','choose'].includes(c.cmd)).length);
  await page.keyboard.press('Escape');await dialog.waitFor({state:'hidden'});
  assert.equal(await page.evaluate(()=>document.activeElement?.getAttribute('aria-label')),'Abrir player expandido');
  assert.equal(await page.evaluate(()=>window.calls.filter(c=>['play','pause','stop','choose'].includes(c.cmd)).length),commandsBeforeClose,'minimizing must not touch native playback');
  assert.equal(await search.inputValue(),'Música 7');
  await navigation.player(page);await page.goBack();await dialog.waitFor({state:'hidden'});
  assert.equal(await search.inputValue(),'Música 7');
  await navigation.player(page);await navigation.queue(page);await dialog.getByRole('heading',{name:'Fila · 2',exact:true}).waitFor();
  await page.setViewportSize({width:320,height:568});
  const footer=await dialog.locator('.player-dialog-footer').boundingBox();assert.ok(footer&&footer.y>=0&&footer.y+footer.height<=569,'player controls must fit the short viewport');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await dialog.getByRole('button',{name:'Player',exact:true}).click();
  await dialog.locator('input[type=range]').press('End');
  await dialog.getByRole('button',{name:'Ir para posição',exact:true}).click();
  await page.waitForFunction(()=>window.calls.some(c=>c.cmd==='seek'&&c.args.position===180000));
  await page.evaluate(()=>{window.badDetails=true;});
  await navigation.replaceMusic(page);
  await dialog.getByText('Detalhes inválidos da faixa.',{exact:true}).waitFor();
  await page.evaluate(()=>{window.badDetails=false;window.brokenCover=true;});
  await dialog.getByRole('button',{name:'Recarregar detalhes',exact:true}).click();
  await dialog.getByText('Artista B',{exact:true}).waitFor();
  await page.waitForFunction(()=>document.querySelectorAll('.player-artwork img').length===0);
  assert.equal(await dialog.getByRole('button',{name:'Tocar',exact:true}).isEnabled(),true,'unavailable artwork must not disable playback');
  await navigation.closePlayer(page);
  const detailReads=await page.evaluate(()=>window.calls.filter(c=>c.cmd==='track_details').length);
  await navigation.nav(page,'Ajustes');
  const backup=page.getByRole('region',{name:'Backup dos dados',exact:true});
  await backup.getByRole('button',{name:'Escolher backup para conferir',exact:true}).click();
  await backup.getByRole('button',{name:'Confirmar restauração',exact:true}).click();
  await page.locator('.mini-track').getByText('Artista restaurado',{exact:true}).waitFor();
  assert.equal(await page.evaluate(()=>window.calls.filter(c=>c.cmd==='track_details').length),detailReads+1,'restoring the same queue ID must invalidate cached metadata');
  await navigation.nav(page,'Busca');
  await page.waitForFunction(()=>document.activeElement?.matches('input[type=search]'));
  await page.setViewportSize({width:320,height:360});
  await page.waitForFunction(()=>document.querySelector('.mobile-dock').hidden);
  assert.equal(await search.isVisible(),true);
  await page.setViewportSize({width:320,height:568});
  await page.waitForFunction(()=>!document.querySelector('.mobile-dock').hidden);
  if(process.env.BZTUNE_CAPTURE_DIR){
   fs.mkdirSync(process.env.BZTUNE_CAPTURE_DIR,{recursive:true});
   await page.setViewportSize({width:412,height:892});
   await navigation.nav(page,'Início');await page.screenshot({animations:'disabled',path:path.join(process.env.BZTUNE_CAPTURE_DIR,'inicio.png')});
   await navigation.player(page);await dialog.getByRole('heading',{name:'Faixa B',exact:true}).waitFor();await page.screenshot({animations:'disabled',path:path.join(process.env.BZTUNE_CAPTURE_DIR,'player.png')});
   await navigation.queue(page);await page.screenshot({animations:'disabled',path:path.join(process.env.BZTUNE_CAPTURE_DIR,'fila.png')});await navigation.closePlayer(page);
  }
  await navigation.nav(page,'Ajustes');
  await page.addStyleTag({content:'body{font-size:200%}button,input,select{font-size:1em}.bottom-nav span,.player-functions button{font-size:1em}'});
  await page.evaluate(()=>window.scrollTo(0,document.documentElement.scrollHeight));
  await page.waitForFunction(()=>Math.abs(parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--dock-height'))-document.querySelector('.mobile-dock').offsetHeight)<2);
  const last=await page.locator('.app-information p').last().boundingBox(),dock=await page.locator('.mobile-dock').boundingBox();assert.ok(last&&dock&&last.y+last.height<=dock.y,'dock must not cover settings with enlarged text');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  assert.deepEqual(errors,[]);await page.close();
  console.log('PASS mobile navigation, lazy retained screens, local search, focus containment/return, Escape/Back, unchanged playback, delayed artwork, seek, short screens and enlarged text');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
