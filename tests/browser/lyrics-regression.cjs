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
  getCurrentTime(){return 0} getDuration(){return this.seconds}
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
        json={source:'LRCLIB',syncedLyrics:'[00:01]Remote '+url.searchParams.get('track_name'),plainLyrics:'Remote plain',instrumental:false};
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
    await page.getByRole('button',{name:'Letra',exact:true}).click();
    const panel=page.locator('.bz32-extra-inner').filter({has:page.getByRole('button',{name:'Importar LRC',exact:true})});
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
    await page.getByRole('button',{name:'Tocar Second',exact:true}).click();
    mode='normal';
    await panel.getByRole('button',{name:'Buscar no LRCLIB',exact:true}).click();
    await panel.getByText('Remote Second',{exact:true}).waitFor();
    assert.equal(requests.at(-1).track_name,'Second');
    assert.equal(requests.at(-1).duration,undefined);
    // A late provider response must not replace another track's lyrics.
    mode='delay';finishRemote=null;
    await panel.getByRole('button',{name:'Buscar no LRCLIB',exact:true}).click();
    await page.waitForFunction(()=>document.querySelector('.bz32-extra-inner')?.textContent.includes('Buscando no LRCLIB'));
    while(!finishRemote)await new Promise(resolve=>setTimeout(resolve,10));
    await page.getByRole('button',{name:'Tocar First',exact:true}).click();
    mode='normal';finishRemote();
    await panel.getByText('Remote First',{exact:true}).waitFor();
    await page.reload();
    await page.getByRole('button',{name:'Expandir player',exact:true}).click();
    await page.getByRole('button',{name:'Letra',exact:true}).click();
    await panel.getByText('Remote First',{exact:true}).waitFor();
    assert.deepEqual(errors,[]);
    console.log('OK: latest operation wins; manual lyrics preserved; source selection and offline reload; invalid LRC and network error preserve text; duration bound to track; stale response ignored.');
  } finally {await browser.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1});
