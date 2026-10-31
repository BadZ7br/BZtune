const navigation=require('./navigation-helpers.cjs');
/** UI integration with explicit simulated Android bridge; SQLite is tested separately on API 24 shadows. */
const assert=require('node:assert/strict'),path=require('node:path');
const {createRequire}=require('node:module');
const {chromium}=createRequire(path.resolve(__dirname,'../../doomvault/package.json'))('playwright');
(async()=>{
 const browser=await chromium.launch({...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{}),args:['--no-sandbox']});
 try {
  const page=await browser.newPage({viewport:{width:360,height:820}});const errors=[],requests=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>requests.push(r.url()));
  await page.addInitScript(()=>{
   window.libStore=JSON.parse(sessionStorage.getItem('library')||'null')||Array.from({length:51},(_,i)=>({id:'file-'+i,title:i===0?'Ação':'Música '+i,artist:'Artista A',album:'Disco',year:i%2?'2020':'2000',duration:120000,favorite:false,cover:null}));
   window.calls=[];window.slowFinished=false;window.failPlay=false;window.cancelImport=false;let seq=0;
   const player={title:'Escolha uma música',hasTrack:false,playing:false,loading:false,position:0,duration:0,failed:false,queue:[],index:-1,shuffle:false,repeat:0,canNext:false,canPrevious:false};
   const result=(args={})=>{
    let list=window.libStore.filter(t=>(!args.query||t.title.toLowerCase().includes(args.query==='acao'?'ação':args.query))&&(!args.favoritesOnly||t.favorite)&&(!args.artist||t.artist===args.artist)&&(!args.album||'album-'+t.year===args.album));
    const page=Math.min(args.page||0,Math.floor(Math.max(0,list.length-1)/50));
    return {items:list.slice(page*50,page*50+50),total:list.length,page,pageSize:50,artists:['Artista A'],albums:[{id:'album-2000',label:'Disco · 2000'},{id:'album-2020',label:'Disco · 2020'}]};
   };
   window.__TAURI__={core:{invoke:async(name,args)=>{
    const command=name.split('|')[1];window.calls.push({command,args});
    if(command==='snapshot'&&window.holdSnapshot){
     window.holdSnapshot=false;const old={...player,queue:[...player.queue]};
     return new Promise(resolve=>{window.releaseSnapshot=()=>{resolve(old);window.snapshotReleased=true;};});
    }
    if(command==='playlists')return {playlists:[],selected:null};
    if(command==='albums')return {items:[],total:0,page:0,pageSize:50,artists:[]};
    if(command==='track_details')return {id:args.id,artist:'Artista',album:'Disco',cover:null};
    if(command==='library_list'){
     if(args.query==='slow')return new Promise(resolve=>setTimeout(()=>{window.slowFinished=true;resolve(result({}));},800));
     if(args.query==='bad')return {...result({}),items:[null]};
     return result(args);
    }
    if(command==='import_library'){
     if(window.cancelImport)return {cancelled:true};
     window.libStore=window.libStore.slice(0,2);sessionStorage.setItem('library',JSON.stringify(window.libStore));return {...result({}),imported:2};
    }
    if(command==='library_favorite'){
     if(window.failFavorite)return {updated:false};
     const track=window.libStore.find(t=>t.id===args.id);track.favorite=args.favorite;
     sessionStorage.setItem('library',JSON.stringify(window.libStore));return {updated:true};
    }
    if(command==='library_forget'){window.libStore=window.libStore.filter(t=>t.id!==args.id);sessionStorage.setItem('library',JSON.stringify(window.libStore));return {removed:true};}
    if(command==='library_play'||command==='library_enqueue'){
     if(window.failPlay)throw Error('Arquivo indisponível ou acesso revogado.');
     const track=window.libStore.find(t=>t.id===args.id);
     const entry={id:'entry-'+seq++,title:track.title};
     if(command==='library_play'){player.queue=[entry];player.index=0;player.title=track.title;player.playing=true;}
     else player.queue.push(entry);
     player.hasTrack=true;player.duration=120000;player.canNext=player.queue.length>1;
    }
    return {...player,queue:[...player.queue]};
   }}};
  });
  await page.goto('http://127.0.0.1:1420/mobile.html');
  await navigation.library(page);
  const library=page.getByRole('region',{name:'Biblioteca local',exact:true});
  await library.getByText('51 música(s) nesta consulta.',{exact:true}).waitFor();
  assert.equal(await library.locator('.library-tracks>li').count(),50);
  await library.getByRole('button',{name:'Próxima página',exact:true}).click();
  await library.getByText('Página 2',{exact:true}).waitFor();assert.equal(await library.locator('.library-tracks>li').count(),1);
  await library.getByRole('searchbox',{name:'Buscar músicas',exact:true}).fill('slow');
  await page.waitForFunction(()=>window.calls.some(c=>c.command==='library_list'&&c.args.query==='slow'));
  await library.getByRole('searchbox',{name:'Buscar músicas',exact:true}).fill('acao');
  await library.getByText('1 música(s) nesta consulta.',{exact:true}).waitFor();
  await page.waitForFunction(()=>window.slowFinished);
  assert.equal(await library.locator('.library-tracks>li').count(),1);await library.getByText('Ação',{exact:true}).waitFor();
  await library.getByRole('searchbox',{name:'Buscar músicas',exact:true}).fill('bad');
  await library.getByRole('alert').filter({hasText:'Resposta inválida'}).waitFor();assert.equal(await library.locator('.library-tracks>li').count(),1);
  await library.getByRole('searchbox',{name:'Buscar músicas',exact:true}).fill('');
  await library.getByText('51 música(s) nesta consulta.',{exact:true}).waitFor();
  await library.getByRole('combobox',{name:'Artista',exact:true}).selectOption('Artista A');
  await library.getByRole('combobox',{name:'Álbum',exact:true}).selectOption('album-2020');
  await library.getByText('25 música(s) nesta consulta.',{exact:true}).waitFor();
  await library.getByRole('button',{name:'Importar músicas',exact:true}).click();
  await library.getByText('2 música(s) nesta consulta.',{exact:true}).waitFor();
  await library.getByRole('button',{name:'Importar músicas',exact:true}).click();await library.getByText('2 música(s) nesta consulta.',{exact:true}).waitFor();
  await page.evaluate(()=>{window.failFavorite=true;});
  await library.getByRole('button',{name:'Favoritar Ação',exact:true}).click();
  await library.getByRole('alert').filter({hasText:'Não foi possível confirmar o favorito'}).waitFor();
  assert.equal(await library.getByRole('button',{name:'Favoritar Ação',exact:true}).getAttribute('aria-pressed'),'false');
  await page.evaluate(()=>{window.failFavorite=false;});
  await library.getByRole('button',{name:'Recarregar biblioteca',exact:true}).click();
  await library.getByRole('button',{name:'Favoritar Ação',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('button[aria-label="Favoritar Ação"]')?.getAttribute('aria-pressed')==='true');
  await library.getByRole('button',{name:'Favoritas',exact:true}).click();
  await library.getByText('1 música(s) nesta consulta.',{exact:true}).waitFor();
  await library.getByRole('searchbox',{name:'Buscar músicas',exact:true}).fill('missing');
  await library.getByText('0 música(s) nesta consulta.',{exact:true}).waitFor();
  await library.getByRole('searchbox',{name:'Buscar músicas',exact:true}).fill('');
  await library.getByRole('button',{name:'Favoritar Ação',exact:true}).click();
  await library.getByText('0 música(s) nesta consulta.',{exact:true}).waitFor();
  await library.getByText('Nenhuma favorita nesta consulta.',{exact:false}).waitFor();
  assert.equal(await navigation.queueCount(page,0).isVisible(),true);
  await library.getByRole('button',{name:'Todas as músicas',exact:true}).click();
  await library.getByRole('button',{name:'Favoritar Ação',exact:true}).click();
  await library.getByRole('button',{name:'Importar músicas',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('button[aria-label="Favoritar Ação"]')?.getAttribute('aria-pressed')==='true');
  await page.evaluate(()=>{window.holdSnapshot=true;});
  await page.waitForFunction(()=>typeof window.releaseSnapshot==='function');
  await library.getByRole('button',{name:'Tocar agora Ação',exact:true}).click();
  await navigation.trackTitle(page,'Ação').waitFor();
  await page.evaluate(()=>{window.releaseSnapshot();});
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  assert.equal(await navigation.trackTitle(page,'Ação').isVisible(),true);
  await library.getByRole('button',{name:'Adicionar Música 1 à fila',exact:true}).click();
  await navigation.queueCount(page,2).waitFor();
  await library.getByRole('button',{name:'Remover Música 1 da biblioteca',exact:true}).click();
  await library.getByText('1 música(s) nesta consulta.',{exact:true}).waitFor();
  assert.equal(await navigation.queueCount(page,2).isVisible(),true);
  await page.evaluate(()=>{window.failPlay=true;});
  await library.getByRole('button',{name:'Tocar agora Ação',exact:true}).click();
  await library.getByRole('alert').filter({hasText:'Arquivo indisponível'}).waitFor();
  await library.getByRole('button',{name:'Recarregar biblioteca',exact:true}).click();
  await library.getByText('1 música(s) nesta consulta.',{exact:true}).waitFor();
  await page.evaluate(()=>{window.cancelImport=true;});
  await library.getByRole('button',{name:'Importar músicas',exact:true}).click();
  await library.getByText('1 música(s) nesta consulta.',{exact:true}).waitFor();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.reload();await page.getByRole('region',{name:'Biblioteca local',exact:true}).getByText('1 música(s) nesta consulta.',{exact:true}).waitFor();
  assert.equal(await library.getByRole('button',{name:'Favoritar Ação',exact:true}).getAttribute('aria-pressed'),'true');
  assert.equal(requests.some(r=>r.includes(':5000')),false);assert.deepEqual(errors,[]);
  await page.close();console.log('PASS mobile library pagination, latest query, invalid replies, filters, favorites persistence and errors, import, playback, queue isolation, unavailable file and reload');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
