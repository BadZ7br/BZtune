const navigation=require('./navigation-helpers.cjs');
/** Browser integration uses an explicit native bridge fixture; SQL, migration and backup are tested in Kotlin. */
const assert=require('node:assert/strict'),path=require('node:path');
const {createRequire}=require('node:module');
const {chromium}=createRequire(path.resolve(__dirname,'../../doomvault/package.json'))('playwright');
(async()=>{
 const browser=await chromium.launch({...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{}),args:['--no-sandbox']});
 try {
  const page=await browser.newPage({viewport:{width:320,height:820}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(require('./playlist-fixture.cjs'));

  await page.goto('http://127.0.0.1:1420/mobile.html');
  await navigation.library(page,'Playlists');
  const panel=page.getByRole('region',{name:/Playlists locais|Detalhes da playlist/}),library=page.getByRole('region',{name:'Biblioteca local',exact:true});
  await panel.getByText('Nenhuma playlist criada.',{exact:true}).waitFor();
  await panel.getByRole('button',{name:'Nova playlist',exact:true}).click();
  let sheet=page.getByRole('dialog',{name:'Nova playlist',exact:true});
  await sheet.getByRole('textbox',{name:'Nome da nova playlist',exact:true}).fill('Ação 日本語');
  await sheet.getByRole('button',{name:'Criar playlist',exact:true}).click();
  await panel.getByRole('heading',{name:'Ação 日本語',exact:true}).waitFor();
  assert.equal(await panel.getByRole('button',{name:'Tocar playlist',exact:true}).isDisabled(),true);
  const id=await page.evaluate(()=>history.state.playlistId);
  for(const title of ['Ação','日本語']){
   await navigation.library(page);await navigation.trackAction(page,title,`Adicionar ${title} à playlist`);
   const picker=page.getByRole('dialog',{name:'Adicionar à playlist',exact:true});
   await picker.getByRole('button',{name:'Selecionar playlist Ação 日本語',exact:true}).click();
   await picker.getByRole('button',{name:'Adicionar música selecionada',exact:true}).click();
   await picker.waitFor({state:'hidden'});await page.getByRole('status').filter({hasText:'Música adicionada a'}).waitFor();
   assert.equal(await page.evaluate(()=>history.state.playlistId),null,'picker leaves its origin unchanged');
  }
  await navigation.library(page,'Playlists');await panel.getByRole('button',{name:'Abrir playlist Ação 日本語',exact:true}).click();
  await panel.locator('.playlist-detail li').nth(1).waitFor();
  await navigation.library(page);await navigation.trackAction(page,'Ação','Adicionar Ação à playlist');
  const picker=page.getByRole('dialog',{name:'Adicionar à playlist',exact:true});
  await picker.getByRole('button',{name:'Selecionar playlist Ação 日本語',exact:true}).click();
  await picker.getByText('Esta música já está nesta playlist.',{exact:true}).waitFor();
  assert.equal(await picker.getByRole('button',{name:'Adicionar música selecionada',exact:true}).isDisabled(),true);
  await picker.getByRole('button',{name:'Cancelar seleção da música',exact:true}).click();await picker.waitFor({state:'hidden'});
  await navigation.library(page,'Playlists');await panel.getByRole('button',{name:'Abrir playlist Ação 日本語',exact:true}).click();
  await navigation.playlistTrackAction(page,'日本語','Subir 日本語 na playlist');
  await page.waitForFunction(()=>document.querySelector('.playlist-detail li strong')?.textContent==='日本語');
  await navigation.playlistMenu(page,'Renomear playlist');sheet=page.getByRole('dialog',{name:'Renomear playlist',exact:true});
  await sheet.getByRole('textbox',{name:'Renomear playlist',exact:true}).fill('Minha seleção');await sheet.getByRole('button',{name:'Salvar nome',exact:true}).click();
  await panel.getByRole('heading',{name:'Minha seleção',exact:true}).waitFor();
  await page.reload();await panel.getByRole('heading',{name:'Minha seleção',exact:true}).waitFor();
  assert.equal(await page.evaluate(()=>history.state.playlistId),id);
  assert.equal(await panel.locator('.playlist-detail li strong').first().textContent(),'日本語');
  await panel.getByRole('button',{name:'Tocar playlist',exact:true}).click();await navigation.queueCount(page,2).waitFor();await navigation.trackTitle(page,'日本語').waitFor();
  await panel.getByRole('button',{name:'Adicionar playlist à fila',exact:true}).click();await navigation.queueCount(page,4).waitFor();
  await page.evaluate(()=>{window.unavailable=true;});await panel.getByRole('button',{name:'Tocar playlist',exact:true}).click();await panel.getByRole('alert').filter({hasText:'Arquivo indisponível'}).waitFor();assert.equal(await navigation.queueCount(page,4).isVisible(),true);
  await page.evaluate(()=>{window.unavailable=false;window.forceConflict=true;});await navigation.playlistMenu(page,'Renomear playlist');
  sheet=page.getByRole('dialog',{name:'Renomear playlist',exact:true});await sheet.getByRole('textbox',{name:'Renomear playlist',exact:true}).fill('Não deve salvar');await sheet.getByRole('button',{name:'Salvar nome',exact:true}).click();
  await panel.getByRole('alert').filter({hasText:'A playlist ou biblioteca mudou'}).waitFor();
  await page.evaluate(()=>{window.forceConflict=false;});await panel.getByRole('button',{name:'Recarregar playlists',exact:true}).click();
  await navigation.playlistTrackAction(page,'Ação','Remover Ação da playlist');await page.waitForFunction(()=>document.querySelectorAll('.playlist-detail li').length===1);assert.equal(await navigation.queueCount(page,4).isVisible(),true);
  await page.evaluate(()=>{window.invalidPlaylists=true;});await navigation.library(page,'Playlists');await panel.getByRole('alert').filter({hasText:'Resposta inválida'}).waitFor();
  await page.evaluate(()=>{window.invalidPlaylists=false;});await panel.getByRole('button',{name:'Recarregar playlists',exact:true}).click();await panel.getByRole('button',{name:'Abrir playlist Minha seleção',exact:true}).click();
  await navigation.playlistMenu(page,'Excluir playlist');sheet=page.getByRole('dialog',{name:'Excluir playlist',exact:true});await sheet.getByRole('button',{name:'Cancelar exclusão',exact:true}).click();await sheet.waitFor({state:'hidden'});assert.equal(await panel.getByRole('heading',{name:'Minha seleção',exact:true}).isVisible(),true);
  await navigation.playlistMenu(page,'Excluir playlist');sheet=page.getByRole('dialog',{name:'Excluir playlist',exact:true});await sheet.getByRole('button',{name:'Confirmar exclusão',exact:true}).click();await panel.getByText('Nenhuma playlist criada.',{exact:true}).waitFor();assert.equal(await navigation.queueCount(page,4).isVisible(),true);
  await navigation.library(page);await library.getByText('2 música(s) nesta consulta.',{exact:true}).waitFor();assert.equal(await library.locator('.library-tracks>li').count(),2);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);assert.deepEqual(errors,[]);await page.close();
  console.log('PASS mobile playlists list/detail/create, contextual add/deduplicate, reorder, rename, reload, play/enqueue, unavailable files, conflicts, invalid replies and safe deletion');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
