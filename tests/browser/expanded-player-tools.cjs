/** Footer navigation must not restart playback, discard album saves, or stop a download. */
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
const {createRequire}=require('node:module');
const {chromium}=createRequire(path.resolve(__dirname,'../../doomvault/package.json'))('playwright');
const {fixture}=require('./frontend-contracts.cjs');
(async()=>{
 const browser=await chromium.launch({...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{}),args:['--no-sandbox']});
 try{
  let posts=0,polls=0,complete=false,body;
  const f=await fixture(browser,{seed:{
   'bztune-settings-v1':JSON.stringify({startPage:'home',theme:'midnight',accent:'#ffb14e',autoUpdates:false}),
   'doomvault-listening-history-v11':JSON.stringify([{videoId:'old',title:'Uma música ouvida',artist:'Um artista',playedAt:Date.now()-1000}])
  },override:async(route,url)=>{
   if(url.pathname==='/api/library/auto-download'){
    posts++;body=route.request().postDataJSON();await route.fulfill({json:{id:'download1'}});return true;
   }
   if(url.pathname==='/api/library/auto-download/download1'){
    polls++;await route.fulfill({json:{id:'download1',status:complete?'complete':'downloading',completed:complete?1:0,total:1,current_title:'Faixa de Teste',errors:[]}});return true;
   }
  }});
  const page=f.page;
  const screenshot=async(name)=>{if(process.env.BZTUNE_PLAYER_PREVIEW_DIR){fs.mkdirSync(process.env.BZTUNE_PLAYER_PREVIEW_DIR,{recursive:true});await page.screenshot({path:path.join(process.env.BZTUNE_PLAYER_PREVIEW_DIR,name+'.png')});}};
  await page.evaluate(()=>{window.downloadUpdates=0;window.addEventListener('doomvault-library-updated',()=>window.downloadUpdates++);});
  await page.getByRole('button',{name:'Expandir player',exact:true}).click();
  const footer=page.getByRole('toolbar',{name:'Ferramentas do player expandido'});
  const tools=footer.getByRole('navigation',{name:'Ferramentas da música'});
  assert.deepEqual(await tools.getByRole('button').allTextContents(),['Letra','Fila','Equalizador','Histórico','Crossfade','Baixar','Mais']);
  assert.equal(await page.getByRole('region',{name:'Fila de reprodução',exact:true}).count(),0);
  await page.getByRole('region',{name:'Letras da música',exact:true}).waitFor();
  const before=await page.evaluate(()=>localStorage.getItem('doomvault-player-state-v11'));
  const video=page.locator('.bz32-video');await video.evaluate(e=>e.dataset.playerIdentity='preserved');
  const footerBox=await footer.boundingBox();
  await screenshot('01-letra');
  await tools.getByRole('button',{name:'Equalizador',exact:true}).click();
  const eq=page.getByRole('region',{name:'Equalizador',exact:true});await eq.waitFor();
  for(const label of ['Graves','Médios','Agudos'])assert.equal(await eq.getByRole('slider',{name:label,exact:true}).isDisabled(),true);
  assert.equal(await eq.getByRole('button',{name:'Ativar equalizador',exact:true}).isDisabled(),true);
  await screenshot('02-equalizador');
  await tools.getByRole('button',{name:'Histórico',exact:true}).click();
  await page.getByRole('region',{name:'Histórico de reprodução'}).getByText('Uma música ouvida',{exact:true}).waitFor();
  await screenshot('03-historico');
  await tools.getByRole('button',{name:'Crossfade',exact:true}).click();
  const crossfade=page.getByRole('slider',{name:'Duração da transição',exact:true});
  await crossfade.focus();await crossfade.press('Home');await crossfade.press('ArrowRight');await crossfade.press('ArrowRight');await crossfade.press('ArrowRight');
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('bztune-crossfade-v13'))),3);
  await screenshot('04-crossfade');
  await tools.getByRole('button',{name:'Mais',exact:true}).click();
  const add=page.getByRole('region',{name:'Adicionar à sua música',exact:true});
  await add.getByRole('button',{name:'Favoritado',exact:true}).click();
  assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('doomvault-favorites'))),[]);
  await add.getByRole('button',{name:'Favoritar álbum',exact:true}).click();
  assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('doomvault-favorites'))),['album1']);
  await add.getByRole('button',{name:'Na coleção',exact:true}).click();
  assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('doomvault-collection'))),[]);
  await add.getByRole('button',{name:'Adicionar álbum',exact:true}).click();
  await add.getByRole('button',{name:'Adicionar Faixa de Teste à playlist',exact:true}).click();
  await page.getByRole('dialog',{name:'Escolher playlist'}).getByRole('button',{name:'Playlist de Teste',exact:true}).waitFor();
  await screenshot('05-adicionar');
  await tools.getByRole('button',{name:'Baixar',exact:true}).click();
  const download=page.getByRole('region',{name:'Download da música',exact:true});
  await download.getByRole('button',{name:'Baixar música: Faixa de Teste',exact:true}).click();
  await download.getByText(/0\/1 concluída/).waitFor();assert.equal(posts,1);assert.equal(body.videoId,'abcdefghijk');
  await screenshot('06-download');
  await tools.getByRole('button',{name:'Equalizador',exact:true}).click();complete=true;
  await page.waitForFunction(()=>window.downloadUpdates===1);assert.ok(polls>=2);
  await tools.getByRole('button',{name:'Baixar',exact:true}).click();
  assert.equal(await download.getByRole('button',{name:'Download concluído: Faixa de Teste',exact:true}).isDisabled(),true);assert.equal(posts,1);
  assert.equal(await video.getAttribute('data-player-identity'),'preserved');
  assert.equal(await page.evaluate(()=>localStorage.getItem('doomvault-player-state-v11')),before);
  await page.locator('.bz-player-workspace-body').evaluate(e=>e.scrollTop=e.scrollHeight);
  const afterBox=await footer.boundingBox();assert.equal(afterBox.y,footerBox.y);assert.equal(afterBox.height,footerBox.height);
  await footer.getByRole('button',{name:'Voltar ao mini-player',exact:true}).click();
  await page.getByRole('button',{name:'Expandir player',exact:true}).waitFor();
  assert.deepEqual(f.errors,[]);console.log('PASS exact footer order, all tool views, album saves, retained player and background download');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
