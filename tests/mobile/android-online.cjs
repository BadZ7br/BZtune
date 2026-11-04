/** Catalog bridge fixture. Live MusicBrainz access is not simulated as a successful network probe. */
const assert=require('node:assert/strict'),path=require('node:path');
const {createRequire}=require('node:module');const {chromium}=createRequire(path.resolve(__dirname,'../../doomvault/package.json'))('playwright');
const navigation=require('./navigation-helpers.cjs');
(async()=>{
 const browser=await chromium.launch({...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{}),args:['--no-sandbox']});
 try {
  const page=await browser.newPage({viewport:{width:360,height:820}});const errors=[],requests=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>requests.push(r.url()));
  await page.addInitScript(()=>{
   const id=n=>'00000000-0000-0000-0000-'+String(n).padStart(12,'0');
   const item=(n,entity,title,detail='')=>({id:id(n),entity,title,artist:entity==='artist'?'':'Artista de teste',detail,duration:entity==='track'?120000:null});
   const result=(r,items,total=items.length)=>({provider:'musicbrainz',heading:r.action==='release'?'Disco de teste':r.query,description:'',items,total,page:['recording','release'].includes(r.action)?0:r.page,pageSize:25,pageable:!['recording','release'].includes(r.action),complete:r.action!=='recording',cached:r.query==='offline',offline:r.query==='offline',fetchedAt:Date.now()});
   window.calls=[];
   const audio={title:'Original local',hasTrack:true,playing:true,loading:false,position:1000,duration:180000,failed:false,queue:[{id:'local-current',title:'Original local'}],index:0,shuffle:false,repeat:0,canNext:false,canPrevious:false};
   window.__TAURI__={core:{invoke:async(name,args)=>{
    const cmd=name.split('|')[1];window.calls.push({cmd,args});
    if(cmd==='track_details')return {id:args.id,artist:'Artista local',album:'Disco local',cover:null};
    if(cmd==='library_list')return {items:[],total:0,page:0,pageSize:50,artists:[],albums:[]};
    if(cmd==='cancel_catalog')return {cancelled:true};
    if(cmd==='online_catalog') {
     const r=args.request;
     if(r.action==='artist')return result(r,[item(r.page===0?2:7,'group',r.page===0?'Disco de teste':'Outro disco')],26);
     if(r.action==='group'||r.action==='recording')return result(r,[item(3,'release','Disco de teste','2000 · BR'),item(4,'release','Disco de teste','2024 · BR')]);
     if(r.action==='release')return result(r,Array.from({length:51},(_,i)=>item(i+100,'track','Faixa '+(i+1),'Disco 1')));
     if(r.query==='slow'||(r.query==='cancel'&&!r.refresh))return new Promise(resolve=>{window.finishSlow=()=>{resolve(result(r,[item(9,'artist','Antigo')],1));window.slowReleased=true;};});
     if(r.query==='fail'&&!window.recovered)throw Error('Não foi possível acessar o MusicBrainz.');
     if(r.query==='bad')return {...result(r,[]),items:[null],total:1};
     if(r.kind==='recordings')return result(r,[item(6,'recording','Canção 日本語')]);
     return result(r,[item(1,'artist',r.query==='fast'?'Novo':'Artista de teste')]);
    }
    return {...audio,queue:[...audio.queue]};
   }}};
  });
  await page.goto('http://127.0.0.1:1420/mobile.html');await navigation.nav(page,'Busca');
  const local=page.getByRole('searchbox',{name:'Buscar músicas',exact:true});await local.fill('meu');
  await page.getByRole('navigation',{name:'Origem da busca',exact:true}).getByRole('button',{name:'Online',exact:true}).click();
  const panel=page.getByRole('region',{name:'Explorar música online',exact:true});
  const search=page.getByRole('searchbox',{name:'Pesquisar online',exact:true});
  assert.equal(await page.evaluate(()=>window.calls.some(c=>c.cmd==='online_catalog')),false);
  async function submit(text){await search.fill(text);await page.getByRole('button',{name:'Pesquisar',exact:true}).click();}
  await submit('Kyuss');await page.getByRole('button',{name:'Ver álbuns de Artista de teste',exact:true}).waitFor();
  await page.getByRole('button',{name:'Ver álbuns de Artista de teste',exact:true}).click();
  await page.getByRole('button',{name:'Ver edições de Disco de teste',exact:true}).waitFor();
  await page.getByRole('button',{name:'Próxima página online',exact:true}).click();
  await page.getByRole('button',{name:'Ver edições de Outro disco',exact:true}).waitFor();
  await page.getByRole('button',{name:'Página online anterior',exact:true}).click();
  await page.getByRole('button',{name:'Ver edições de Disco de teste',exact:true}).click();
  const editions=page.locator('.online-results>li');await editions.filter({hasText:'2024 · BR'}).waitFor();assert.equal(await editions.count(),2);
  await editions.filter({hasText:'2024 · BR'}).getByRole('button',{name:'Ver faixas de Disco de teste',exact:true}).click();
  await page.locator('.online-results>li').nth(49).waitFor();assert.equal(await page.locator('.online-results>li').count(),50);
  const calls=await page.evaluate(()=>window.calls.filter(c=>c.cmd==='online_catalog').length);
  await page.getByRole('button',{name:'Próximas faixas',exact:true}).click();await page.getByText('Faixa 51',{exact:true}).waitFor();assert.equal(await page.locator('.online-results>li').count(),1);
  assert.equal(await page.evaluate(()=>window.calls.filter(c=>c.cmd==='online_catalog').length),calls);
  await page.goBack();await editions.filter({hasText:'2000 · BR'}).waitFor();
  await page.getByRole('combobox',{name:'Pesquisar por',exact:true}).selectOption('recordings');await submit('Canção');
  await page.getByRole('button',{name:'Ver lançamentos de Canção 日本語',exact:true}).click();
  await page.getByText('A fonte não garante uma lista completa neste detalhe.',{exact:true}).waitFor();
  await page.getByRole('combobox',{name:'Pesquisar por',exact:true}).selectOption('artists');await submit('slow');
  await page.waitForFunction(()=>typeof window.finishSlow==='function');await submit('fast');await page.getByText('Novo',{exact:true}).waitFor();
  await page.evaluate(()=>window.finishSlow());await page.waitForFunction(()=>window.slowReleased);assert.equal(await page.getByText('Antigo',{exact:true}).count(),0);
  await submit('cancel');await page.getByRole('button',{name:'Cancelar consulta',exact:true}).click();await page.getByText('Consulta cancelada.',{exact:true}).waitFor();
  await page.evaluate(()=>window.finishSlow());await page.getByRole('button',{name:'Atualizar catálogo',exact:true}).click();await page.getByText('Artista de teste',{exact:true}).waitFor();
  assert.equal(await page.evaluate(()=>window.calls.some(c=>c.cmd==='online_catalog'&&c.args.request.query==='cancel'&&c.args.request.refresh===true)),true);
  await submit('offline');await page.getByText('Fonte indisponível; exibindo a cópia salva.',{exact:false}).waitFor();
  await submit('bad');await page.getByRole('alert').filter({hasText:'Resposta inválida do catálogo'}).waitFor();
  await submit('fail');await page.getByRole('alert').filter({hasText:'Não foi possível acessar o MusicBrainz'}).waitFor();
  await page.evaluate(()=>{window.recovered=true;});await page.getByRole('button',{name:'Tentar novamente',exact:true}).click();await page.getByText('Artista de teste',{exact:true}).waitFor();
  assert.equal(await page.evaluate(()=>window.calls.filter(c=>['play','pause','choose','library_play','playlist_play','restore_backup'].includes(c.cmd)).length),0);
  assert.equal(await navigation.trackTitle(page,'Original local').isVisible(),true);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.getByRole('navigation',{name:'Origem da busca',exact:true}).getByRole('button',{name:'No aparelho',exact:true}).click();
  assert.equal(await local.inputValue(),'meu');assert.equal(await page.locator('.online-results>li').count(),0);
  assert.equal(requests.some(url=>url.includes(':5000')||url.includes('musicbrainz.org')),false,'requests belong to native transport, never desktop Flask or browser fetch');
  assert.equal(await page.evaluate(()=>window.calls.some(c=>c.cmd==='cancel_catalog')),true);assert.deepEqual(errors,[]);
  await page.close();console.log('PASS online artist/group/edition/tracks navigation, recording search, paging, cancellation, stale replies, cache indicator, invalid replies, retry and local-player isolation');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
