/** PNG previews of the running app using fictional tracks and fully mocked data. */
const {createRequire}=require('node:module');
const path=require('node:path');
const req=createRequire(path.resolve(__dirname,'../doomvault/package.json'));
const {chromium}=req('playwright');const fs=require('node:fs');
const OUT=path.resolve(process.env.BZTUNE_SCREENSHOT_DIR || path.resolve(__dirname,'../docs/previews/player-lyrics'));fs.mkdirSync(OUT,{recursive:true});
const API='http://127.0.0.1:5000';
const words=['A cidade dorme devagar','E a janela deixa a luz entrar','Guardo o silêncio pra depois','O horizonte espera por nós','Cada passo encontra seu lugar','Entre as luzes, volto a respirar','Se o tempo mudar de direção','Levo o caminho na canção'];
const synced=words.map((text,i)=>`[${String(Math.floor(i*18/60)).padStart(2,'0')}:${String(i*18%60).padStart(2,'0')}.00]${text}`).join('\n');
const plain=words.slice(0,4).join('\n')+'\n\n'+words.slice(4).join('\n');
const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="800" height="800"><defs><linearGradient id="sky" x2=".7" y2="1"><stop stop-color="#151f29"/><stop offset=".6" stop-color="#685848"/><stop offset="1" stop-color="#c18c65"/></linearGradient><radialGradient id="glow"><stop stop-color="#efcf99" stop-opacity=".6"/><stop offset="1" stop-color="#efcf99" stop-opacity="0"/></radialGradient></defs><rect width="800" height="800" fill="url(#sky)"/><circle cx="480" cy="310" r="270" fill="url(#glow)"/><circle cx="480" cy="300" r="100" fill="#ecd3ac"/><path d="M0 490 Q180 330 390 500 T800 470V800H0" fill="#26373a"/><path d="M0 600Q280 440 800 590V800H0" fill="#17262c"/><path d="M0 720Q380 520 800 690V800H0" fill="#0e1a20"/><text x="64" y="88" fill="#f1e9db" font-family="sans-serif" font-size="22" letter-spacing="7">HORIZONTE</text><text x="64" y="696" fill="#f1e9db" font-family="sans-serif" font-size="60" letter-spacing="-2">Entre luzes</text><text x="68" y="740" fill="#f1e9db" font-family="sans-serif" font-size="15" letter-spacing="5">SESSÕES AO ENTARDECER</text></svg>`;
const titles=['Entre luzes','Passagem','Lado de fora','Maré baixa','Enquanto houver sol','Dias de vento','De volta ao início'];
const tracks=titles.map((title,i)=>({videoId:'library:demo-'+i,title,artist:'Horizonte',album:'Sessões ao entardecer',cover:'https://preview.bztune.invalid/cover.svg',audioUrl:API+'/demo/audio'}));
const wav=Buffer.alloc(44+8000*180*2);wav.write('RIFF',0);wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(8000,24);wav.writeUInt32LE(16000,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(wav.length-44,40);
(async()=>{const browser=await chromium.launch({...(process.env.CHROMIUM_PATH ? {executablePath:process.env.CHROMIUM_PATH} : {}),args:['--no-sandbox']});
try {
 for(const story of [{name:'01-letra-sincronizada',width:1600,height:1000},{name:'02-foco-na-letra',width:1440,height:900,focus:true},{name:'03-letra-completa',width:1366,height:768,plain:true},{name:'04-player-compacto',width:960,height:640}]){
  const page=await browser.newPage({viewport:{width:story.width,height:story.height}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(({tracks,synced,plain,isPlain})=>{localStorage.clear();localStorage.setItem('bztune-settings-v1',JSON.stringify({theme:'dark',accent:'#e9b58e',autoUpdates:false,startPage:'home'}));localStorage.setItem('doomvault-player-state-v11',JSON.stringify({tracks,index:0,shuffle:false,repeat:'off'}));localStorage.setItem('bztune-lyrics-v1:library:demo-0',JSON.stringify({source:'LRCLIB',syncedLyrics:isPlain?'':synced,plainLyrics:plain,instrumental:false}));},{tracks,synced,plain,isPlain:!!story.plain});
  await page.route('https://preview.bztune.invalid/cover.svg',r=>r.fulfill({contentType:'image/svg+xml',body:svg}));
  await page.route('https://fonts.googleapis.com/**',r=>r.abort());
  await page.route(API+'/**',r=>{const pathname=new URL(r.request().url()).pathname;
   if(pathname==='/demo/audio'){
    const range=r.request().headers()['range'];
    if(range){const match=range.match(/bytes=(\d+)-(\d*)/);const start=Number(match[1]);const end=match[2]?Math.min(Number(match[2]),wav.length-1):wav.length-1;return r.fulfill({status:206,headers:{'Content-Type':'audio/wav','Accept-Ranges':'bytes','Content-Range':`bytes ${start}-${end}/${wav.length}`},body:wav.subarray(start,end+1)});}
    return r.fulfill({contentType:'audio/wav',headers:{'Accept-Ranges':'bytes'},body:wav});
   }
   let json={};if(pathname==='/api/library/tracks')json={tracks:[]};else if(pathname==='/api/library/albums')json={albums:[]};else if(pathname==='/api/playlists')json={playlists:[]};else if(pathname==='/api/genres/index')json={genres:[]};else if(pathname.includes('/stats/summary'))json={totals:{},artists:[],tracks:[],albums:[],daily:[],history:[]};else if(pathname.includes('/stats/wrapped'))json={topArtists:[],months:[]};else if(pathname.includes('/maintenance/diagnostics'))json={packages:{},ffmpeg:{}};return r.fulfill({json});});
  await page.goto(process.env.BZTUNE_BASE_URL || 'http://127.0.0.1:5173');await page.getByRole('button',{name:'Expandir player',exact:true}).click();
  if(story.focus)await page.getByRole('button',{name:'Ocultar fila',exact:true}).click();
  await page.getByRole('region',{name:'Letras da música'}).waitFor();
  await page.waitForFunction(()=>Array.from(document.querySelectorAll('audio')).some(a=>a.readyState>=1));
  await page.locator('audio').evaluateAll(elements=>{for(const audio of elements){if(audio.getAttribute('src')){audio.currentTime=62;audio.dispatchEvent(new Event('timeupdate'));}}});
  await page.waitForTimeout(650);
  const metrics=await page.evaluate(()=>{const panel=document.querySelector('.bz-lyrics-panel'),shell=document.querySelector('.bz32-shell'),center=document.querySelector('.bz32-center');return {horizontal:document.documentElement.scrollWidth>innerWidth,shell:shell.getBoundingClientRect().toJSON(),lyrics:panel.getBoundingClientRect().toJSON(),center:{client:center.clientHeight,scroll:center.scrollHeight}}});
  await page.screenshot({path:OUT+'/'+story.name+'.png'});console.log(story.name,JSON.stringify(metrics),'errors',JSON.stringify(errors));await page.close();
 }
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
