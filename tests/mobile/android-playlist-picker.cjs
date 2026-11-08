/** Contextual playlist workflows with a simulated native bridge; no physical playback is asserted. */
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
const {createRequire}=require('node:module');
const {chromium}=createRequire(path.resolve(__dirname,'../../doomvault/package.json'))('playwright');
const navigation=require('./navigation-helpers.cjs');
(async()=>{
 const browser=await chromium.launch({...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{}),args:['--no-sandbox']});
 try{
  const page=await browser.newPage({viewport:{width:380,height:844}}),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.addInitScript(require('./playlist-fixture.cjs'));
  await page.goto('http://127.0.0.1:1420/mobile.html');await navigation.nav(page,'Busca');await page.getByRole('searchbox',{name:'Buscar músicas',exact:true}).fill('Ação');
  const picker=page.getByRole('dialog',{name:'Adicionar à playlist',exact:true});
  const open=()=>navigation.trackAction(page,'Ação','Adicionar Ação à playlist');
  await open();await picker.getByText('Nenhuma playlist criada. Use + para criar a primeira.',{exact:true}).waitFor();
  await picker.getByRole('button',{name:'Nova playlist',exact:true}).click();await picker.getByRole('textbox',{name:'Nome da nova playlist',exact:true}).fill('Estrada');await picker.getByRole('button',{name:'Criar playlist',exact:true}).click();
  await picker.getByRole('button',{name:'Selecionar playlist Estrada',exact:true}).waitFor();await picker.getByRole('button',{name:'Adicionar música selecionada',exact:true}).waitFor();
  await page.waitForFunction(()=>document.querySelector('.picker-confirm .primary')?.disabled===false);
  if(process.env.BZTUNE_CAPTURE_DIR){fs.mkdirSync(process.env.BZTUNE_CAPTURE_DIR,{recursive:true});await page.screenshot({animations:'disabled',path:path.join(process.env.BZTUNE_CAPTURE_DIR,'seletor-playlist.png')});}
  assert.equal(await page.evaluate(()=>history.state.screen),'search');assert.equal(await page.locator('#library-search').inputValue(),'Ação');
  assert.equal(await page.evaluate(()=>window.commands.filter(c=>c.cmd==='playlists'&&c.args.request.action==='add').length),0,'creating does not silently add the song');
  await picker.getByRole('button',{name:'Adicionar música selecionada',exact:true}).click();await picker.waitFor({state:'hidden'});await page.getByRole('status').filter({hasText:'Música adicionada a “Estrada”'}).waitFor();assert.equal(await page.locator('#library-search').inputValue(),'Ação');assert.equal(await page.evaluate(()=>history.state.screen),'search');
  await open();await picker.getByRole('button',{name:'Selecionar playlist Estrada',exact:true}).click();await picker.getByText('Esta música já está nesta playlist.',{exact:true}).waitFor();
  const before=await page.evaluate(()=>window.commands.filter(c=>c.cmd==='playlists'&&c.args.request.action!=='list').length);
  await page.goBack();await picker.waitFor({state:'hidden'});assert.equal(await page.evaluate(()=>history.state.screen),'search');assert.equal(await page.locator('#library-search').inputValue(),'Ação');
  await open();await page.keyboard.press('Escape');await picker.waitFor({state:'hidden'});assert.equal(await page.evaluate(()=>window.commands.filter(c=>c.cmd==='playlists'&&c.args.request.action!=='list').length),before);
  await navigation.library(page,'Playlists');const panel=page.getByRole('region',{name:'Playlists locais',exact:true});await panel.getByRole('button',{name:'Abrir playlist Estrada',exact:true}).waitFor();
  if(process.env.BZTUNE_CAPTURE_DIR)await page.screenshot({animations:'disabled',path:path.join(process.env.BZTUNE_CAPTURE_DIR,'playlists.png')});
  await panel.getByRole('button',{name:'Abrir playlist Estrada',exact:true}).click();const detail=page.getByRole('region',{name:'Detalhes da playlist',exact:true});await detail.getByRole('heading',{name:'Estrada',exact:true}).waitFor();
  if(process.env.BZTUNE_CAPTURE_DIR)await page.screenshot({animations:'disabled',path:path.join(process.env.BZTUNE_CAPTURE_DIR,'playlist-detalhe.png')});
  await page.goBack();await panel.waitFor();await navigation.library(page);
  await page.evaluate(()=>window.seedPlaylists([{id:'full',name:'Lotada',revision:0,ids:Array.from({length:200},(_,i)=>'other-'+i)}]));
  await open();await picker.getByRole('button',{name:'Selecionar playlist Lotada',exact:true}).click();await picker.getByText('Esta playlist atingiu o limite de 200 músicas.',{exact:true}).waitFor();assert.equal(await picker.getByRole('button',{name:'Adicionar música selecionada',exact:true}).isDisabled(),true);await picker.getByRole('button',{name:'Cancelar seleção da música',exact:true}).click();await picker.waitFor({state:'hidden'});
  await page.evaluate(()=>window.seedPlaylists(Array.from({length:100},(_,i)=>({id:'p'+i,name:'Playlist '+i,revision:0,ids:[]}))));await open();await picker.getByRole('button',{name:'Selecionar playlist Playlist 99',exact:true}).waitFor();assert.equal(await picker.getByRole('button',{name:'Nova playlist',exact:true}).isDisabled(),true);
  await picker.getByRole('searchbox',{name:'Buscar playlist de destino',exact:true}).fill('inexistente');await picker.getByText('Nenhuma playlist corresponde à busca.',{exact:true}).waitFor();await page.keyboard.press('Escape');await picker.waitFor({state:'hidden'});
  await page.evaluate(()=>window.seedPlaylists([{id:'slow',name:'Pendente',revision:0,ids:[]}]));await open();await picker.getByRole('button',{name:'Selecionar playlist Pendente',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.picker-confirm .primary')?.disabled===false);
  await page.evaluate(()=>{window.holdMutation='add';});await picker.getByRole('button',{name:'Adicionar música selecionada',exact:true}).click();await picker.getByText('Salvando playlist…',{exact:true}).waitFor();
  await page.goBack();assert.equal(await picker.isVisible(),true,'Back cannot abandon a submitted mutation');assert.equal(await picker.getByRole('button',{name:'Fechar opções',exact:true}).isDisabled(),true);assert.equal(await page.evaluate(()=>typeof window.releaseMutation),'function');
  await page.evaluate(()=>{window.holdMutation='';window.releaseMutation();});await picker.waitFor({state:'hidden'});
  await page.evaluate(()=>window.seedPlaylists([{id:'recover',name:'Recuperação',revision:0,ids:[]}]));await open();await picker.getByRole('button',{name:'Selecionar playlist Recuperação',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.picker-confirm .primary')?.disabled===false);
  await page.evaluate(()=>{window.forceConflict=true;});await picker.getByRole('button',{name:'Adicionar música selecionada',exact:true}).click();await picker.getByRole('alert').filter({hasText:'mudou'}).waitFor();assert.equal(await picker.getByRole('button',{name:'Adicionar música selecionada',exact:true}).isDisabled(),true);
  await page.evaluate(()=>{window.forceConflict=false;});await picker.getByRole('button',{name:'Recarregar playlists',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.picker-confirm .primary')?.disabled===false);
  await page.evaluate(()=>{window.invalidMutation=true;});await picker.getByRole('button',{name:'Adicionar música selecionada',exact:true}).click();await picker.getByRole('alert').filter({hasText:'Resposta inválida'}).waitFor();await page.evaluate(()=>{window.invalidMutation=false;});await picker.getByRole('button',{name:'Recarregar playlists',exact:true}).click();await picker.getByText('Esta música já está nesta playlist.',{exact:true}).waitFor();
  await page.setViewportSize({width:320,height:568});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);const bounds=await picker.boundingBox();assert.ok(bounds&&bounds.y>=0&&bounds.y+bounds.height<=569);await page.keyboard.press('Escape');await picker.waitFor({state:'hidden'});
  const unrelated=await page.evaluate(()=>window.commands.filter(c=>['play','pause','choose','seek','library_play','library_enqueue','playlist_play','playlist_enqueue'].includes(c.cmd)));assert.deepEqual(unrelated,[],'organizing playlists does not alter playback');assert.deepEqual(errors,[]);
  console.log('PASS playlist picker origin/search, create-then-confirm, Back/Escape, duplicates, limits 100/200, search, mutation locking, conflicts, invalid mutation recovery, unchanged player and narrow screen');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
