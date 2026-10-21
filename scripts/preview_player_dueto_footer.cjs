/** Visual example of the selected Dueto layout; the production player is unchanged. */
const {createRequire}=require('node:module');const path=require('node:path');const fs=require('node:fs');const http=require('node:http');const assert=require('node:assert/strict');
const {chromium}=createRequire(path.resolve(__dirname,'../doomvault/package.json'))('playwright');
const folder=path.resolve(__dirname,'../docs/previews/player-dueto-footer');
(async()=>{
 const server=http.createServer((request,response)=>{const pathname=new URL(request.url,'http://localhost').pathname;const file=pathname==='/cover.svg'?'cover.svg':pathname==='/index.html'?'index.html':null;if(!file){response.writeHead(404);response.end();return}response.writeHead(200,{'Content-Type':file.endsWith('.svg')?'image/svg+xml':'text/html; charset=utf-8'});response.end(fs.readFileSync(path.join(folder,file)))});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const browser=await chromium.launch({...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{}),args:['--no-sandbox']});
 try{
  const page=await browser.newPage({viewport:{width:1600,height:1000},deviceScaleFactor:1});const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto('http://127.0.0.1:'+server.address().port+'/index.html?layout=a');
  await page.waitForFunction(()=>Array.from(document.images).every(image=>image.complete));
  await page.screenshot({path:path.join(folder,'01-dueto-rodape.png')});
  await page.getByRole('button',{name:'Adicionar',exact:true}).click();
  for(const name of ['Adicionar à playlist','Favoritos','Coleção'])await page.getByRole('group',{name:'Adicionar música'}).getByRole('button',{name,exact:true}).waitFor();
  await page.screenshot({path:path.join(folder,'02-menu-adicionar.png')});
  await page.getByRole('button',{name:'Favoritos',exact:true}).click();assert.equal(await page.getByRole('button',{name:'Favoritos',exact:true}).getAttribute('aria-pressed'),'true');
  await page.getByRole('button',{name:'Coleção',exact:true}).click();assert.equal(await page.getByRole('button',{name:'Coleção',exact:true}).getAttribute('aria-pressed'),'true');
  await page.keyboard.press('Escape');assert.equal(await page.getByRole('button',{name:'Adicionar',exact:true}).getAttribute('aria-expanded'),'false');
  await page.getByRole('button',{name:'Shuffle',exact:true}).click();assert.equal(await page.getByRole('button',{name:'Shuffle',exact:true}).getAttribute('aria-pressed'),'true');
  const loop=page.getByRole('button',{name:'Loop',exact:true});for(const expected of ['all','one','off']){await loop.click();assert.equal(await loop.getAttribute('data-loop'),expected)}
  await page.getByRole('button',{name:'Adicionar',exact:true}).click();await page.getByRole('group',{name:'Adicionar música'}).getByRole('button',{name:'Adicionar à playlist',exact:true}).click();await page.getByRole('heading',{name:'Adicionar à playlist',exact:true}).waitFor();
  assert.deepEqual(errors,[]);console.log('OK: PNGs; Shuffle; Loop off/all/one; menu + com playlist, Favoritos e Coleção.');
 }finally{await browser.close();server.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
