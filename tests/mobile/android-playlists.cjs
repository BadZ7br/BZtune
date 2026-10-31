/** Browser integration uses an explicit native bridge fixture; SQL, migration and backup are tested in Kotlin. */
const assert=require('node:assert/strict'),path=require('node:path');
const {createRequire}=require('node:module');
const {chromium}=createRequire(path.resolve(__dirname,'../../doomvault/package.json'))('playwright');
(async()=>{
 const browser=await chromium.launch({...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{}),args:['--no-sandbox']});
 try {
  const page=await browser.newPage({viewport:{width:320,height:820}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{
   const tracks=[{id:'one',title:'Ação',artist:'Artista',album:'Disco',year:'2000',duration:120000,cover:null,favorite:true},{id:'two',title:'日本語',artist:'Artista',album:'Disco',year:'2026',duration:130000,cover:null,favorite:false}];
   let saved=JSON.parse(sessionStorage.getItem('playlists')||'[]'),seq=0;
   const player={title:'Original',hasTrack:true,playing:true,loading:false,position:0,duration:120000,failed:false,queue:[{id:'original',title:'Original'}],index:0,shuffle:false,repeat:0,canNext:false,canPrevious:false};
   const result=id=>({playlists:saved.map(p=>({id:p.id,name:p.name,revision:p.revision,count:p.ids.length})),selected:saved.filter(p=>p.id===id).map(p=>({id:p.id,name:p.name,revision:p.revision,count:p.ids.length,tracks:p.ids.map(id=>{const t=tracks.find(t=>t.id===id);return {id:t.id,title:t.title,artist:t.artist,album:t.album};})}))[0]||null});
   window.commands=[];
   window.__TAURI__={core:{invoke:async(name,args)=>{
    const cmd=name.split('|')[1];window.commands.push({cmd,args});
    if(cmd==='library_list')return {items:tracks,total:tracks.length,page:0,pageSize:50,artists:['Artista'],albums:[]};
    if(cmd==='playlists'){
     const r=args.request;
     if(r.action==='list')return window.invalidPlaylists?{playlists:[null],selected:null}:result(r.id);
     if(window.forceConflict)throw Error('A playlist ou biblioteca mudou. Recarregue antes de tentar novamente.');
     let p=saved.find(p=>p.id===r.id);
     if(r.action==='create'){p={id:'playlist-'+Date.now(),name:r.name.trim(),revision:0,ids:[]};saved.push(p);}
     if(r.action==='rename')p.name=r.name.trim();
     if(r.action==='add'&&!p.ids.includes(r.trackId))p.ids.push(r.trackId);
     if(r.action==='remove')p.ids=p.ids.filter(id=>id!==r.trackId);
     if(r.action==='reorder')p.ids=r.trackIds;
     if(r.action==='delete')saved=saved.filter(x=>x.id!==p.id);
     if(r.action!=='create')p.revision++;
     sessionStorage.setItem('playlists',JSON.stringify(saved));return result(p.id);
    }
    if(cmd==='playlist_play'||cmd==='playlist_enqueue'){
     if(window.unavailable)throw Error('Arquivo indisponível ou acesso revogado.');
     const p=saved.find(p=>p.id===args.id);const entries=p.ids.map(id=>({id:'entry-'+seq++,title:tracks.find(t=>t.id===id).title}));
     if(cmd==='playlist_play'){player.queue=entries;player.index=0;player.title=entries[0].title;player.playing=true;}
     else player.queue.push(...entries);
     player.hasTrack=true;player.canNext=player.queue.length>1;
    }
    return {...player,queue:[...player.queue]};
   }}};
  });
  await page.goto('http://127.0.0.1:1420/mobile.html');
  let panel=page.getByRole('region',{name:'Playlists locais',exact:true});const library=page.getByRole('region',{name:'Biblioteca local',exact:true});
  await panel.getByText('Nenhuma playlist criada.',{exact:false}).waitFor();
  await panel.getByRole('textbox',{name:'Nome da nova playlist',exact:true}).fill('Ação 日本語');
  await panel.getByRole('button',{name:'Criar playlist',exact:true}).click();
  await panel.getByRole('heading',{name:'Ação 日本語',exact:true}).waitFor();
  assert.equal(await panel.getByRole('button',{name:'Tocar playlist',exact:true}).isDisabled(),true);
  for(const title of ['Ação','日本語']) {
   await library.getByRole('button',{name:`Adicionar ${title} à playlist`,exact:true}).click();
   await panel.getByRole('button',{name:'Adicionar música selecionada',exact:true}).click();
   await panel.getByRole('status').filter({hasText:'Música adicionada'}).waitFor();
  }
  await panel.locator('.playlist-detail li').nth(1).waitFor();
  await library.getByRole('button',{name:'Adicionar Ação à playlist',exact:true}).click();
  assert.equal(await panel.getByRole('button',{name:'Adicionar música selecionada',exact:true}).isDisabled(),true);
  await panel.getByRole('button',{name:'Cancelar seleção da música',exact:true}).click();
  await panel.getByRole('button',{name:'Subir 日本語 na playlist',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('.playlist-detail li strong')?.textContent==='日本語');
  await panel.getByRole('textbox',{name:'Renomear playlist',exact:true}).fill('Minha seleção');
  await panel.getByRole('button',{name:'Salvar nome',exact:true}).click();
  await panel.getByRole('heading',{name:'Minha seleção',exact:true}).waitFor();
  const id=await panel.getByRole('combobox',{name:'Playlist',exact:true}).inputValue();
  await page.reload();panel=page.getByRole('region',{name:'Playlists locais',exact:true});
  await panel.getByRole('combobox',{name:'Playlist',exact:true}).selectOption(id);
  await panel.getByRole('heading',{name:'Minha seleção',exact:true}).waitFor();
  assert.equal(await panel.locator('.playlist-detail li strong').first().textContent(),'日本語');
  await panel.getByRole('button',{name:'Tocar playlist',exact:true}).click();
  await page.getByRole('heading',{name:'Fila · 2',exact:true}).waitFor();
  await page.getByRole('heading',{name:'日本語',exact:true}).waitFor();
  await panel.getByRole('button',{name:'Adicionar playlist à fila',exact:true}).click();
  await page.getByRole('heading',{name:'Fila · 4',exact:true}).waitFor();
  await page.evaluate(()=>{window.unavailable=true;});
  await panel.getByRole('button',{name:'Tocar playlist',exact:true}).click();
  await panel.getByRole('alert').filter({hasText:'Arquivo indisponível'}).waitFor();
  assert.equal(await page.getByRole('heading',{name:'Fila · 4',exact:true}).isVisible(),true);
  await page.evaluate(()=>{window.unavailable=false;window.forceConflict=true;});
  await panel.getByRole('textbox',{name:'Renomear playlist',exact:true}).fill('Não deve salvar');
  await panel.getByRole('button',{name:'Salvar nome',exact:true}).click();
  await panel.getByRole('alert').filter({hasText:'A playlist ou biblioteca mudou'}).waitFor();
  await page.evaluate(()=>{window.forceConflict=false;});
  await panel.getByRole('button',{name:'Recarregar playlists',exact:true}).click();
  await panel.getByRole('button',{name:'Remover Ação da playlist',exact:true}).click();
  await page.waitForFunction(()=>document.querySelectorAll('.playlist-detail li').length===1);
  assert.equal(await page.getByRole('heading',{name:'Fila · 4',exact:true}).isVisible(),true);
  await page.evaluate(()=>{window.invalidPlaylists=true;});
  // Trigger a fresh read via the existing recoverable error flow.
  await panel.getByRole('combobox',{name:'Playlist',exact:true}).selectOption('');
  await panel.getByRole('alert').filter({hasText:'Resposta inválida'}).waitFor();
  await page.evaluate(()=>{window.invalidPlaylists=false;});
  await panel.getByRole('button',{name:'Recarregar playlists',exact:true}).click();
  await panel.getByRole('combobox',{name:'Playlist',exact:true}).selectOption(id);
  await panel.getByRole('button',{name:'Excluir playlist',exact:true}).click();
  await panel.getByRole('button',{name:'Cancelar exclusão',exact:true}).click();
  assert.equal(await panel.getByRole('heading',{name:'Minha seleção',exact:true}).isVisible(),true);
  await panel.getByRole('button',{name:'Excluir playlist',exact:true}).click();
  await panel.getByRole('button',{name:'Confirmar exclusão',exact:true}).click();
  await panel.getByText('Nenhuma playlist criada.',{exact:false}).waitFor();
  assert.equal(await page.getByRole('heading',{name:'Fila · 4',exact:true}).isVisible(),true);
  assert.equal(await library.locator('.library-tracks>li').count(),2);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  assert.deepEqual(errors,[]);await page.close();
  console.log('PASS mobile playlists create, add, deduplicate, reorder, rename, reopen, play/enqueue, unavailable files, conflicts, invalid replies and safe deletion');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
