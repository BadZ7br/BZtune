/** Local artist/edition UI through a simulated native bridge. Native identity and empty collection are tested in Kotlin. */
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
const {createRequire}=require('node:module');
const {chromium}=createRequire(path.resolve(__dirname,'../../doomvault/package.json'))('playwright');
const navigation=require('./navigation-helpers.cjs');
(async()=>{
 const browser=await chromium.launch({...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{}),args:['--no-sandbox']});
 try{
  const page=await browser.newPage({viewport:{width:380,height:844}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{
   window.commands=[];window.badDetail=sessionStorage.getItem('badDetail')==='1';window.failDetail=false;window.failArtists=false;
   const names=['Ação 日本語','Kyuss',...Array.from({length:51},(_,i)=>'Artista '+i)];
   window.records=[{id:'old',title:'Horizonte',artist:'Ação 日本語',year:'2000',count:1,favorite:false,collected:false},{id:'new',title:'Horizonte',artist:'Ação 日本語',year:'2024',count:1,favorite:false,collected:false},{id:'empty',title:'Coleção sem arquivos',artist:'Kyuss',year:'1991',count:0,favorite:false,collected:true}];
   const tracks=[{id:'a',title:'Depois do Sol',artist:'Ação 日本語',album:'Horizonte',year:'2000',favorite:false,duration:120000,cover:null,albumId:'old'},{id:'b',title:'Depois do Sol (2024)',artist:'Ação 日本語',album:'Horizonte',year:'2024',favorite:false,duration:120000,cover:null,albumId:'new'}];
   const player={title:'Depois do Sol',hasTrack:true,playing:true,loading:false,position:10000,duration:120000,failed:false,queue:[{id:'entry',title:'Depois do Sol'}],index:0,shuffle:false,repeat:0,canNext:false,canPrevious:false};
   window.__TAURI__={core:{invoke:async(name,args)=>{
    const cmd=name.split('|')[1];window.commands.push({cmd,args});
    if(cmd==='library_list'&&args?.home)return {total:0,recentTotal:0,favoriteTotal:0,recent:[],favorites:[]};
    if(cmd==='library_list'){
     if(window.failArtists&&!args.artist&&!args.album)throw Error('Falha simulada no catálogo.');
     const items=tracks.filter(t=>(!args.artist||t.artist===args.artist)&&(!args.album||t.albumId===args.album)&&(!args.query||t.title.includes(args.query))&&(!args.favoritesOnly||t.favorite));
     return {items,total:items.length,page:0,pageSize:50,artists:names,albums:[]};
    }
    if(cmd==='albums'){
     const r=args.request;
     if(r.action==='detail'){
      if(window.failDetail)throw Error('Detalhe temporariamente indisponível.');
      if(window.badDetail)return {items:[{...window.records[0],id:'wrong'}],total:1,page:0,pageSize:50,artists:[]};
      const items=window.records.filter(a=>a.id===r.id);return {items:items.map(a=>({...a})),total:items.length,page:0,pageSize:50,artists:names};
     }
     if(r.action==='mark'){
      const a=window.records.find(a=>a.id===r.id);if(!a||a.favorite!==r.expectedFavorite||a.collected!==r.expectedCollected)throw Error('O álbum mudou.');
      Object.assign(a,{favorite:r.favorite,collected:r.collected});
     }
     const items=window.records.filter(a=>(!r.artist||r.artist===a.artist)&&(!r.query||a.title.includes(r.query))&&(r.filter!=='favorites'||a.favorite)&&(r.filter!=='collection'||a.collected));return {items:items.map(a=>({...a})),total:items.length,page:0,pageSize:50,artists:names};
    }
    if(cmd==='library_play'||cmd==='library_enqueue')return {...player};
    if(cmd==='library_favorite'){tracks.find(t=>t.id===args.id).favorite=args.favorite;return {updated:true};}
    if(cmd==='track_details')return {id:args.id,artist:'Ação 日本語',album:'Horizonte',cover:null};
    return {...player,queue:[...player.queue]};
   }}};
  });
  await page.goto('http://127.0.0.1:1420/mobile.html');await navigation.library(page,'Artistas');
  const artists=page.getByRole('region',{name:'Artistas locais',exact:true});await artists.getByText('53 artista(s) na biblioteca',{exact:true}).waitFor();
  assert.equal(await artists.locator('.artist-list>li').count(),50);
  if(process.env.BZTUNE_CAPTURE_DIR){fs.mkdirSync(process.env.BZTUNE_CAPTURE_DIR,{recursive:true});await page.screenshot({path:path.join(process.env.BZTUNE_CAPTURE_DIR,'artistas.png')});}
  await artists.getByRole('button',{name:'Próximos artistas',exact:true}).click();assert.equal(await artists.locator('.artist-list>li').count(),3);
  await artists.getByRole('searchbox',{name:'Buscar artistas',exact:true}).fill('acao');assert.equal(await artists.locator('.artist-list>li').count(),1);
  await artists.getByRole('button',{name:'Abrir artista Ação 日本語',exact:true}).click();
  const artist=page.getByRole('region',{name:'Detalhes do artista',exact:true});await artist.getByRole('heading',{name:'Ação 日本語',exact:true}).waitFor();
  await artist.getByText('2 música(s) nesta consulta.',{exact:true}).waitFor();assert.equal(await artist.locator('.album-grid>li').count(),2);
  if(process.env.BZTUNE_CAPTURE_DIR){fs.mkdirSync(process.env.BZTUNE_CAPTURE_DIR,{recursive:true});await page.screenshot({path:path.join(process.env.BZTUNE_CAPTURE_DIR,'artista.png')});}
  await artist.getByRole('button',{name:'Abrir álbum Horizonte 2024',exact:true}).click();
  const album=page.getByRole('region',{name:'Detalhes do álbum',exact:true});await album.getByRole('heading',{name:'Horizonte',exact:true}).waitFor();
  await album.getByText('1 música(s) nesta consulta.',{exact:true}).waitFor();assert.equal(await album.getByRole('button',{name:'Tocar agora Depois do Sol',exact:true}).count(),0);
  await album.getByRole('button',{name:'Tocar agora Depois do Sol (2024)',exact:true}).waitFor();
  assert.equal(await album.getByRole('button',{name:'Filtrar biblioteca',exact:true}).count(),0,'detail cannot clear its album identity');
  await page.reload();await album.getByText('1 música(s) nesta consulta.',{exact:true}).waitFor();
  const favorite=album.getByRole('button',{name:'Favoritar álbum Horizonte 2024',exact:true});await favorite.waitFor();await favorite.click();
  await page.waitForFunction(()=>window.records.find(a=>a.id==='new').favorite);
  await page.waitForFunction(()=>document.querySelector('.detail-marks button')?.getAttribute('aria-pressed')==='true');
  assert.equal(await page.evaluate(()=>window.records.find(a=>a.id==='old').favorite),false);
  const before=await page.evaluate(()=>window.commands.filter(c=>['play','pause','choose','library_play','library_enqueue','seek'].includes(c.cmd)).length);assert.equal(before,0,'browsing and album marks must not change playback');
  if(process.env.BZTUNE_CAPTURE_DIR)await page.screenshot({path:path.join(process.env.BZTUNE_CAPTURE_DIR,'album.png')});
  await album.getByRole('searchbox',{name:'Buscar músicas',exact:true}).fill('inexistente');await album.getByText('0 música(s) nesta consulta.',{exact:true}).waitFor();
  await album.getByRole('searchbox',{name:'Buscar músicas',exact:true}).fill('');await album.getByText('1 música(s) nesta consulta.',{exact:true}).waitFor();
  await album.getByRole('button',{name:'Tocar agora Depois do Sol (2024)',exact:true}).click();await page.waitForFunction(()=>window.commands.some(c=>c.cmd==='library_play'&&c.args.id==='b'));
  await navigation.trackAction(page,'Depois do Sol (2024)','Adicionar Depois do Sol (2024) à fila');await page.waitForFunction(()=>window.commands.some(c=>c.cmd==='library_enqueue'&&c.args.id==='b'));
  await page.goBack();await artist.waitFor();await page.goBack();await artists.waitFor();
  assert.equal(await artists.getByRole('searchbox',{name:'Buscar artistas',exact:true}).inputValue(),'acao');
  await navigation.library(page,'Álbuns');const grid=page.getByRole('region',{name:'Álbuns e coleção',exact:true});await grid.getByText('3 álbum(ns) nesta consulta.',{exact:true}).waitFor();
  if(process.env.BZTUNE_CAPTURE_DIR)await page.screenshot({path:path.join(process.env.BZTUNE_CAPTURE_DIR,'albuns.png')});
  await grid.getByRole('button',{name:'Abrir álbum Coleção sem arquivos 1991',exact:true}).click();await album.getByText('0 música(s) nesta consulta.',{exact:true}).waitFor();
  assert.equal(await album.getByRole('button',{name:'Colecionar álbum Coleção sem arquivos 1991',exact:true}).getAttribute('aria-pressed'),'true');
  await page.evaluate(()=>{window.badDetail=true;sessionStorage.setItem('badDetail','1');});await page.reload();await album.getByRole('alert').filter({hasText:'incompatíveis'}).waitFor();assert.equal(await album.locator('.detail-marks').count(),0);
  await page.evaluate(()=>{window.badDetail=false;sessionStorage.removeItem('badDetail');window.failDetail=true;});await album.getByRole('button',{name:'Recarregar álbum',exact:true}).click();await album.getByRole('alert').filter({hasText:'temporariamente'}).waitFor();
  await page.evaluate(()=>{window.failDetail=false;});await album.getByRole('button',{name:'Recarregar álbum',exact:true}).click();await album.locator('.detail-marks').waitFor();
  await page.setViewportSize({width:320,height:568});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await navigation.library(page,'Artistas');await page.evaluate(()=>{window.failArtists=true;});await navigation.nav(page,'Início');await navigation.library(page,'Artistas');await artists.getByRole('alert').waitFor();
  await page.evaluate(()=>{window.failArtists=false;});await artists.getByRole('button',{name:'Recarregar artistas',exact:true}).click();await artists.getByRole('alert').waitFor({state:'hidden'});
  await page.evaluate(()=>history.replaceState({...history.state,detail:{kind:'album',album:{id:'invalid'}}},''));await page.reload();
  await page.getByRole('navigation',{name:'Categorias da biblioteca',exact:true}).waitFor();assert.equal(await page.locator('.local-detail').count(),0,'malformed saved detail must not be rendered');
  assert.deepEqual(errors,[]);console.log('PASS local artists pagination/Unicode/retry, artist-album-back/reload, exact edition tracks and marks, cache-free detail validation, empty collection, fixed filters, play/enqueue and narrow screen');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
