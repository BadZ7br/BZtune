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
    let versionsMode='normal',finishVersions;
    await page.route('https://fonts.googleapis.com/**',route=>route.abort());
    await page.route('https://www.youtube.com/iframe_api',route=>route.fulfill({contentType:'application/javascript',body:adapter}));
    await page.route(`${API}/**`,async route=>{
      const url=new URL(route.request().url());let json={};
      if(url.pathname==='/api/lyrics/search') {
        if(mode==='error')return route.fulfill({status:502,json:{error:'Provider unavailable'}});
        const requestedMode=versionsMode;
        if(requestedMode==='delay')await new Promise(resolve=>finishVersions=resolve);
        if(requestedMode==='error')return route.fulfill({status:502,json:{error:'Versions unavailable'}});
        json={candidates:requestedMode==='empty'?[]:[
          {source:'LRCLIB',id:101,trackName:'Second Live',artistName:'Artist',albumName:'Live album',duration:340,syncedLyrics:'',plainLyrics:'Live selected text',instrumental:false},
          {source:'LRCLIB',id:102,trackName:'Second Studio',artistName:'Artist',albumName:'Studio album',duration:234,syncedLyrics:'[00:01]Studio selected verse',plainLyrics:'Studio selected verse',instrumental:false}
        ]};
      } else if(url.pathname==='/api/lyrics') {
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
    await page.getByRole('button',{name:'Expandir player',exact:true}).click();await page.getByRole('button',{name:'Fila',exact:true}).click();
    const panel=page.getByRole('region',{name:'Letras da música'});
    async function setOptions(open=true){
      const details=panel.locator('details.bz-lyrics-options');
      if(await details.evaluate(el=>el.open)!==open)await panel.getByLabel('Opções da letra',{exact:true}).click();
    }
    async function refreshLyrics(){await setOptions();await panel.getByRole('button',{name:'Buscar no LRCLIB',exact:true}).click();}

    // One discreet entry point, with native keyboard operation and bounded options.
    const optionsTrigger=panel.getByLabel('Opções da letra',{exact:true});
    assert.equal(await panel.getByRole('button',{name:'Buscar no LRCLIB',exact:true}).isVisible(),false);
    await optionsTrigger.focus();await optionsTrigger.press('Enter');
    await panel.getByRole('group',{name:'Fonte da letra',exact:true}).waitFor();
    assert.equal(await panel.getByRole('button',{name:'Usar LRC importado',exact:true}).getAttribute('aria-pressed'),'true');
    await optionsTrigger.press('Escape');
    assert.equal(await panel.locator('details.bz-lyrics-options').evaluate(el=>el.open),false);
    assert.equal(await optionsTrigger.evaluate(el=>el===document.activeElement),true);
    assert.equal(await panel.isVisible(),true,'first Escape closes options without minimizing');
    await optionsTrigger.press('Escape');
    assert.equal(await panel.isVisible(),false,'next Escape still minimizes the player');
    await page.getByRole('button',{name:'Expandir player',exact:true}).click();await page.getByRole('button',{name:'Fila',exact:true}).click();
    await setOptions();await panel.locator('h3').click();
    assert.equal(await panel.locator('details.bz-lyrics-options').evaluate(el=>el.open),false,'outside click dismisses');
    await setOptions();await panel.getByRole('region',{name:'Texto da letra'}).focus();
    assert.equal(await panel.locator('details.bz-lyrics-options').evaluate(el=>el.open),false,'focus outside dismisses without stealing focus');
    for(const [width,height] of [[1360,870],[1160,640],[960,640]]){
      await page.setViewportSize({width,height});await setOptions();
      await page.waitForFunction(()=>{
        const r=document.querySelector('.bz-lyrics-options-menu').getBoundingClientRect();
        return r.top>=0&&r.left>=0&&r.right<=innerWidth+1&&r.bottom<=innerHeight+1;
      });
      await panel.getByRole('button',{name:'Escolher versão no LRCLIB',exact:true}).scrollIntoViewIfNeeded();
      assert.equal(await panel.getByRole('button',{name:'Escolher versão no LRCLIB',exact:true}).isEnabled(),true);
      await setOptions(false);
    }
    await page.setViewportSize({width:1360,height:870});
    if(process.env.BZTUNE_LYRICS_PREVIEW_DIR){
      require('node:fs').mkdirSync(process.env.BZTUNE_LYRICS_PREVIEW_DIR,{recursive:true});
      await page.screenshot({path:path.join(process.env.BZTUNE_LYRICS_PREVIEW_DIR,'lyrics-controls-closed.png')});
      await setOptions();
      await page.screenshot({path:path.join(process.env.BZTUNE_LYRICS_PREVIEW_DIR,'lyrics-controls-open.png')});
      await setOptions(false);
    }

    await setOptions();
    await panel.getByText('Original manual',{exact:true}).waitFor();
    const input=panel.locator('input[type=file]');
    await input.setInputFiles({name:'slow.lrc',mimeType:'text/plain',buffer:Buffer.from('[00:01]Stale import')});
    await page.waitForFunction(()=>typeof window.finishLyricsImport==='function');
    await refreshLyrics();
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
    await refreshLyrics();
    await panel.getByText('Provider unavailable',{exact:true}).waitFor();
    await panel.getByText('Remote First',{exact:true}).waitFor();
    // Wait for the current recording metadata; never attach First's old duration.
    mode='normal';
    await page.locator('.bz32-queue-name[title="Tocar Second"]').click();
    await panel.getByText('Remote Second',{exact:true}).waitFor();
    assert.equal(requests.at(-1).track_name,'Second');
    assert.equal(requests.at(-1).duration,'234');
    // A late provider response must not replace another track's lyrics.
    mode='delay';finishRemote=null;
    await refreshLyrics();
    await page.waitForFunction(()=>document.querySelector('.bz-lyrics-panel')?.textContent.includes('Buscando no LRCLIB'));
    while(!finishRemote)await new Promise(resolve=>setTimeout(resolve,10));
    await page.locator('.bz32-queue-name[title="Tocar First"]').click();
    mode='normal';finishRemote();
    await panel.getByText('Remote First',{exact:true}).waitFor();
    await page.reload();
    await page.getByRole('button',{name:'Expandir player',exact:true}).click();await page.getByRole('button',{name:'Fila',exact:true}).click();
    await panel.getByText('Remote First',{exact:true}).waitFor();
    const beforeReopen=requests.length;
    await page.getByRole('button',{name:'Minimizar para o mini-player',exact:true}).click();
    await page.getByRole('button',{name:'Expandir player',exact:true}).click();await page.getByRole('button',{name:'Fila',exact:true}).click();
    await panel.getByText('Remote First',{exact:true}).waitFor();
    assert.equal(requests.length,beforeReopen,'reopening saved lyrics must not query the provider again');
    await page.evaluate(()=>{
      localStorage.removeItem('doomvault-lrc-v11:abcdefghijk');
      localStorage.removeItem('bztune-lyrics-v1:abcdefghijk');
    });
    await page.reload();
    const beforeFirstOpen=requests.length;
    await page.getByRole('button',{name:'Expandir player',exact:true}).click();await page.getByRole('button',{name:'Fila',exact:true}).click();
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
    await setOptions();
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
    await setOptions(false);
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
    mode='plain';await refreshLyrics();
    await panel.getByText('Plain verse 0',{exact:false}).first().waitFor();
    assert.equal(await reader.evaluate(el=>el.scrollTop),0);
    assert.equal(await reader.locator('.bz-lyric-seek').count(),0,'plain lyrics must not invent seek targets');
    await setOptions(false);await reader.hover();await page.mouse.wheel(0,400);
    await reader.evaluate(el=>el.scrollTo({top:400,behavior:'instant'}));
    await setOptions();
    await panel.getByRole('button',{name:'Usar LRC importado',exact:true}).click();await aligned();
    await panel.getByRole('button',{name:'Usar LRCLIB salvo',exact:true}).click();
    await panel.getByText('Plain verse 0',{exact:false}).first().waitFor();assert.equal(await reader.evaluate(el=>el.scrollTop),0);
    await setOptions(false);
    await setOptions(false);await reader.hover();await page.mouse.wheel(0,400);
    await reader.evaluate(el=>el.scrollTo({top:400,behavior:'instant'}));
    await page.evaluate(()=>{
      localStorage.setItem('bztune-lyrics-v1:lmnopqrstuv',JSON.stringify({source:'LRCLIB',syncedLyrics:'',plainLyrics:'Second plain beginning\n\n'+('Second plain verse\n\n'.repeat(40)),instrumental:false}));
    });
    await page.getByRole('button',{name:'Fila',exact:true}).click();
    await page.locator('.bz32-queue-name[title="Tocar Second"]').click();
    await panel.getByText('Second plain beginning',{exact:true}).waitFor();assert.equal(await reader.evaluate(el=>el.scrollTop),0);
    await page.locator('.bz32-queue-name[title="Tocar First"]').click();
    await panel.getByText('Plain verse 0',{exact:false}).first().waitFor();
    await setOptions(false);await reader.hover();await page.mouse.wheel(0,400);
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
    // Explicit recording selection: browsing never replaces the current lyrics.
    async function versions() {
      const options=panel.locator('details.bz-lyrics-options');
      if(!await options.evaluate(el=>el.open))await setOptions();
      await panel.getByRole('button',{name:'Escolher versão no LRCLIB',exact:true}).click();
    }
    const picker=panel.getByRole('region',{name:'Versões da letra',exact:true});
    const beforeVersions=await reader.textContent();
    await versions();await picker.getByRole('button',{name:/Second Studio/}).waitFor();
    assert.equal(await reader.textContent(),beforeVersions);
    assert.match(await picker.locator('li').first().textContent(),/Studio album · 3:54 · Sincronizada/);
    assert.match(await picker.locator('li').nth(1).textContent(),/Live album · 5:40 · Texto simples/);
    const manualSaved=await page.evaluate(()=>localStorage.getItem('doomvault-lrc-v11:lmnopqrstuv'));
    await picker.getByRole('button',{name:/Second Studio/}).click();
    await reader.getByText('Studio selected verse',{exact:true}).waitFor();
    assert.equal(await picker.count(),0);
    assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('bztune-lyrics-v1:lmnopqrstuv')).id),102);
    assert.equal(await page.evaluate(()=>localStorage.getItem('doomvault-lrc-v11:lmnopqrstuv')),manualSaved);
    await versions();await picker.getByRole('button',{name:/Second Live/}).click();
    await reader.getByText('Live selected text',{exact:true}).waitFor();
    await page.reload();await page.getByRole('button',{name:'Expandir player',exact:true}).click();await page.getByRole('button',{name:'Fila',exact:true}).click();
    await reader.getByText('Live selected text',{exact:true}).waitFor();
    await versions();await picker.getByRole('button',{name:'Fechar',exact:true}).click();
    assert.equal(await reader.textContent(),'Live selected text');
    versionsMode='empty';await versions();await picker.getByText('Nenhuma versão encontrada.',{exact:true}).waitFor();
    assert.equal(await reader.textContent(),'Live selected text');
    versionsMode='error';await versions();await panel.getByRole('status').filter({hasText:'Versions unavailable'}).waitFor();
    assert.equal(await reader.textContent(),'Live selected text');
    versionsMode='delay';await versions();
    await assert.doesNotReject(async()=>{for(let i=0;!finishVersions;i++){assert.ok(i<100,'version request must start');await page.waitForTimeout(20)}});
    // Switch tracks while the provider is pending: obsolete candidates must not appear.
    if(!await page.locator('.bz32-queue-name[title="Tocar First"]').count())await page.getByRole('button',{name:'Fila',exact:true}).click();
    await page.locator('.bz32-queue-name[title="Tocar First"]').click();
    finishVersions();await page.waitForTimeout(200);
    assert.equal(await picker.count(),0);
    assert.ok(!(await reader.textContent()).includes('Live selected text'));
    console.log('OK: recording versions ranked by duration; explicit selection and offline reload; manual LRC preserved; empty/error preserve current lyrics; obsolete search ignored.');
    // Quota failures retain both sources and the selected source throughout A→B→A.
    mode='normal';versionsMode='normal';
    const durableManual=await page.evaluate(()=>localStorage.getItem('doomvault-lrc-v11:abcdefghijk'));
    await page.evaluate(()=>{
      const original=Storage.prototype.setItem;
      window.blockLyrics='all';
      Storage.prototype.setItem=function(key,value){
        const lyric=/^(?:bztune-lyrics-(?:source-)?v1:|doomvault-lrc-v11:)/.test(key);
        const source=key.startsWith('bztune-lyrics-source-v1:');
        if(lyric&&(window.blockLyrics==='all'||window.blockLyrics==='source'&&source))throw new DOMException('Quota exceeded','QuotaExceededError');
        return original.call(this,key,value);
      };
    });
    async function importSession(text){
      await panel.locator('input[type=file]').setInputFiles({name:'session.lrc',mimeType:'text/plain',buffer:Buffer.from('[00:01]'+text)});
      await reader.getByText(text,{exact:true}).waitFor();
    }
    async function roundTrip(){
      if(!await page.locator('.bz32-queue-name[title="Tocar Second"]').count())await page.getByRole('button',{name:'Fila',exact:true}).click();
      await page.locator('.bz32-queue-name[title="Tocar Second"]').click();
      await reader.getByText('Live selected text',{exact:true}).waitFor();
      await page.locator('.bz32-queue-name[title="Tocar First"]').click();
    }
    await importSession('Session manual words');
    await page.locator('.bz-preference-save-warning').waitFor();
    assert.equal(await page.evaluate(()=>localStorage.getItem('doomvault-lrc-v11:abcdefghijk')),durableManual);
    const requestsBefore=requests.length;
    await roundTrip();await reader.getByText('Session manual words',{exact:true}).waitFor();
    assert.equal(requests.length,requestsBefore);
    await versions();await picker.getByRole('button',{name:/Second Studio/}).click();
    await reader.getByText('Studio selected verse',{exact:true}).waitFor();
    await roundTrip();await reader.getByText('Studio selected verse',{exact:true}).waitFor();
    await setOptions();await panel.getByRole('button',{name:'Usar LRC importado',exact:true}).click();
    await reader.getByText('Session manual words',{exact:true}).waitFor();
    // Latest failed write replaces the older pending text, and invalid imports preserve it.
    await importSession('Latest session manual words');
    await panel.locator('input[type=file]').setInputFiles({name:'invalid.lrc',mimeType:'text/plain',buffer:Buffer.from('not LRC')});
    await panel.getByRole('status').filter({hasText:'não contém linhas LRC válidas'}).waitFor();
    await reader.getByText('Latest session manual words',{exact:true}).waitFor();
    await setOptions();await panel.getByRole('button',{name:'Usar LRCLIB salvo',exact:true}).click();
    await reader.getByText('Studio selected verse',{exact:true}).waitFor();
    await setOptions();await panel.getByRole('button',{name:'Tentar salvar novamente',exact:true}).click();
    assert.equal(await page.locator('.bz-preference-save-warning').count(),1);
    // Content writes recover first; a still-failing source preference stays pending in memory.
    await page.evaluate(()=>window.blockLyrics='source');
    await setOptions();await panel.getByRole('button',{name:'Tentar salvar novamente',exact:true}).click();
    assert.equal(await page.evaluate(()=>localStorage.getItem('doomvault-lrc-v11:abcdefghijk')),'[00:01]Latest session manual words');
    assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('bztune-lyrics-v1:abcdefghijk')).id),102);
    await roundTrip();await reader.getByText('Studio selected verse',{exact:true}).waitFor();
    await setOptions();await panel.getByRole('button',{name:'Usar LRC importado',exact:true}).click();
    await reader.getByText('Latest session manual words',{exact:true}).waitFor();
    await page.evaluate(()=>window.blockLyrics=null);
    await setOptions();await panel.getByRole('button',{name:'Tentar salvar novamente',exact:true}).click();
    assert.equal(await page.locator('.bz-preference-save-warning').count(),0);
    assert.equal(await page.evaluate(()=>localStorage.getItem('bztune-lyrics-source-v1:abcdefghijk')),'manual');
    assert.ok(!(await panel.locator('p[role=status]').textContent()).includes('Não foi possível salvar'));
    // Restart offline: both successfully retried sources are durably available.
    mode='error';await page.reload();
    await page.getByRole('button',{name:'Expandir player',exact:true}).click();await page.getByRole('button',{name:'Fila',exact:true}).click();
    await reader.getByText('Latest session manual words',{exact:true}).waitFor();
    await setOptions();await panel.getByRole('button',{name:'Usar LRCLIB salvo',exact:true}).click();
    await reader.getByText('Studio selected verse',{exact:true}).waitFor();
    console.log('OK: quota failures preserve both lyric sources and selection through track changes; invalid import preserves text; latest writes retry; partial retry and source-only failures recover; both sources reload offline.');
    assert.deepEqual(errors,[]);
    console.log('OK: latest operation wins; manual lyrics preserved; source selection and offline reload; invalid LRC and network error preserve text; duration bound to track; stale response ignored; automatic lookup on open and track change, without repeated cache requests.');
  } finally {await browser.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1});
