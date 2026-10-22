/** Invalid HTTP 200 responses must stay local and recover without restarting the player. */
const assert = require('node:assert/strict');
const path = require('node:path');
const { createRequire } = require('node:module');
const { chromium } = createRequire(path.resolve(__dirname, '../../doomvault/package.json'))('playwright');
const API='http://127.0.0.1:5000', BASE=process.env.BZTUNE_BASE_URL||'http://127.0.0.1:5173';
const album={id:'album1',title:'Álbum de Teste',artist:'Artista de Teste',year:2024,cover:null,release_type:'album'};
const online={videoId:'abcdefghijk',title:'Faixa de Teste',artist:album.artist,album:album.title};
const local={id:'local1',title:'Faixa Local',artist:album.artist,filename:'teste.mp3',bytes:3000,mime:'audio/mpeg',audioUrl:'/audio/local1',album:album.title,albumId:'local-album',coverUrl:null};
const list={id:'playlist1',name:'Playlist de Teste',description:'Descrição',created_at:'2026-01-01',count:1,coverUrl:null,tracks:[{id:'entry1',source:'web',...online}]};
const summary={totals:{seconds:120,plays:2,tracks:1,artists:1},artists:[{name:album.artist,seconds:120}],tracks:[{id:'t1',title:online.title,artist:album.artist,seconds:120}],albums:[],daily:[{day:'2026-10-01',seconds:120}],history:[],thresholdSeconds:30};
const payload={query:'teste',results:{artists:[{id:'artist1',name:album.artist,image:null}],albums:[album],songs:[{id:online.videoId,title:online.title,artist:online.artist,album:online.album,cover:null,duration:'2:00',duration_seconds:120}]}};
async function fixture(browser,{tab='home',width=1360,height=870,theme='dark',override=null,seed={},trackCount=1,preserveStorageOnReload=false}={}){
 const page=await browser.newPage({viewport:{width,height},acceptDownloads:true});page.setDefaultTimeout(7000);const errors=[],logs=[],requests=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')logs.push(m.text().slice(0,350))});
 await page.addInitScript(({tab,theme,album,online,seed,preserveStorageOnReload})=>{
  if(preserveStorageOnReload && sessionStorage.getItem("bztune-fixture-seeded"))return;
  sessionStorage.setItem("bztune-fixture-seeded","true");
  localStorage.clear();
  const data={'bztune-settings-v1':JSON.stringify({startPage:'last',theme,autoUpdates:false}), 'doomvault-last-tab':tab,'doomvault-api-albums':JSON.stringify([album]),'doomvault-favorites':JSON.stringify([album.id]),'doomvault-collection':JSON.stringify([album.id]),'doomvault-player-state-v11':JSON.stringify({tracks:[online],index:0,shuffle:false,repeat:'off'}), ...seed};
  for(const [key,value]of Object.entries(data))localStorage.setItem(key,value);
 },{tab,theme,album,online,seed,preserveStorageOnReload});
 await page.route('https://fonts.googleapis.com/**',r=>r.abort());
 await page.route('https://www.youtube.com/iframe_api',r=>r.fulfill({contentType:'application/javascript',body:`window.YT={Player:class{constructor(el,o){setTimeout(()=>o.events.onReady({target:this}),10)}setVolume(){}playVideo(){}pauseVideo(){}destroy(){}seekTo(){}getCurrentTime(){return 0}getDuration(){return 120}}};window.onYouTubeIframeAPIReady();`}));
 await page.route(API+'/**',async route=>{
  const u=new URL(route.request().url());requests.push({path:u.pathname,query:u.search,method:route.request().method()});
  try{
   if(override&&await override(route,u))return;
   if(u.pathname.includes('/cover')||u.pathname.startsWith('/audio/'))return route.fulfill({status:404,body:''});
   let data={};
   if(u.pathname==='/api/search')data={...payload,query:u.searchParams.get('q')||'teste'};
   else if(u.pathname==='/api/artists')data={results:[{id:'artist1',name:album.artist,image:null}],count:1};
   else if(u.pathname.match(/\/api\/artists\/.+\/albums/))data={albums:[album],count:1,complete:true};
   else if(u.pathname==='/api/albums')data={results:[album],count:1};
   else if(u.pathname==='/api/albums/album1')data={title:album.title,artist_id:'artist1',year:2024,tracks:[{video_id:online.videoId,title:online.title,number:1,duration:'2:00'}]};
   else if(u.pathname==='/api/library/tracks')data={tracks:Array.from({length:trackCount},(_,i)=>({...local,id:'local'+(i+1),title:'Faixa Local '+(i+1)}))};
   else if(u.pathname==='/api/library/albums')data={albums:[{id:'local-album',title:album.title,artist:album.artist,count:trackCount,coverUrl:'/cover/local',hasCover:false}]};
   else if(u.pathname==='/api/library/downloads')data={jobs:[]};
   else if(u.pathname.endsWith('/metadata/history'))data={canUndo:false};
   else if(u.pathname==='/api/library/duplicates')data={groups:[],scanned:trackCount};
   else if(u.pathname==='/api/playlists')data={playlists:[list]};
   else if(u.pathname==='/api/genres/index')data={genres:['Doom Metal'],count:1};
   else if(u.pathname.includes('/genres/'))data={artists:[{id:'artist1',name:album.artist}],count:1};
   else if(u.pathname.includes('/stats/summary'))data=summary;
   else if(u.pathname.includes('/stats/wrapped'))data={year:2026,seconds:120,plays:2,uniqueArtists:1,topArtists:summary.artists,months:[]};
   else if(u.pathname.includes('/maintenance/diagnostics'))data={python:'3.12',platform:'Test',packages:{httpx:true},ffmpeg:{ffmpeg:'test'},sqliteOK:true,tracks:trackCount,libraryPath:'Test Library',freeBytes:10000};
   else if(u.pathname.includes('/discovery/'))data={songs:[online],albums:[album],artists:[],note:''};
   else if(u.pathname.startsWith('/api/lyrics/cancel'))return route.fulfill({status:204});
   else if(u.pathname==='/api/lyrics')data={source:'LRCLIB',instrumental:false,syncedLyrics:'[00:01]Verso de teste\n[00:02]Outro verso',plainLyrics:'Verso de teste'};
   await route.fulfill({json:data});
  }catch(e){if(!page.isClosed())logs.push('fixture: '+e.message)}
 });
 await page.goto(BASE);await page.getByRole('button',{name:'Expandir player',exact:true}).waitFor();
 return {page,errors,logs,requests};
}
const visibleAlert = page => page.getByRole('alert').filter({visible:true});
async function healthy(page) {
 assert.equal(await page.getByText('Não foi possível exibir esta tela', {exact:true}).count(), 0);
 assert.equal(await page.getByRole('button', {name:'Expandir player',exact:true}).isVisible(), true);
}
async function navigate(page, name) {
 await page.locator('.sidebar').getByRole('button', {name,exact:true}).click();
}
module.exports = { fixture };
if (require.main === module) (async()=>{
 const browser=await chromium.launch({...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{}),args:['--no-sandbox']});
 try {
  // A malformed hidden library must not crash Home. Recover, then retain valid rows on a bad refresh.
  let bad=true;
  const library=await fixture(browser,{override:async(r,u)=>{
   if(u.pathname==='/api/library/tracks'&&bad){await r.fulfill({json:{tracks:null}});return true;}
  }});
  await healthy(library.page);await navigate(library.page,'Biblioteca');
  await visibleAlert(library.page).filter({hasText:'Resposta inválida'}).waitFor();
  bad=false;await library.page.getByRole('button',{name:'Atualizar biblioteca',exact:true}).click();
  await library.page.getByRole('button',{name:'Faixas',exact:true}).click();
  await library.page.getByRole('button',{name:'Editar metadados de Faixa Local 1',exact:true}).waitFor();
  bad=true;await library.page.getByRole('button',{name:'Atualizar biblioteca',exact:true}).click();
  await visibleAlert(library.page).filter({hasText:'Resposta inválida'}).waitFor();
  assert.equal(await library.page.getByRole('button',{name:'Editar metadados de Faixa Local 1',exact:true}).isVisible(),true);
  await healthy(library.page);assert.deepEqual(library.errors,[]);await library.page.close();
  console.log('PASS hidden library isolation, retry and last valid data');

  bad=true;
  const detail=await fixture(browser,{tab:'search',override:async(r,u)=>{
   if(u.pathname==='/api/albums/album1'&&bad){await r.fulfill({json:{title:'Broken',tracks:null}});return true;}
  }});
  await detail.page.getByRole('textbox',{name:'Pesquisar música',exact:true}).fill('teste');
  await detail.page.getByRole('button',{name:'Abrir álbum '+album.title,exact:true}).click();
  await visibleAlert(detail.page).filter({hasText:'Resposta inválida'}).waitFor();await healthy(detail.page);
  bad=false;await detail.page.getByRole('button',{name:'Tentar carregar álbum novamente',exact:true}).click();
  await detail.page.getByRole('button',{name:'Reproduzir '+online.title,exact:true}).waitFor();
  await detail.page.getByRole('button',{name:'Voltar',exact:true}).click();
  assert.equal(await detail.page.getByRole('textbox',{name:'Pesquisar música',exact:true}).inputValue(),'teste');
  assert.deepEqual(detail.errors,[]);await detail.page.close();console.log('PASS album validation, local retry and preserved search');

  bad=true;
  const playlists=await fixture(browser,{tab:'playlists',override:async(r,u)=>{
   if(u.pathname==='/api/playlists'&&bad){await r.fulfill({json:{playlists:null}});return true;}
  }});
  await visibleAlert(playlists.page).filter({hasText:'Resposta inválida'}).waitFor();await healthy(playlists.page);
  bad=false;await playlists.page.getByRole('button',{name:'Atualizar playlists',exact:true}).click();
  await playlists.page.getByRole('button',{name:/Playlist de Teste/}).first().click();
  bad=true;await playlists.page.getByRole('button',{name:'Atualizar playlists',exact:true}).click();
  await visibleAlert(playlists.page).filter({hasText:'Resposta inválida'}).waitFor();
  assert.equal(await playlists.page.getByRole('heading',{name:'Playlist de Teste',exact:true}).isVisible(),true);
  await healthy(playlists.page);assert.deepEqual(playlists.errors,[]);await playlists.page.close();
  console.log('PASS playlists validation, retry and preserved selection');

  bad=true;
  const stats=await fixture(browser,{tab:'stats',override:async(r,u)=>{
   if(u.pathname.includes('/stats/summary')&&bad){await r.fulfill({json:{}});return true;}
  }});
  await visibleAlert(stats.page).filter({hasText:'Resposta inválida'}).waitFor();await healthy(stats.page);
  bad=false;await stats.page.getByRole('button',{name:'Atualizar',exact:true}).click();
  await stats.page.locator('.bz-stats-cards').waitFor();
  const original=await stats.page.locator('.bz-stats-cards').innerText();
  bad=true;await stats.page.getByRole('button',{name:'Atualizar',exact:true}).click();
  await visibleAlert(stats.page).filter({hasText:'Resposta inválida'}).waitFor();
  assert.equal(await stats.page.locator('.bz-stats-cards').innerText(),original);
  bad=false;await stats.page.getByRole('button',{name:'Atualizar',exact:true}).click();
  await visibleAlert(stats.page).waitFor({state:'hidden'});assert.deepEqual(stats.errors,[]);await healthy(stats.page);await stats.page.close();
  console.log('PASS statistics validation, retry and preserved data');

  // An unexpected render exception goes beyond the response guard: exercise the real boundary.
  const isolated=await fixture(browser);
  await isolated.page.addScriptTag({content:`const originalToFixed=Number.prototype.toFixed;
   Number.prototype.toFixed=function(...args){if(window.failLibraryRender && this.valueOf()===3000/1048576)throw Error('Injected library render failure');return originalToFixed.apply(this,args)};window.failLibraryRender=true;`});
  await navigate(isolated.page,'Biblioteca');
  await isolated.page.getByRole('alert',{name:'Falha em Biblioteca',exact:true}).waitFor();
  await healthy(isolated.page);await navigate(isolated.page,'Início');await healthy(isolated.page);
  await isolated.page.evaluate(()=>{window.failLibraryRender=false});await navigate(isolated.page,'Biblioteca');
  await isolated.page.getByRole('button',{name:'Tentar abrir Biblioteca novamente',exact:true}).click();
  await isolated.page.getByRole('button',{name:'Faixas',exact:true}).click();
  await isolated.page.getByRole('button',{name:'Editar metadados de Faixa Local 1',exact:true}).waitFor();
  await healthy(isolated.page);
  await isolated.page.getByRole('button',{name:'Expandir player',exact:true}).click();
  assert.equal(await isolated.page.getByText(online.title,{exact:true}).filter({visible:true}).first().isVisible(),true);
  assert.equal([...isolated.errors,...isolated.logs].some(e=>e.includes('Injected library render failure')),true);
  await isolated.page.close();console.log('PASS render boundary isolation, retry and preserved player queue');
 } finally {await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
