/** Visual composition: real BZtune navigation + proposed player, with fictitious data. */
const path=require('node:path'),fs=require('node:fs'),{createRequire}=require('node:module');
const {chromium}=createRequire(path.resolve(__dirname,'../doomvault/package.json'))('playwright');
const folder=path.resolve(__dirname,'../docs/previews/player-dueto-footer');
let preview=fs.readFileSync(path.join(folder,'index.html'),'utf8');
const cover='data:image/svg+xml;base64,'+fs.readFileSync(path.join(folder,'cover.svg')).toString('base64');
preview=preview.replaceAll('cover.svg',cover).replace('</style>',`.a .frame{min-height:0;padding:28px 40px;background:radial-gradient(ellipse at 18% 30%,#b1856218,transparent 70%),#111210}.a main{grid-template-columns:320px minmax(0,1fr);gap:70px}.a .cover{width:320px;height:320px}.a .meta h1{font-size:30px}.a .lyrics p{font-size:32px;letter-spacing:-.8px;margin-bottom:26px}.a .lyric-label{margin-bottom:30px}.a .player-footer{padding-top:15px}.a .meta p{font-size:12px}.a .meta{margin-top:26px}</style>`);
(async()=>{const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});try{
 const page=await browser.newPage({viewport:{width:1600,height:1000},deviceScaleFactor:1});
 await page.addInitScript(()=>{localStorage.clear();localStorage.setItem('bztune-settings-v1',JSON.stringify({theme:'dark',accent:'#e7b78d',autoUpdates:false,startPage:'home'}));});
 await page.route('https://fonts.googleapis.com/**',r=>r.abort());
 await page.route('http://127.0.0.1:5000/**',r=>{const pathname=new URL(r.request().url()).pathname;let json={};if(pathname==='/api/library/tracks')json={tracks:[]};else if(pathname==='/api/library/albums')json={albums:[]};else if(pathname==='/api/playlists')json={playlists:[]};else if(pathname==='/api/genres/index')json={genres:[]};else if(pathname.includes('/stats/summary'))json={totals:{},artists:[],tracks:[],albums:[],daily:[],history:[]};else if(pathname.includes('/stats/wrapped'))json={topArtists:[],months:[]};else if(pathname.includes('/maintenance/diagnostics'))json={packages:{},ffmpeg:{}};return r.fulfill({json})});
 await page.goto(process.env.BZTUNE_BASE_URL||'http://127.0.0.1:5173');await page.locator('.sidebar').waitFor();await page.waitForLoadState('networkidle');
 await page.evaluate(preview=>{
  const main=document.querySelector('.main-content'),header=main.querySelector('.topbar');
  for(const child of [...main.children])if(child!==header)child.remove();
  main.style.cssText='padding:0;display:flex;flex-direction:column;height:100dvh;min-width:0;overflow:hidden';
  header.style.cssText+=';margin:0;padding:20px 36px;border-bottom:1px solid #ffffff12;flex-shrink:0';
  const frame=document.createElement('iframe');frame.title='Prévia do Modelo A integrado à navegação';frame.id='dueto-preview';frame.style.cssText='display:block;width:100%;flex:1;min-height:0;border:0;background:#111210';frame.srcdoc=preview;main.append(frame);
  document.body.style.paddingBottom='0';
 },preview);
 const frame=page.frameLocator('#dueto-preview');await frame.getByRole('button',{name:'Shuffle',exact:true}).waitFor();
 await page.waitForTimeout(200);
 await page.screenshot({path:path.join(folder,'03-no-frontend-bztune.png')});
 await frame.getByRole('button',{name:'Adicionar',exact:true}).click();await frame.getByRole('group',{name:'Adicionar música'}).waitFor();
 await page.screenshot({path:path.join(folder,'04-no-frontend-menu.png')});
 console.log('OK: composição com navegação real do frontend; PNGs completo e menu aberto.');
}finally{await browser.close()}})().catch(error=>{console.error(error);process.exitCode=1});
