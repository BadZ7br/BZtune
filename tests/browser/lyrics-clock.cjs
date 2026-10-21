/** Playback-clock regression using a controllable YouTube adapter and real silent WAV audio. */
const assert=require('node:assert/strict');const path=require('node:path');const{createRequire}=require('node:module');
const{chromium}=createRequire(path.resolve(__dirname,'../../doomvault/package.json'))('playwright');
const BASE=process.env.BZTUNE_BASE_URL||'http://127.0.0.1:5173',API='http://127.0.0.1:5000';
const adapter=`window.YT={Player:class {
 constructor(el,options){this.options=options;this.time=0;this.reads=0;window.clockPlayer=this;
  if(!window.holdClockReady)setTimeout(()=>options.events.onReady({target:this}),10);}
 getCurrentTime(){this.reads++;return this.time} getDuration(){return 210}
 playVideo(){this.options.events.onStateChange({data:1})} pauseVideo(){this.options.events.onStateChange({data:2})}
 seekTo(seconds){this.time=seconds} setVolume(){} destroy(){this.destroyed=true}
}};window.onYouTubeIframeAPIReady();`;
function wave(){const data=Buffer.alloc(44+8000*8*2);data.write('RIFF',0);data.writeUInt32LE(data.length-8,4);data.write('WAVEfmt ',8);data.writeUInt32LE(16,16);data.writeUInt16LE(1,20);data.writeUInt16LE(1,22);data.writeUInt32LE(8000,24);data.writeUInt32LE(16000,28);data.writeUInt16LE(2,32);data.writeUInt16LE(16,34);data.write('data',36);data.writeUInt32LE(data.length-44,40);return data}
async function setup(browser,local=false){
 const page=await browser.newPage({viewport:{width:1360,height:870}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(local=>{
  localStorage.clear();localStorage.setItem('bztune-settings-v1',JSON.stringify({startPage:'home',autoUpdates:false}));
  const tracks=local?[
   {videoId:'library:clock-a',title:'First',artist:'Clock',audioUrl:'http://127.0.0.1:5000/clock/a.wav'},
   {videoId:'library:clock-b',title:'Second',artist:'Clock',audioUrl:'http://127.0.0.1:5000/clock/b.wav'}
  ]:[{videoId:'abcdefghijk',title:'First',artist:'Clock'},{videoId:'lmnopqrstuv',title:'Second',artist:'Clock'}];
  localStorage.setItem('doomvault-player-state-v11',JSON.stringify({tracks,index:0,shuffle:false,repeat:'off'}));
  for(const track of tracks)localStorage.setItem('doomvault-lrc-v11:'+track.videoId,'[00:00.10]'+track.title+' beginning\n[00:01.00]'+track.title+' one\n[00:02.00]'+track.title+' two\n[00:05.00]'+track.title+' five\n[01:00.00]'+track.title+' minute');
  if(local)localStorage.setItem('bztune-crossfade-v13','2');
 },local);
 await page.route('https://fonts.googleapis.com/**',r=>r.abort());
 await page.route('https://www.youtube.com/iframe_api',r=>r.fulfill({contentType:'application/javascript',body:adapter}));
 const audio=wave();
 await page.route(API+'/**',r=>{
  const url=new URL(r.request().url());if(url.pathname.startsWith('/clock/')){
   const range=r.request().headers()['range'];if(range){const match=range.match(/bytes=(\d+)-(\d*)/),start=Number(match[1]),end=match[2]?Math.min(Number(match[2]),audio.length-1):audio.length-1;return r.fulfill({status:206,headers:{'Content-Type':'audio/wav','Accept-Ranges':'bytes','Content-Range':`bytes ${start}-${end}/${audio.length}`},body:audio.subarray(start,end+1)})}
   return r.fulfill({headers:{'Content-Type':'audio/wav','Accept-Ranges':'bytes'},body:audio})
  }
  let json={};if(url.pathname==='/api/library/tracks')json={tracks:[]};else if(url.pathname==='/api/library/albums')json={albums:[]};else if(url.pathname==='/api/playlists')json={playlists:[]};else if(url.pathname==='/api/genres/index')json={genres:[]};else if(url.pathname.includes('/stats/summary'))json={totals:{},artists:[],tracks:[],albums:[],daily:[],history:[]};else if(url.pathname.includes('/stats/wrapped'))json={topArtists:[],months:[]};else if(url.pathname.includes('/maintenance/diagnostics'))json={packages:{},ffmpeg:{}};return r.fulfill({json})
 });
 await page.goto(BASE);await page.getByRole('button',{name:'Expandir player',exact:true}).click();return{page,errors};
}
(async()=>{const browser=await chromium.launch({...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{}),args:['--no-sandbox']});try{
 const{page,errors}=await setup(browser);
 await page.waitForFunction(()=>!!window.clockPlayer);
 await page.waitForFunction(()=>!document.querySelector('.bz32-main-play').disabled);
 const lyrics=page.getByRole('region',{name:'Letras da música'});
 const active=()=>lyrics.locator('.bz-lyric-active');
 // High frequency is tested by counting real adapter samples, not a brittle deadline per verse.
 const before=await page.evaluate(()=>window.clockPlayer.reads);await page.waitForTimeout(550);
 assert.ok((await page.evaluate(()=>window.clockPlayer.reads))-before>=3,'expanded lyrics must sample faster than the old 600ms interval');
 await page.evaluate(()=>window.clockPlayer.time=65);await active().filter({hasText:'First minute'}).waitFor();
 // Paused/buffering media time stays fixed; there must be no extrapolated countdown.
 await page.getByRole('button',{name:'Reproduzir',exact:true}).click();
 await page.evaluate(()=>window.clockPlayer.options.events.onStateChange({data:3}));
 await page.waitForTimeout(350);assert.equal(await active().textContent(),'First minute');
 await page.evaluate(()=>{window.clockPlayer.time=2.2;window.clockPlayer.options.events.onStateChange({data:1})});
 await active().filter({hasText:'First two'}).waitFor();
 await page.getByRole('button',{name:'Pausar',exact:true}).click();await page.waitForTimeout(300);assert.equal(await active().textContent(),'First two');
 const slider=page.getByRole('slider',{name:'Posição da música',exact:true});await slider.focus();await slider.press('Home');
 await page.waitForFunction(()=>!document.querySelector('.bz-lyric-active'));
 await slider.press('End');await active().filter({hasText:'First minute'}).waitFor();
 await slider.press('Home');await page.waitForFunction(()=>!document.querySelector('.bz-lyric-active'));
 // Switch twice without either new instance becoming ready: no old A/B sample can reappear.
 await page.evaluate(()=>{window.clockPlayer.time=70;window.holdClockReady=true});await active().filter({hasText:'First minute'}).waitFor();
 await page.locator('.bz32-queue-name[title="Tocar Second"]').click();
 await page.waitForFunction(()=>document.querySelector('.bz32-track h2').textContent==='Second');
 assert.equal(await slider.inputValue(),'0');assert.equal(await active().count(),0);
 await page.locator('.bz32-queue-name[title="Tocar First"]').click();
 await page.waitForFunction(()=>document.querySelector('.bz32-track h2').textContent==='First');
 assert.equal(await slider.inputValue(),'0');assert.equal(await active().count(),0);
 await page.evaluate(()=>{window.clockPlayer.time=1.5;window.clockPlayer.options.events.onReady({target:window.clockPlayer})});await active().filter({hasText:'First one'}).waitFor();
 // Exercise visibility scheduling deterministically, without freezing the test runner itself.
 await page.evaluate(()=>{Object.defineProperty(document,'visibilityState',{configurable:true,get:()=> 'hidden'});document.dispatchEvent(new Event('visibilitychange'))});
 const hiddenBefore=await page.evaluate(()=>window.clockPlayer.reads);await page.waitForTimeout(450);
 assert.ok((await page.evaluate(()=>window.clockPlayer.reads))-hiddenBefore<=1,'hidden reader must use the slower clock');
 await page.evaluate(()=>{window.clockPlayer.time=2.5;delete document.visibilityState;document.dispatchEvent(new Event('visibilitychange'))});
 await active().filter({hasText:'First two'}).waitFor();
 // Closing the reader reduces polling again; hidden-window throttling is left to the browser.
 await page.getByRole('button',{name:'Voltar ao mini-player',exact:true}).click();const slowBefore=await page.evaluate(()=>window.clockPlayer.reads);await page.waitForTimeout(450);
 assert.ok((await page.evaluate(()=>window.clockPlayer.reads))-slowBefore<=1,'mini-player must keep the slower sampling rate');
 assert.deepEqual(errors,[]);await page.close();
 console.log('OK: fast visible sampling; real-time pause/buffering; seek both ways; fresh identity in A→B→A; slower mini-player clock.');
 const local=await setup(browser,true);const p=local.page;
 await p.waitForFunction(()=>Array.from(document.querySelectorAll('audio')).every(a=>a.readyState>=2));
 await p.getByRole('button',{name:'Reproduzir',exact:true}).click();
 await p.locator('audio').evaluateAll(elements=>{const active=elements.find(a=>!a.paused);active.currentTime=6.2;active.dispatchEvent(new Event('timeupdate'))});
 await p.waitForFunction(()=>document.querySelector('.bz32-track h2').textContent==='Second');
 const elapsed=Number(await p.getByRole('slider',{name:'Posição da música',exact:true}).inputValue());assert.ok(elapsed>=1.4&&elapsed<5,'crossfade must preserve the incoming audio position');
 await p.getByRole('button',{name:'Modo de repetição',exact:true}).click();await p.getByRole('button',{name:'Modo de repetição',exact:true}).click();
 await p.locator('audio').evaluateAll(elements=>{const active=elements.find(a=>!a.paused);active.currentTime=7.8});
 await p.waitForFunction(()=>{const el=Array.from(document.querySelectorAll('audio')).find(a=>!a.paused);return el&&el.currentTime<1.5});
 await p.waitForFunction(()=>Number(document.querySelector('input[aria-label="Posição da música"]').value)<1.5);
 assert.deepEqual(local.errors,[]);await p.close();console.log('OK: actual WAV playback; incoming crossfade position retained; repeat-one clock follows the restarted audio.');
}finally{await browser.close()}})().catch(error=>{console.error(error);process.exitCode=1});
