/** Home UI with an explicit simulated native bridge. Persistent order/migration/backup are verified in Kotlin. */
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
const {createRequire}=require('node:module');const {chromium}=createRequire(path.resolve(__dirname,'../../doomvault/package.json'))('playwright');
const navigation=require('./navigation-helpers.cjs');
(async()=>{
 const browser=await chromium.launch({...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{}),args:['--no-sandbox']});
 try{
  const page=await browser.newPage({viewport:{width:380,height:844}}),errors=[],requests=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>requests.push(r.url()));
  await page.addInitScript(()=>{
   window.commands=[];window.badHome=false;window.failHome=false;window.delayHome=false;window.cancelImport=false;window.importMode='new';
   window.homeStore=Array.from({length:8},(_,i)=>({id:'file-'+i,title:['Depois do Sol','Vento Lento','Maré Alta','Raízes','Sinais','Horizonte','Folhas de Ontem','Caminho Aberto'][i],artist:['Aurora Norte','Céu Claro','Lume'][i%3],album:'Paisagens',year:'2024',duration:200000,favorite:i<2,cover:null}));
   window.addedIds=window.homeStore.map(t=>t.id);
   const player={title:'Depois do Sol',hasTrack:true,playing:false,loading:false,position:42000,duration:200000,failed:false,queue:[{id:'entry-current',title:'Depois do Sol'}],index:0,shuffle:false,repeat:0,canNext:false,canPrevious:false};window.player=player;
   let playlistTracks=[],playlistRevision=0;const plist=()=>({id:'destination',name:'Estrada',revision:playlistRevision,count:playlistTracks.length});
   const home=()=>{const favorites=window.homeStore.filter(t=>t.favorite),recent=window.addedIds.slice().reverse().map(id=>window.homeStore.find(t=>t.id===id)).filter(Boolean);return JSON.parse(JSON.stringify({total:window.homeStore.length,recentTotal:recent.length,favoriteTotal:favorites.length,recent:recent.slice(0,6),favorites:favorites.slice(0,6)}));};
   const pageResult=()=>({items:window.homeStore.slice(0,50),total:window.homeStore.length,page:0,pageSize:50,artists:['Aurora Norte','Céu Claro','Lume'],albums:[]});
   window.__TAURI__={core:{invoke:async(name,args)=>{
    const cmd=name.split('|')[1];window.commands.push({cmd,args});
    if(cmd==='library_list'&&args?.home){
     if(window.failHome)throw Error('Não foi possível carregar seu início.');
     if(window.badHome)return {...home(),recent:[null]};
     const reply=home();if(window.delayHome)return new Promise(resolve=>{window.releaseHome=()=>resolve(reply);});return reply;
    }
    if(cmd==='library_list')return pageResult();
    if(cmd==='library_favorite'){window.homeStore.find(t=>t.id===args.id).favorite=args.favorite;return {updated:true};}
    if(cmd==='library_forget'){window.homeStore=window.homeStore.filter(t=>t.id!==args.id);window.addedIds=window.addedIds.filter(id=>id!==args.id);return {removed:true};}
    if(cmd==='import_library'){
     if(window.cancelImport)return {cancelled:true};
     if(window.importMode==='new'){const t={id:'new-file',title:'Nova música',artist:'Lume',album:'Paisagens',year:'2026',duration:200000,favorite:false,cover:null};if(!window.homeStore.some(v=>v.id===t.id)){window.homeStore.push(t);window.addedIds.push(t.id);}}
     else window.homeStore.find(t=>t.id==='file-0').title='Depois do Sol atualizado';return {...pageResult(),imported:1};
    }
    if(cmd==='track_details')return {id:args.id,artist:'Aurora Norte',album:'Paisagens',cover:null};
    if(cmd==='albums')return {items:[],total:0,page:0,pageSize:50,artists:[]};
    if(cmd==='playlists'){
     const r=args.request;if(r.action==='add'){playlistTracks.push(window.homeStore.find(t=>t.id===r.trackId));playlistRevision++;}
     return {playlists:[plist()],selected:r.id==='destination'?{...plist(),tracks:playlistTracks}:null};
    }
    if(cmd==='play')player.playing=true;if(cmd==='pause')player.playing=false;
    if(cmd==='library_play'){const t=window.homeStore.find(t=>t.id===args.id);player.title=t.title;player.queue=[{id:'entry-'+t.id,title:t.title}];player.position=0;player.playing=true;}
    if(cmd==='library_enqueue'){const t=window.homeStore.find(t=>t.id===args.id);player.queue.push({id:'entry-'+t.id,title:t.title});}
    return {...player,queue:player.queue.slice()};
   }}};
  });
  await page.goto('http://127.0.0.1:1420/mobile.html');const home=page.getByRole('region',{name:'Início',exact:true});await home.getByText('8 músicas na sua biblioteca',{exact:true}).waitFor();await home.getByRole('button',{name:'Continuar',exact:true}).waitFor();
  const recent=home.getByRole('region',{name:'Adicionadas recentemente',exact:true}),favorites=home.getByRole('region',{name:'Suas favoritas',exact:true});
  assert.equal(await recent.locator('.home-card-list>li').count(),6);assert.equal(await recent.locator('.home-card-main strong').first().textContent(),'Caminho Aberto');assert.equal(await favorites.locator('.home-card-list>li').count(),2);
  assert.equal(await page.evaluate(()=>window.commands.some(c=>['play','seek','choose','library_play','library_enqueue'].includes(c.cmd))),false,'home must not autoplay');
  const initialCalls=await page.evaluate(()=>window.commands.filter(c=>c.cmd==='library_list'&&c.args.home).length);await page.waitForFunction(()=>window.commands.filter(c=>c.cmd==='snapshot').length>=3);assert.equal(await page.evaluate(()=>window.commands.filter(c=>c.cmd==='library_list'&&c.args.home).length),initialCalls,'progress polling does not reload the home catalog');
  if(process.env.BZTUNE_CAPTURE_DIR){fs.mkdirSync(process.env.BZTUNE_CAPTURE_DIR,{recursive:true});await page.mouse.click(10,10);await page.screenshot({animations:'disabled',path:path.join(process.env.BZTUNE_CAPTURE_DIR,'inicio.png')});}
  await home.getByRole('button',{name:'Continuar',exact:true}).click();await home.getByRole('button',{name:'Abrir player',exact:true}).waitFor();assert.equal(await page.evaluate(()=>window.player.position),42000);assert.equal(await page.evaluate(()=>window.commands.some(c=>c.cmd==='seek')),false);
  await recent.getByRole('button',{name:'Tocar Caminho Aberto em recentes',exact:true}).click();await navigation.trackTitle(page,'Caminho Aberto').waitFor();assert.equal(await page.evaluate(()=>window.commands.filter(c=>c.cmd==='library_play').at(-1).args.id),'file-7');
  await recent.getByRole('button',{name:'Opções de Caminho Aberto em recentes',exact:true}).click();let sheet=page.getByRole('dialog',{name:'Caminho Aberto',exact:true});await sheet.getByRole('button',{name:'Adicionar à playlist',exact:true}).click();
  const picker=page.getByRole('dialog',{name:'Adicionar à playlist',exact:true});await picker.getByRole('button',{name:'Selecionar playlist Estrada',exact:true}).click();await picker.getByRole('button',{name:'Adicionar música selecionada',exact:true}).click();await picker.waitFor({state:'hidden'});assert.equal(await page.evaluate(()=>history.state.screen),'home');assert.equal(await page.evaluate(()=>window.player.queue.length),1);
  await recent.getByRole('button',{name:'Opções de Caminho Aberto em recentes',exact:true}).click();await sheet.getByRole('button',{name:'Marcar como favorita',exact:true}).click();await favorites.getByRole('button',{name:'Tocar Caminho Aberto em favoritas',exact:true}).waitFor();
  await recent.getByRole('button',{name:'Opções de Caminho Aberto em recentes',exact:true}).click();await sheet.getByRole('button',{name:'Remover da biblioteca',exact:true}).click();await home.getByText('7 músicas na sua biblioteca',{exact:true}).waitFor();assert.equal(await recent.getByRole('button',{name:'Tocar Caminho Aberto em recentes',exact:true}).count(),0);assert.equal(await navigation.trackTitle(page,'Caminho Aberto').isVisible(),true);
  await home.getByRole('button',{name:'Importar músicas',exact:true}).click();await recent.getByRole('button',{name:'Tocar Nova música em recentes',exact:true}).waitFor();assert.equal(await recent.locator('.home-card-main strong').first().textContent(),'Nova música');
  await page.evaluate(()=>{window.importMode='reimport';});await home.getByRole('button',{name:'Importar músicas',exact:true}).click();await favorites.getByRole('button',{name:'Tocar Depois do Sol atualizado em favoritas',exact:true}).waitFor();assert.equal(await recent.locator('.home-card-main strong').first().textContent(),'Nova música');
  await page.evaluate(()=>{window.cancelImport=true;});await home.getByRole('button',{name:'Importar músicas',exact:true}).click();await home.getByText('8 músicas na sua biblioteca',{exact:true}).waitFor();
  await navigation.nav(page,'Ajustes');await page.evaluate(()=>{window.badHome=true;});await navigation.nav(page,'Início');await home.getByRole('alert').filter({hasText:'Resposta inválida'}).waitFor();assert.equal(await recent.locator('.home-card-list>li').count(),6);await page.evaluate(()=>{window.badHome=false;window.failHome=true;});await home.getByRole('button',{name:'Recarregar início',exact:true}).click();await home.getByRole('alert').filter({hasText:'Não foi possível carregar'}).waitFor();await page.evaluate(()=>{window.failHome=false;});await home.getByRole('button',{name:'Recarregar início',exact:true}).click();await home.getByRole('alert').waitFor({state:'hidden'});
  await navigation.nav(page,'Ajustes');await page.evaluate(()=>{window.delayHome=true;});await navigation.nav(page,'Início');await page.waitForFunction(()=>typeof window.releaseHome==='function');await navigation.nav(page,'Ajustes');await page.evaluate(()=>{window.homeStore=[];window.addedIds=[];window.player.hasTrack=false;window.player.queue=[];window.player.index=-1;window.player.title='Escolha uma música';window.releaseHome();window.delayHome=false;});await navigation.nav(page,'Início');await home.getByRole('heading',{name:'Sua música começa aqui',exact:true}).waitFor();assert.equal(await recent.count(),0);await page.waitForFunction(()=>document.querySelector('.mini-player').hidden);
  if(process.env.BZTUNE_CAPTURE_DIR)await page.screenshot({animations:'disabled',path:path.join(process.env.BZTUNE_CAPTURE_DIR,'inicio-vazio.png')});
  await navigation.nav(page,'Ajustes');await page.evaluate(()=>{window.homeStore=[{id:'old',title:'Anterior',artist:'Artista',album:'Disco',year:'2000',duration:120000,favorite:false,cover:null}];window.addedIds=[];});await navigation.nav(page,'Início');await home.getByText('1 música na sua biblioteca',{exact:true}).waitFor();await recent.getByText('Novas músicas importadas aparecerão aqui.',{exact:false}).waitFor();assert.equal(await recent.locator('.home-card-list>li').count(),0,'legacy catalog has no fabricated recency');
  await page.setViewportSize({width:320,height:568});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);assert.equal(requests.some(u=>/^https?:/.test(u)&&!u.includes('127.0.0.1:1420')),false);assert.deepEqual(errors,[]);
  console.log('PASS home native summary bounds/order, resume without seek, explicit play, contextual playlist/favorite/forget, import/reimport/cancel, no progress refetch, errors/stale replies, empty/legacy catalog, narrow screen and offline isolation');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
