const navigation=require('./navigation-helpers.cjs');
const assert=require('node:assert/strict'),path=require('node:path');
const {createRequire}=require('node:module');
const {chromium}=createRequire(path.resolve(__dirname,'../../doomvault/package.json'))('playwright');
(async()=>{
 const browser=await chromium.launch({...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{}),args:['--no-sandbox']});
 try {
  const page=await browser.newPage({viewport:{width:320,height:820}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{
   const records=JSON.parse(sessionStorage.getItem('albums')||'null')||[{id:'edition-2000',title:'Ação',artist:'Artista',year:'2000',favorite:false,collected:false,count:1},{id:'edition-2024',title:'Ação',artist:'Artista',year:'2024',favorite:false,collected:false,count:1},{id:'japan',title:'日本語',artist:'Outro',year:'2026',favorite:false,collected:false,count:0}];
   const tracks=[{id:'song-1',title:'Original',artist:'Artista',album:'Ação',year:'2000',favorite:false,duration:120000,cover:null},{id:'song-2',title:'Remaster',artist:'Artista',album:'Ação',year:'2024',favorite:false,duration:120000,cover:null}];
   const fold=s=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
   const result=r=>{const list=records.filter(a=>(!r.query||fold(`${a.title} ${a.artist} ${a.year}`).includes(fold(r.query)))&&(!r.artist||r.artist===a.artist)&&(r.filter!=='favorites'||a.favorite)&&(r.filter!=='collection'||a.collected));return {items:list,total:list.length,page:0,pageSize:50,artists:['Artista','Outro']};};
   window.commands=[];
   window.__TAURI__={core:{invoke:async(name,args)=>{
    const cmd=name.split('|')[1];window.commands.push({cmd,args});
    if(cmd==='albums') {
     const r=args.request;
     if(r.action==='detail'){const items=records.filter(a=>a.id===r.id);return {items,total:items.length,page:0,pageSize:50,artists:[]};}
     if(r.action==='mark'){
      if(window.failAlbum)throw Error('O álbum mudou. Recarregue antes de tentar novamente.');
      Object.assign(records.find(a=>a.id===r.id),{favorite:r.favorite,collected:r.collected});sessionStorage.setItem('albums',JSON.stringify(records));
     }
     if(r.query==='bad')return {...result({...r,query:''}),items:[null]};
     if(r.query==='slow')return new Promise(resolve=>{window.releaseAlbums=()=>{window.oldReleased=true;resolve(result({...r,query:''}));};});
     return result(r);
    }
    if(cmd==='track_details')return {id:args.id,artist:'Artista',album:'Disco',cover:null};
    if(cmd==='library_list'&&args?.home)return {total:0,recentTotal:0,favoriteTotal:0,recent:[],favorites:[]};
    if(cmd==='library_list') {
     const items=tracks.filter(t=>(!args.album||args.album==='edition-'+t.year)&&(!args.artist||args.artist===t.artist));
     return {items,total:items.length,page:0,pageSize:50,artists:['Artista'],albums:records.slice(0,2).map(a=>({id:a.id,label:a.title+' '+a.year}))};
    }
    if(cmd==='playlists')return {playlists:[],selected:null};
    return {title:'Original',hasTrack:true,playing:true,loading:false,position:0,duration:120000,failed:false,queue:[{id:'queue',title:'Original'}],index:0,shuffle:false,repeat:0,canNext:false,canPrevious:false};
   }}};
  });
  await page.goto('http://127.0.0.1:1420/mobile.html');
  await navigation.library(page,'Álbuns');
  const panel=page.getByRole('region',{name:'Álbuns e coleção',exact:true}),library=page.getByRole('region',{name:'Biblioteca local',exact:true});
  await panel.getByText('3 álbum(ns) nesta consulta.',{exact:true}).waitFor();
  await navigation.albumAction(page,'Ação','2000','Favoritar álbum Ação 2000');
  await navigation.expectAlbumMark(page,'edition-2000','favorite',true);
  await navigation.expectAlbumMark(page,'edition-2024','favorite',false);
  await navigation.library(page);
  await navigation.expectFavorite(page,'Original',false);
  await navigation.library(page,'Álbuns');
  await navigation.albumAction(page,'Ação','2000','Colecionar álbum Ação 2000');
  await panel.getByRole('button',{name:'Coleção',exact:true}).click();
  await panel.getByText('1 álbum(ns) nesta consulta.',{exact:true}).waitFor();
  await navigation.albumAction(page,'Ação','2000','Ver músicas de Ação 2000');
  await page.getByRole('region',{name:'Detalhes do álbum',exact:true}).getByRole('heading',{name:'Ação',exact:true}).waitFor();
  await library.getByText('1 música(s) nesta consulta.',{exact:true}).waitFor();
  assert.equal(await library.locator('.library-tracks>li').count(),1);
  await page.goBack();await panel.getByText('1 álbum(ns) nesta consulta.',{exact:true}).waitFor();
  await navigation.library(page,'Álbuns');
  await navigation.albumAction(page,'Ação','2000','Ver artista Artista');
  await page.getByRole('region',{name:'Detalhes do artista',exact:true}).getByRole('heading',{name:'Artista',exact:true}).waitFor();
  await page.waitForFunction(()=>window.commands.some(c=>c.cmd==='library_list'&&c.args.artist==='Artista'));
  await page.reload();await navigation.library(page,'Álbuns');
  await panel.getByRole('button',{name:'Coleção',exact:true}).click();
  await panel.getByText('1 álbum(ns) nesta consulta.',{exact:true}).waitFor();
  await navigation.albumAction(page,'Ação','2000','Colecionar álbum Ação 2000');
  await panel.getByText('0 álbum(ns) nesta consulta.',{exact:true}).waitFor();
  await panel.getByRole('button',{name:'Álbuns favoritos',exact:true}).click();
  await panel.getByText('1 álbum(ns) nesta consulta.',{exact:true}).waitFor();
  await panel.getByRole('button',{name:'Todos os álbuns',exact:true}).click();
  await page.evaluate(()=>{window.failAlbum=true;});
  await navigation.albumAction(page,'Ação','2024','Colecionar álbum Ação 2024');
  await panel.getByRole('alert').filter({hasText:'O álbum mudou'}).waitFor();
  await navigation.expectAlbumMark(page,'edition-2024','collected',false);
  await page.evaluate(()=>{window.failAlbum=false;});
  await panel.getByRole('button',{name:'Recarregar álbuns',exact:true}).click();
  await panel.getByRole('searchbox',{name:'Buscar álbuns',exact:true}).fill('bad');
  await panel.getByRole('alert').filter({hasText:'Resposta inválida'}).waitFor();
  assert.equal(await panel.locator('.album-list>li').count(),3);
  await panel.getByRole('searchbox',{name:'Buscar álbuns',exact:true}).fill('slow');
  await page.waitForFunction(()=>typeof window.releaseAlbums==='function');
  await panel.getByRole('searchbox',{name:'Buscar álbuns',exact:true}).fill('日本語');
  await panel.getByText('1 álbum(ns) nesta consulta.',{exact:true}).waitFor();
  await page.evaluate(()=>window.releaseAlbums());
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  assert.equal(await panel.locator('.album-list>li').count(),1);
  await panel.getByRole('button',{name:'Opções do álbum 日本語 2026',exact:true}).click();
  const empty=page.getByRole('dialog',{name:'日本語 (2026)',exact:true});assert.equal(await empty.getByRole('button',{name:'Ver músicas de 日本語 2026',exact:true}).isDisabled(),true);
  await empty.getByRole('button',{name:'Fechar opções',exact:true}).click();await empty.waitFor({state:'hidden'});
  assert.equal(await navigation.queueCount(page,1).isVisible(),true);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);assert.deepEqual(errors,[]);
  await page.close();console.log('PASS mobile albums editions, favorite/collection independence, persistence, music/artist filters, invalid replies, stale responses and unavailable local tracks');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
