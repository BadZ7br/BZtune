/** Real React flows with deterministic provider responses; no user library is used. */
const assert = require('node:assert/strict');
const path = require('node:path');
const { createRequire } = require('node:module');
const { chromium } = createRequire(path.resolve(__dirname, '../../doomvault/package.json'))('playwright');
const API = 'http://127.0.0.1:5000';
const BASE = process.env.BZTUNE_BASE_URL || 'http://127.0.0.1:5173';
const adapter = `window.YT={Player:class {
  constructor(el,options){this.options=options; const id=options.videoId; this.seconds=id==='abcdefghijk'?123:234;
    setTimeout(()=>options.events.onReady({target:this}),id==='abcdefghijk'?10:1200);}
  setVolume(){} playVideo(){} pauseVideo(){} destroy(){} seekTo(){}
  getCurrentTime(){return window.bztuneLyricsClock || 0} getDuration(){return this.seconds}
}};window.onYouTubeIframeAPIReady();`;
async function main() {
  const browser = await chromium.launch({...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),args:['--no-sandbox']});
  try {
    const page = await browser.newPage({viewport:{width:1360,height:870}});
    const errors=[];page.on('pageerror', e=>errors.push(e.message));
    await page.addInitScript(()=>{
      if (!localStorage.getItem('lyrics-fixture')) {
        localStorage.clear();localStorage.setItem('lyrics-fixture','1');
        localStorage.setItem('bztune-settings-v1',JSON.stringify({startPage:'home',autoUpdates:false}));
        localStorage.setItem('doomvault-player-state-v11',JSON.stringify({tracks:[
          {videoId:'abcdefghijk',title:'First',artist:'Artist',album:'Album'},
          {videoId:'lmnopqrstuv',title:'Second',artist:'Artist',album:'Album'}],index:0,shuffle:false,repeat:'off'}));
        localStorage.setItem('doomvault-lrc-v11:abcdefghijk','[00:01]Original manual');
      }
      const text=File.prototype.text;
      File.prototype.text=function(){
        if(this.name==='slow.lrc')return new Promise(resolve=>{window.finishLyricsImport=()=>text.call(this).then(resolve)});
        return text.call(this);
      };
    });
    let mode='normal';let finishRemote;const requests=[];
    await page.route('https://fonts.googleapis.com/**',route=>route.abort());
    await page.route('https://www.youtube.com/iframe_api',route=>route.fulfill({contentType:'application/javascript',body:adapter}));
    await page.route(`${API}/**`,async route=>{
      const url=new URL(route.request().url());let json={};
      if(url.pathname==='/api/lyrics') {
        requests.push(Object.fromEntries(url.searchParams));
        if(mode==='delay')await new Promise(resolve=>finishRemote=resolve);
        if(mode==='error')return route.fulfill({status:502,json:{error:'Provider unavailable'}});
        json={source:'LRCLIB',syncedLyrics:'[00:01]Remote '+url.searchParams.get('track_name')+'\n'+Array.from({length:30},(_,i)=>{const seconds=(i+1)*10;return '['+String(Math.floor(seconds/60)).padStart(2,'0')+':'+String(seconds%60).padStart(2,'0')+']Verse '+(i+1)}).join('\n'),plainLyrics:'Remote plain',instrumental:false};
        if(mode==='plain')json={source:'LRCLIB',syncedLyrics:'',plainLyrics:Array.from({length:40},(_,i)=>'Plain verse '+i+'\nWords for reading freely.').join('\n\n'),instrumental:false};
      } else if(url.pathname==='/api/library/tracks')json={tracks:[]};
      else if(url.pathname==='/api/library/albums')json={albums:[]};
      else if(url.pathname==='/api/playlists')json={playlists:[]};
      else if(url.pathname==='/api/genres/index')json={genres:[]};
      else if(url.pathname.includes('/stats/summary'))json={totals:{},artists:[],tracks:[],albums:[],daily:[],history:[]};
      else if(url.pathname.includes('/stats/wrapped'))json={topArtists:[],months:[]};
      else if(url.pathname.includes('/maintenance/diagnostics'))json={packages:{},ffmpeg:{}};
      else if(url.pathname.includes('/discovery/recommendations'))json={songs:[],albums:[],artists:[]};
      try { await route.fulfill({json}); } catch { /* an explicitly cancelled request */ }
    });
    await page.goto(BASE);
    await page.getByRole('button',{name:'Expandir player',exact:true}).click();
    const panel=page.getByRole('region',{name:'Letras da música'});
    await panel.getByLabel('Opções da letra',{exact:true}).click();
    await panel.getByText('Original manual',{exact:true}).waitFor();
    const input=panel.locator('input[type=file]');
    await input.setInputFiles({name:'slow.lrc',mimeType:'text/plain',buffer:Buffer.from('[00:01]Stale import')});
    await page.waitForFunction(()=>typeof window.finishLyricsImport==='function');
    await panel.getByRole('button',{name:'Buscar no LRCLIB',exact:true}).click();
    await panel.getByText('Remote First',{exact:true}).waitFor();
    await page.evaluate(()=>window.finishLyricsImport());
    // Flush async file.text + React updates without relying on file speed.
    await page.waitForTimeout(100);
    assert.equal(await panel.getByText('Stale import',{exact:true}).count(),0);
    assert.equal(await page.evaluate(()=>localStorage.getItem('doomvault-lrc-v11:abcdefghijk')),'[00:01]Original manual');
    await panel.getByRole('button',{name:'Usar LRC importado',exact:true}).click();
    await panel.getByText('Original manual',{exact:true}).waitFor();
    await panel.getByRole('button',{name:'Usar LRCLIB salvo',exact:true}).click();
    await panel.getByText('Remote First',{exact:true}).waitFor();
    await input.setInputFiles({name:'invalid.lrc',mimeType:'text/plain',buffer:Buffer.from('not a timestamp')});
    await panel.getByText(/O arquivo não contém/).waitFor();
    await panel.getByText('Remote First',{exact:true}).waitFor();
    mode='error';
    await panel.getByRole('button',{name:'Buscar no LRCLIB',exact:true}).click();
    await panel.getByText('Provider unavailable',{exact:true}).waitFor();
    await panel.getByText('Remote First',{exact:true}).waitFor();
    // The old 123 second duration must not be attached to Second before readiness.
    mode='normal';
    await page.locator('.bz32-queue-name[title="Tocar Second"]').click();
    await panel.getByText('Remote Second',{exact:true}).waitFor();
    assert.equal(requests.at(-1).track_name,'Second');
    assert.equal(requests.at(-1).duration,undefined);
    // A late provider response must not replace another track's lyrics.
    mode='delay';finishRemote=null;
    await panel.getByRole('button',{name:'Buscar no LRCLIB',exact:true}).click();
    await page.waitForFunction(()=>document.querySelector('.bz-lyrics-panel')?.textContent.includes('Buscando no LRCLIB'));
    while(!finishRemote)await new Promise(resolve=>setTimeout(resolve,10));
    await page.locator('.bz32-queue-name[title="Tocar First"]').click();
    mode='normal';finishRemote();
    await panel.getByText('Remote First',{exact:true}).waitFor();
    await page.reload();
    await page.getByRole('button',{name:'Expandir player',exact:true}).click();
    await panel.getByText('Remote First',{exact:true}).waitFor();
    const beforeReopen=requests.length;
    await page.getByRole('button',{name:'Voltar ao mini-player',exact:true}).click();
    await page.getByRole('button',{name:'Expandir player',exact:true}).click();
    await panel.getByText('Remote First',{exact:true}).waitFor();
    assert.equal(requests.length,beforeReopen,'reopening saved lyrics must not query the provider again');
    await page.evaluate(()=>{
      localStorage.removeItem('doomvault-lrc-v11:abcdefghijk');
      localStorage.removeItem('bztune-lyrics-v1:abcdefghijk');
    });
    await page.reload();
    const beforeFirstOpen=requests.length;
    await page.getByRole('button',{name:'Expandir player',exact:true}).click();
    await panel.getByText('Remote First',{exact:true}).waitFor();
    assert.equal(requests.length,beforeFirstOpen+1,'opening an uncached track must automatically fetch once');
    await page.evaluate(()=>{window.bztuneLyricsClock=75});
    await panel.locator('.bz-lyric-active').filter({hasText:'Verse 7'}).waitFor();
    const reader=panel.getByRole('region',{name:'Texto da letra'});
    await page.waitForFunction(()=>document.querySelector('.bz-lyrics-reader').scrollTop>0);
    await reader.hover();await page.mouse.wheel(0,-100);
    await panel.getByRole('button',{name:'Acompanhar letra',exact:true}).waitFor();
    await page.evaluate(()=>{window.bztuneLyricsClock=125});
    await panel.locator('.bz-lyric-active').filter({hasText:'Verse 12'}).waitFor();
    await panel.getByRole('button',{name:'Acompanhar letra',exact:true}).click();
    assert.equal(await panel.getByRole('button',{name:'Acompanhando',exact:true}).getAttribute('aria-pressed'),'true');
    await panel.getByLabel('Opções da letra',{exact:true}).click();
    await input.setInputFiles({name:'translated.lrc',mimeType:'text/plain',buffer:Buffer.from('[ar:Demo]\n[00:01]Original [refrão]\n[00:01.000]Tradução [echo]\n[00:02]Próximo')});
    await page.evaluate(()=>{window.bztuneLyricsClock=1.2});
    await panel.locator('.bz-lyric-active').filter({hasText:'Original [refrão]'}).waitFor();
    assert.equal(await panel.locator('.bz-lyric-active').textContent(),'Original [refrão]\nTradução [echo]');
    assert.equal(await panel.locator('.bz-lyric-active').evaluate(el=>getComputedStyle(el).whiteSpace),'pre-wrap');
    // Scroll layout: a long paused song must realign after resize/font changes.
    const longLrc=Array.from({length:40},(_,i)=>'['+String(Math.floor(i*10/60)).padStart(2,'0')+':'+String(i*10%60).padStart(2,'0')+']Manual '+i+' — a longer verse that wraps when the reader becomes narrow').join('\n');
    await input.setInputFiles({name:'long.lrc',mimeType:'text/plain',buffer:Buffer.from(longLrc)});
    await page.evaluate(()=>{window.bztuneLyricsClock=125});
    await panel.locator('.bz-lyric-active').filter({hasText:'Manual 12'}).waitFor();
    async function aligned(){
      await page.waitForFunction(()=>{
        const reader=document.querySelector('.bz-lyrics-reader'),active=reader?.querySelector('.bz-lyric-active');
        if(!active)return false;const r=reader.getBoundingClientRect(),a=active.getBoundingClientRect();
        return a.top>=r.top-2&&a.bottom<=r.bottom+2&&a.top-r.top<=reader.clientHeight*.5&&a.bottom-r.top>=reader.clientHeight*.3;
      });
    }
    await aligned();
    await page.setViewportSize({width:1160,height:700});await aligned();
    await page.getByRole('button',{name:'Ocultar fila',exact:true}).click();await aligned();
    await page.evaluate(()=>{document.documentElement.style.fontSize='20px'});await aligned();
    await page.evaluate(()=>{document.documentElement.style.fontSize=''});await aligned();
    await panel.getByLabel('Opções da letra',{exact:true}).click();
    // Manual reading must survive clock and layout updates until explicitly resumed.
    await reader.hover();await page.mouse.wheel(0,-200);
    await panel.getByRole('button',{name:'Acompanhar letra',exact:true}).waitFor();
    await reader.evaluate(el=>el.scrollTo({top:120,behavior:'instant'}));
    await page.evaluate(()=>{window.bztuneLyricsClock=225});
    await panel.locator('.bz-lyric-active').filter({hasText:'Manual 22'}).waitFor();
    assert.ok(Math.abs(await reader.evaluate(el=>el.scrollTop)-120)<2);
    await page.setViewportSize({width:1160,height:740});
    await page.waitForTimeout(100);assert.ok(Math.abs(await reader.evaluate(el=>el.scrollTop)-120)<2);
    await panel.getByRole('button',{name:'Acompanhar letra',exact:true}).click();await aligned();
    // A scrollbar/text pointer interaction and Space suspend following without pausing audio.
    await reader.click({position:{x:20,y:20}});
    await panel.getByRole('button',{name:'Acompanhar letra',exact:true}).waitFor();
    await panel.getByRole('button',{name:'Acompanhar letra',exact:true}).click();await aligned();
    const playLabel=await page.locator('.bz32-main-play').getAttribute('aria-label');
    await reader.focus();await reader.press('Space');
    await panel.getByRole('button',{name:'Acompanhar letra',exact:true}).waitFor();
    assert.equal(await page.locator('.bz32-main-play').getAttribute('aria-label'),playLabel);
    await panel.getByRole('button',{name:'Acompanhar letra',exact:true}).click();await aligned();
    // Changing to plain lyrics resets to the beginning; choosing sync returns to the active verse.
    mode='plain';await panel.getByRole('button',{name:'Buscar no LRCLIB',exact:true}).click();
    await panel.getByText('Plain verse 0',{exact:false}).first().waitFor();
    assert.equal(await reader.evaluate(el=>el.scrollTop),0);
    await reader.hover();await page.mouse.wheel(0,400);
    await reader.evaluate(el=>el.scrollTo({top:400,behavior:'instant'}));
    await panel.getByLabel('Opções da letra',{exact:true}).click();
    await panel.getByRole('button',{name:'Usar LRC importado',exact:true}).click();await aligned();
    await panel.getByRole('button',{name:'Usar LRCLIB salvo',exact:true}).click();
    await panel.getByText('Plain verse 0',{exact:false}).first().waitFor();assert.equal(await reader.evaluate(el=>el.scrollTop),0);
    await panel.getByLabel('Opções da letra',{exact:true}).click();
    await reader.hover();await page.mouse.wheel(0,400);
    await reader.evaluate(el=>el.scrollTo({top:400,behavior:'instant'}));
    await page.evaluate(()=>{
      localStorage.setItem('bztune-lyrics-v1:lmnopqrstuv',JSON.stringify({source:'LRCLIB',syncedLyrics:'',plainLyrics:'Second plain beginning\n\n'+('Second plain verse\n\n'.repeat(40)),instrumental:false}));
    });
    await page.getByRole('button',{name:'Fila',exact:true}).click();
    await page.locator('.bz32-queue-name[title="Tocar Second"]').click();
    await panel.getByText('Second plain beginning',{exact:true}).waitFor();assert.equal(await reader.evaluate(el=>el.scrollTop),0);
    await page.locator('.bz32-queue-name[title="Tocar First"]').click();
    await panel.getByText('Plain verse 0',{exact:false}).first().waitFor();
    await reader.hover();await page.mouse.wheel(0,400);
    await reader.evaluate(el=>el.scrollTo({top:400,behavior:'instant'}));
    await page.evaluate(()=>{
      localStorage.setItem('doomvault-lrc-v11:lmnopqrstuv',Array.from({length:40},(_,i)=>'['+String(Math.floor((i+3)*10/60)).padStart(2,'0')+':'+String((i+3)*10%60).padStart(2,'0')+']Intro '+i).join('\n'));
      localStorage.setItem('bztune-lyrics-source-v1:lmnopqrstuv','manual');window.bztuneLyricsClock=0;
    });
    await page.locator('.bz32-queue-name[title="Tocar Second"]').click();
    await panel.getByText('Intro 0',{exact:true}).waitFor();
    assert.equal(await reader.evaluate(el=>el.scrollTop),0);assert.equal(await panel.locator('.bz-lyric-active').count(),0);
    await page.emulateMedia({reducedMotion:'reduce'});
    await page.evaluate(()=>{window.bztuneLyricsClock=125});await aligned();
    await reader.evaluate(el=>{const scroll=el.scrollTo.bind(el);window.scrollBehaviors=[];el.scrollTo=options=>{window.scrollBehaviors.push(options.behavior);scroll(options)}});
    await page.evaluate(()=>{window.bztuneLyricsClock=135});
    await panel.locator('.bz-lyric-active').filter({hasText:'Intro 10'}).waitFor();await aligned();
    assert.ok((await page.evaluate(()=>window.scrollBehaviors)).every(value=>value==='instant'));
    assert.deepEqual(errors,[]);
    console.log('OK: latest operation wins; manual lyrics preserved; source selection and offline reload; invalid LRC and network error preserve text; duration bound to track; stale response ignored; automatic lookup on open and track change, without repeated cache requests.');
  } finally {await browser.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1});
