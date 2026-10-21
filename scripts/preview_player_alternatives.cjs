/** Capture visual prototypes. Does not use the production player or real media. */
const {createRequire}=require('node:module');
const path=require('node:path');const fs=require('node:fs');const assert=require('node:assert/strict');const http=require('node:http');
const {chromium}=createRequire(path.resolve(__dirname,'../doomvault/package.json'))('playwright');
const folder=path.resolve(__dirname,'../docs/previews/player-alternatives');
const screenshots=[['a','01-dueto.png'],['b','02-imersivo.png'],['c','03-compacto.png']];
(async()=>{
 const server=http.createServer((request,response)=>{const pathname=new URL(request.url,'http://localhost').pathname;const file=pathname==='/cover.svg'?'cover.svg':pathname==='/index.html'?'index.html':null;if(!file){response.writeHead(404);response.end();return;}response.writeHead(200,{'Content-Type':file.endsWith('.svg')?'image/svg+xml':'text/html; charset=utf-8'});response.end(fs.readFileSync(path.join(folder,file)));});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const base='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{}),args:['--no-sandbox']});
 try{for(const [layout,file] of screenshots){
  const page=await browser.newPage({viewport:{width:1600,height:1000},deviceScaleFactor:1});const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+'/index.html?layout='+layout);
  if(layout!=='b')await page.locator('.art:visible').first().waitFor();
  await page.waitForFunction(()=>Array.from(document.images).every(img=>img.complete));
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.screenshot({path:path.join(folder,file)});
  await page.getByRole('button',{name:'Pausar',exact:true}).click();await page.getByRole('button',{name:'Reproduzir',exact:true}).waitFor();
  await page.getByRole('button',{name:'Mais opções',exact:true}).click();
  for(const name of ['Adicionar à playlist','Downloads e biblioteca','Vídeo e alternativas','Aleatório, repetição e volume','Equalizador','Crossfade','Histórico','Opções da letra','Voltar ao mini-player','Parar e fechar player']){
   assert.equal(await page.locator('#menu').getByRole('button',{name,exact:true}).count(),1,name);
  }
  if(layout==='a')await page.screenshot({path:path.join(folder,'04-menu-de-funcoes.png')});
  await page.getByRole('button',{name:'Equalizador',exact:true}).click();await page.getByRole('slider',{name:'Graves',exact:true}).waitFor();
  await page.getByRole('button',{name:'Fechar painel',exact:true}).click();
  await page.getByRole('button',{name:layout==='c'?'Fila 7':'Abrir fila',exact:true}).click();
  await page.getByRole('heading',{name:'Fila de reprodução',exact:true}).waitFor();
  await page.getByRole('button',{name:'Remover Passagem',exact:true}).focus();await page.getByRole('button',{name:'Remover Passagem',exact:true}).click();
  assert.equal(await page.locator('.queue-item').count(),6);
  await page.getByRole('button',{name:'Fechar painel',exact:true}).click();
  await page.setViewportSize({width:960,height:640});
  const bounds=await page.locator('.frame').boundingBox();
  assert.ok(bounds.y+bounds.height<=641,'frame must fit compact desktop');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  assert.deepEqual(errors,[]);
  console.log(layout,file,'OK: PNG, transport, all function entries, equalizer panel and queue controls');await page.close();
 }}finally{await browser.close();server.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
