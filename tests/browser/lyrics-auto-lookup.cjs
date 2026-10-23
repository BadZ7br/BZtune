/** Automatic recovery from exact LRCLIB lookup failures, without opening options. */
const assert=require('node:assert/strict'),path=require('node:path');
const {createRequire}=require('node:module');
const {chromium}=createRequire(path.resolve(__dirname,'../../doomvault/package.json'))('playwright');
const API='http://127.0.0.1:5000',BASE=process.env.BZTUNE_BASE_URL||'http://127.0.0.1:5173';
const remaster={source:'LRCLIB',id:102,trackName:'Black Sabbath (2009 - Remaster)',artistName:'Black Sabbath',albumName:'Compilation',duration:381,syncedLyrics:'',plainLyrics:'Automatically recovered words',instrumental:false};
async function fixture(browser,{candidates=[remaster],holdReady=false,holdSearch=false,limitedEndpoint=null,storedLyrics=null,manualLyrics=null,track={title:"Black Sabbath",artist:"Black Sabbath",album:"Black Sabbath"}}={}){
 const page=await browser.newPage({viewport:{width:1360,height:870}}),errors=[],exact=[],search=[],cancellations=[];
 page.on('pageerror',e=>errors.push(e.message));let releaseSearch;
 await page.addInitScript(({holdReady,track,storedLyrics,manualLyrics})=>{
  localStorage.clear();localStorage.setItem('bztune-settings-v1',JSON.stringify({startPage:'home',autoUpdates:false}));
  localStorage.setItem('doomvault-player-state-v11',JSON.stringify({tracks:[
   {videoId:'abcdefghijk',...track},
   {videoId:'lmnopqrstuv',title:'Second',artist:'Artist'}],index:0,shuffle:false,repeat:'off'}));
  localStorage.setItem('doomvault-lrc-v11:lmnopqrstuv','[00:01]Second manual');window.holdLyricsReady=holdReady;
  if(storedLyrics){localStorage.setItem('bztune-lyrics-v1:abcdefghijk',JSON.stringify(storedLyrics));localStorage.setItem('bztune-lyrics-source-v1:abcdefghijk','lrclib');}
  if(manualLyrics)localStorage.setItem('doomvault-lrc-v11:abcdefghijk',manualLyrics);
 },{holdReady,track,storedLyrics,manualLyrics});
 await page.route('https://fonts.googleapis.com/**',r=>r.abort());
 await page.route('https://www.youtube.com/iframe_api',r=>r.fulfill({contentType:'application/javascript',body:`window.YT={Player:class{
 constructor(el,options){window.fireLyricsReady=()=>options.events.onReady({target:this});if(!window.holdLyricsReady)setTimeout(window.fireLyricsReady,100)}
 setVolume(){}playVideo(){}pauseVideo(){}destroy(){}seekTo(){}getCurrentTime(){return 0}getDuration(){return 381}
 }};window.onYouTubeIframeAPIReady();`}));
 await page.route(API+'/**',async r=>{
  const u=new URL(r.request().url());let json={};
  if(u.pathname.startsWith('/api/lyrics/cancel/')){if(r.request().method()==='POST')cancellations.push(u.pathname.split('/').pop());return r.fulfill({status:204});}
  if(u.pathname==='/api/lyrics'){
   exact.push(Object.fromEntries(u.searchParams));
   if(limitedEndpoint==='exact'&&exact.length===1)return r.fulfill({status:429,headers:{'Retry-After':'120'},json:{code:'LRCLIB_RATE_LIMITED',retry_after_seconds:120}});
   return r.fulfill({status:502,json:{error:'O LRCLIB está indisponível. Tente novamente mais tarde.'}});
  }
  if(u.pathname==='/api/lyrics/search'){
   search.push(Object.fromEntries(u.searchParams));
   if(limitedEndpoint==='search'&&search.length===1)return r.fulfill({status:429,headers:{'Retry-After':'120'},json:{code:'LRCLIB_RATE_LIMITED',retry_after_seconds:120}});
   if(holdSearch)await new Promise(resolve=>releaseSearch=resolve);
   json={candidates};
  }else if(u.pathname==='/api/library/tracks')json={tracks:[]};else if(u.pathname==='/api/library/albums')json={albums:[]};else if(u.pathname==='/api/playlists')json={playlists:[]};else if(u.pathname==='/api/genres/index')json={genres:[]};else if(u.pathname.includes('/stats/summary'))json={totals:{},artists:[],tracks:[],albums:[],daily:[],history:[]};else if(u.pathname.includes('/stats/wrapped'))json={topArtists:[],months:[]};else if(u.pathname.includes('/maintenance/diagnostics'))json={packages:{},ffmpeg:{}};else if(u.pathname.includes('/discovery/recommendations'))json={songs:[],albums:[],artists:[]};
  try{await r.fulfill({json})}catch{/* request cancelled by a newer user action */}
 });
 await page.goto(BASE);try{await page.getByRole('button',{name:'Expandir player',exact:true}).click({timeout:10000});await page.getByRole('button',{name:'Fila',exact:true}).click()}catch(error){console.log('Page errors:',errors,'Body:',(await page.locator('body').innerText()).slice(0,1800));throw error}
 return {page,errors,exact,search,cancellations,release:()=>releaseSearch?.(),pending:()=>!!releaseSearch,panel:page.getByRole('region',{name:'Letras da música'})};
}
(async()=>{const browser=await chromium.launch({...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{}),args:['--no-sandbox']});try{
 // Exact endpoint fails just like the reported screenshot; a compatible remaster recovers automatically.
 let f=await fixture(browser);
 await f.panel.getByRole('region',{name:'Texto da letra'}).getByText(remaster.plainLyrics,{exact:true}).waitFor();
 assert.equal(f.exact.length,1);assert.equal(f.exact[0].duration,'381');assert.equal(f.search.length,1);
 assert.equal(await f.panel.locator('details').evaluate(el=>el.open),false);
 assert.equal(await f.page.evaluate(()=>JSON.parse(localStorage.getItem('bztune-lyrics-v1:abcdefghijk')).id),102);
 await f.page.waitForTimeout(300);assert.equal(f.exact.length,1);assert.deepEqual(f.errors,[]);await f.page.close();console.log('Automatic lookup scenario passed.');
 // A rate limit in either endpoint stops requests, preserves manual lyrics and allows a later retry.
 for(const limitedEndpoint of ['exact','search']){
  f=await fixture(browser,{limitedEndpoint});
  await f.panel.locator('p[role=status]').filter({hasText:/limitou.*120 segundos/}).waitFor();
  assert.equal(f.exact.length,1);assert.equal(f.search.length,limitedEndpoint==='search'?1:0);
  await f.panel.locator('input[type=file]').setInputFiles({name:'manual.lrc',mimeType:'text/plain',buffer:Buffer.from('[00:01]Manual during rate limit')});
  await f.panel.getByText('Manual during rate limit',{exact:true}).waitFor();
  await f.panel.getByLabel('Opções da letra',{exact:true}).click();
  await f.panel.getByRole('button',{name:'Buscar no LRCLIB',exact:true}).click();
  await f.panel.locator('p[role=status]').filter({hasText:'limitou'}).waitFor();
  await f.panel.getByRole('button',{name:'Escolher versão no LRCLIB',exact:true}).click();
  await f.panel.locator('p[role=status]').filter({hasText:'limitou'}).waitFor();
  assert.equal(f.exact.length,1);assert.equal(f.search.length,limitedEndpoint==='search'?1:0);
  await f.panel.getByText('Manual during rate limit',{exact:true}).waitFor();
  // Advance only Date.now used by the cooldown; media/timer behavior is unchanged.
  await f.page.evaluate(()=>{const now=Date.now;Date.now=()=>now()+121000});
  await f.panel.getByLabel('Opções da letra',{exact:true}).click();
  await f.panel.getByRole('button',{name:'Buscar no LRCLIB',exact:true}).click();
  await f.panel.getByRole('region',{name:'Texto da letra'}).getByText(remaster.plainLyrics,{exact:true}).waitFor();
  assert.equal(f.exact.length,2);assert.equal(f.search.length,limitedEndpoint==='search'?2:1);
  assert.equal(await f.page.evaluate(()=>localStorage.getItem('doomvault-lrc-v11:abcdefghijk')),'[00:01]Manual during rate limit');
  assert.deepEqual(f.errors,[]);await f.page.close();console.log('Rate limit in '+limitedEndpoint+' pauses both lookups, preserves manual lyrics and recovers after deadline.');
 }
 // Empty and unusable historical caches cannot suppress automatic recovery.
 const cacheBase={source:'LRCLIB',instrumental:false,syncedLyrics:'',plainLyrics:''};
 for(const extra of [{},{plainLyrics:' \n\t'},{syncedLyrics:'[ar:Artist]\n[ti:Song]'},{syncedLyrics:'[00:99]Invalid'},{syncedLyrics:'[00:01]'}]){
  f=await fixture(browser,{storedLyrics:{...cacheBase,...extra}});
  await f.panel.getByRole('region',{name:'Texto da letra'}).getByText(remaster.plainLyrics,{exact:true}).waitFor();
  assert.equal(f.exact.length,1);assert.equal(f.search.length,1);
  assert.equal(await f.page.evaluate(()=>JSON.parse(localStorage.getItem('bztune-lyrics-v1:abcdefghijk')).id),102);
  assert.deepEqual(f.errors,[]);await f.page.close();
 }
 // Usable caches (including instrumentals) and imported LRC remain available without network queries.
 for(const extra of [{plainLyrics:'Cached plain words'},{syncedLyrics:'[00:01]Cached synced verse'},{instrumental:true},null]){
  f=await fixture(browser,{storedLyrics:{...cacheBase,...extra},manualLyrics:extra===null?'[00:01]Preserved manual verse':null});
  const expected=extra===null?'Preserved manual verse':extra.instrumental?'Faixa instrumental segundo o LRCLIB.':extra.plainLyrics||'Cached synced verse';
  await f.panel.getByText(expected,{exact:true}).waitFor();
  await f.page.waitForTimeout(400);
  assert.equal(f.exact.length,0);assert.equal(f.search.length,0);
  assert.deepEqual(f.errors,[]);await f.page.close();
 }
 console.log('Invalid caches recover automatically; valid caches, instrumentals and imported LRC stay offline.');
 // A live variant or an incompatible duration is offered directly, never silently substituted.
 f=await fixture(browser,{candidates:[{...remaster,id:103,albumName:'Live at London'},{...remaster,id:104,duration:400}]});
 await f.panel.getByRole('region',{name:'Versões da letra'}).waitFor();
 assert.equal(await f.panel.getByRole('region',{name:'Texto da letra'}).getByText(remaster.plainLyrics,{exact:true}).count(),0);
 assert.equal(await f.page.evaluate(()=>localStorage.getItem('bztune-lyrics-v1:abcdefghijk')),null);
 assert.equal(await f.panel.locator('details').evaluate(el=>el.open),false);assert.deepEqual(f.errors,[]);await f.page.close();console.log('Automatic lookup scenario passed.');
 // Conflicting live recordings remain manual, including a song whose actual title contains Live.
 for(const [title,albumName] of [['Live Forever','Live at Wembley'],['Canção','Ao Vivo']]){
  f=await fixture(browser,{track:{title,artist:'Artist',album:'Studio'},candidates:[{...remaster,trackName:title,artistName:'Artist',albumName}]});
  const choices=f.panel.getByRole('region',{name:'Versões da letra'});
  await choices.waitFor();
  assert.equal(await f.page.evaluate(()=>localStorage.getItem('bztune-lyrics-v1:abcdefghijk')),null);
  assert.equal(await f.panel.getByRole('region',{name:'Texto da letra'}).getByText(remaster.plainLyrics,{exact:true}).count(),0);
  await choices.getByRole('button').filter({hasText:albumName}).click();
  await f.panel.getByRole('region',{name:'Texto da letra'}).getByText(remaster.plainLyrics,{exact:true}).waitFor();
  assert.equal(await f.page.evaluate(()=>JSON.parse(localStorage.getItem('bztune-lyrics-v1:abcdefghijk')).albumName),albumName);
  assert.deepEqual(f.errors,[]);await f.page.close();console.log('Studio/live conflict requires manual selection: '+title);
 }
 // Unknown duration stays available manually and is cached without inventing a duration.
 f=await fixture(browser,{candidates:[{...remaster,duration:null}]});
 const versions=f.panel.getByRole('region',{name:'Versões da letra'});
 await versions.getByText('Duração indisponível',{exact:false}).waitFor();
 assert.equal(await f.page.evaluate(()=>localStorage.getItem('bztune-lyrics-v1:abcdefghijk')),null);
 assert.equal(await f.panel.getByRole('region',{name:'Texto da letra'}).getByText(remaster.plainLyrics,{exact:true}).count(),0);
 await versions.getByRole('button',{name:/Black Sabbath.*Compilation/}).click();
 await f.panel.getByRole('region',{name:'Texto da letra'}).getByText(remaster.plainLyrics,{exact:true}).waitFor();
 assert.equal(await f.page.evaluate(()=>JSON.parse(localStorage.getItem('bztune-lyrics-v1:abcdefghijk')).duration),null);
 // A→B→A must restore the selected null-duration recording without another network lookup.
 await f.page.locator('.bz32-queue-name[title="Tocar Second"]').click();
 await f.panel.getByText('Second manual',{exact:true}).waitFor();
 await f.page.locator('.bz32-queue-name[title="Tocar Black Sabbath"]').click();
 await f.panel.getByRole('region',{name:'Texto da letra'}).getByText(remaster.plainLyrics,{exact:true}).waitFor();
 assert.equal(f.exact.length,1);assert.equal(f.search.length,1);
 assert.deepEqual(f.errors,[]);await f.page.close();console.log('Unknown-duration manual selection and cache scenario passed.');
 // Metadata can arrive after the initial timeout and while the fallback request is pending.
 f=await fixture(browser,{holdReady:true,holdSearch:true});
 for(let i=0;i<200&&!f.pending();i++)await f.page.waitForTimeout(20);
 assert.ok(f.pending());assert.equal(f.exact[0].duration,undefined);
 await f.page.evaluate(()=>window.fireLyricsReady());
 await f.page.waitForFunction(()=>!document.querySelector('.bz32-main-play').disabled);await f.page.waitForTimeout(150);
 f.release();await f.panel.getByRole('region',{name:'Texto da letra'}).getByText(remaster.plainLyrics,{exact:true}).waitFor();
 assert.equal(f.exact.length,1);assert.deepEqual(f.errors,[]);await f.page.close();console.log('Automatic lookup scenario passed.');
 // A completed fallback must reconsider its existing candidates when metadata arrives later.
 f=await fixture(browser,{holdReady:true});
 await f.panel.getByRole('region',{name:'Versões da letra'}).waitFor();
 assert.equal(f.exact[0].duration,undefined);
 assert.equal(await f.page.evaluate(()=>localStorage.getItem('bztune-lyrics-v1:abcdefghijk')),null);
 await f.page.evaluate(()=>window.fireLyricsReady());
 await f.panel.getByRole('region',{name:'Texto da letra'}).getByText(remaster.plainLyrics,{exact:true}).waitFor();
 assert.equal(await f.panel.getByRole('region',{name:'Versões da letra'}).count(),0);
 assert.equal(await f.page.evaluate(()=>JSON.parse(localStorage.getItem('bztune-lyrics-v1:abcdefghijk')).id),102);
 assert.equal(f.exact.length,1);assert.equal(f.search.length,1);
 assert.deepEqual(f.errors,[]);await f.page.close();console.log('Completed fallback recovered after late metadata without another request.');
 // Metadata must not override newer user actions or silently select uncertain recordings.
 for(const action of ['import','select','dismiss','manual-list','change-track','incompatible','unknown-duration']){
  const candidates=action==='incompatible'?[{...remaster,albumName:'Ao Vivo'}]:action==='unknown-duration'?[{...remaster,duration:null}]:[remaster,{...remaster,id:103,albumName:'Other',plainLyrics:'Manually selected words'}];
  f=await fixture(browser,{holdReady:true,candidates});
  const choices=f.panel.getByRole('region',{name:'Versões da letra'});
  await choices.waitFor();
  let expected;
  if(action==='import'){
   await f.panel.locator('input[type=file]').setInputFiles({name:'manual.lrc',mimeType:'text/plain',buffer:Buffer.from('[00:01]New manual words')});
   expected='New manual words';await f.panel.getByText(expected,{exact:true}).waitFor();
  }else if(action==='select'){
   await choices.getByRole('button').filter({hasText:'Other'}).click();expected='Manually selected words';
   await f.panel.getByText(expected,{exact:true}).waitFor();
  }else if(action==='dismiss')await choices.getByRole('button',{name:'Fechar',exact:true}).click();
  else if(action==='manual-list'){
   await f.panel.locator('summary').click();
   await f.panel.getByRole('button',{name:'Escolher versão no LRCLIB',exact:true}).click();
   await choices.waitFor();
  }else if(action==='change-track'){
   await f.page.locator('.bz32-queue-name[title="Tocar Second"]').click();expected='Second manual';
   await f.panel.getByText(expected,{exact:true}).waitFor();
  }
  await f.page.evaluate(()=>window.fireLyricsReady());
  await f.page.waitForFunction(()=>!document.querySelector('.bz32-main-play').disabled);
  await f.page.waitForTimeout(250);
  if(expected)await f.panel.getByText(expected,{exact:true}).waitFor();
  if(action!=='select')assert.equal(await f.page.evaluate(()=>localStorage.getItem('bztune-lyrics-v1:abcdefghijk')),null,action);
  else assert.equal(await f.page.evaluate(()=>JSON.parse(localStorage.getItem('bztune-lyrics-v1:abcdefghijk')).id),103);
  if(['manual-list','incompatible','unknown-duration'].includes(action))assert.equal(await choices.count(),1,action);
  assert.equal(f.exact.length,1,action);assert.equal(f.search.length,action==='manual-list'?2:1,action);
  assert.deepEqual(f.errors,[]);await f.page.close();console.log('Late metadata respects '+action+'.');
 }
 // A newer manual import suppresses the scheduled automatic operation, even once metadata appears.
 f=await fixture(browser,{holdReady:true});
 await f.panel.locator('input[type=file]').setInputFiles({name:'manual.lrc',mimeType:'text/plain',buffer:Buffer.from('[00:01]User manual words')});
 await f.panel.getByText('User manual words',{exact:true}).waitFor();await f.page.evaluate(()=>window.fireLyricsReady());
 await f.page.waitForTimeout(2200);assert.equal(f.exact.length,0);assert.equal(f.search.length,0);
 assert.deepEqual(f.errors,[]);await f.page.close();console.log('Automatic lookup scenario passed.');
 // A pending fallback may not write lyrics or cache for a track that is no longer current.
 f=await fixture(browser,{holdSearch:true});
 for(let i=0;i<200&&!f.pending();i++)await f.page.waitForTimeout(20);
 assert.ok(f.pending());await f.page.locator('.bz32-queue-name[title="Tocar Second"]').click();
 await f.panel.getByText('Second manual',{exact:true}).waitFor();f.release();await f.page.waitForTimeout(200);
 assert.deepEqual(f.cancellations,[f.search[0].request_id]);
 assert.equal(await f.page.evaluate(()=>localStorage.getItem('bztune-lyrics-v1:abcdefghijk')),null);
 assert.equal(await f.panel.getByRole('region',{name:'Versões da letra'}).count(),0);assert.deepEqual(f.errors,[]);await f.page.close();console.log('Automatic lookup scenario passed.');
 console.log('OK: automatic exact-failure recovery; remaster matching; incompatible versions offered directly; late metadata; manual import priority; stale fallback ignored.');
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
