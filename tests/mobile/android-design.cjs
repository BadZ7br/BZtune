/** Visual-foundation interactions with a simulated native bridge; no device audio is asserted. */
const assert=require('node:assert/strict'),path=require('node:path');
const {createRequire}=require('node:module');
const {chromium}=createRequire(path.resolve(__dirname,'../../doomvault/package.json'))('playwright');
const navigation=require('./navigation-helpers.cjs');
(async()=>{
 const browser=await chromium.launch({...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{}),args:['--no-sandbox']});
 try {
  const page=await browser.newPage({viewport:{width:380,height:844}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{
   window.commands=[];
   const track={id:'track',title:'Depois do Sol',artist:'Aurora Norte',album:'Horizonte',year:'2024',duration:240000,cover:null,favorite:false};
   const state={title:'Depois do Sol',hasTrack:true,playing:true,loading:false,position:60000,duration:240000,failed:false,queue:[{id:'entry',title:'Depois do Sol'}],index:0,shuffle:false,repeat:0,canNext:false,canPrevious:false};
   window.__TAURI__={core:{invoke:async(name,args)=>{
    const cmd=name.split('|')[1];window.commands.push({cmd,args});
    if(cmd==='library_list'&&args?.home)return {total:0,recentTotal:0,favoriteTotal:0,recent:[],favorites:[]};
    if(cmd==='library_list')return {items:[{...track}],total:1,page:0,pageSize:50,artists:['Aurora Norte'],albums:[{id:'album',label:'Horizonte'}]};
    if(cmd==='track_details')return {id:args.id,artist:track.artist,album:track.album,cover:null};
    if(cmd==='library_favorite'){track.favorite=args.favorite;return {updated:true};}
    return {...state,queue:[...state.queue]};
   }}};
  });
  await page.goto('http://127.0.0.1:1420/mobile.html');await navigation.library(page);
  const library=page.getByRole('region',{name:'Biblioteca local',exact:true});await library.getByText('1 música(s) nesta consulta.',{exact:true}).waitFor();
  const first=library.locator('.library-tracks>li').first(),box=await first.boundingBox(),dock=await page.locator('.mobile-dock').boundingBox();
  assert.ok(box&&dock&&box.y+box.height<=dock.y,'music must be visible above the dock without scrolling');
  assert.equal(await library.getByRole('button',{name:'Favoritar Depois do Sol',exact:true}).count(),0,'secondary actions stay out of the list');
  const before=await page.evaluate(()=>history.length);
  await library.getByRole('button',{name:'Opções de Depois do Sol',exact:true}).click();
  let sheet=page.getByRole('dialog',{name:'Depois do Sol',exact:true});await sheet.waitFor();
  await page.waitForFunction(n=>history.length===n+1,before);
  for(let i=0;i<12;i++){await page.keyboard.press('Tab');assert.equal(await page.evaluate(()=>!!document.activeElement?.closest('.action-sheet')),true);}
  assert.equal(await sheet.getByRole('button').count(),6,'close plus all five existing music actions');
  await page.goBack();await sheet.waitFor({state:'hidden'});
  assert.equal(await page.evaluate(()=>history.state.screen),'library');
  assert.equal(await page.evaluate(()=>document.activeElement?.getAttribute('aria-label')),'Opções de Depois do Sol');
  await library.getByRole('button',{name:'Opções de Depois do Sol',exact:true}).click();await sheet.waitFor();await page.keyboard.press('Escape');await sheet.waitFor({state:'hidden'});
  assert.equal(await page.evaluate(()=>history.state.screen),'library');
  await navigation.trackAction(page,'Depois do Sol','Favoritar Depois do Sol');await navigation.expectFavorite(page,'Depois do Sol',true);
  assert.equal(await page.evaluate(()=>window.commands.filter(c=>c.cmd==='library_favorite').length),1,'one confirmation sends one mutation');
  await navigation.trackAction(page,'Depois do Sol','Adicionar Depois do Sol à fila');
  await page.waitForFunction(()=>window.commands.some(c=>c.cmd==='library_enqueue'&&c.args.id==='track'));
  for(const size of [{width:320,height:568},{width:640,height:360}]){
   await page.setViewportSize(size);await library.getByRole('button',{name:'Filtrar biblioteca',exact:true}).click();
   sheet=page.getByRole('dialog',{name:'Filtros da biblioteca',exact:true});await sheet.waitFor();
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
   const bounds=await sheet.boundingBox();assert.ok(bounds&&bounds.y>=0&&bounds.y+bounds.height<=size.height+1);
   await sheet.getByRole('button',{name:'Ver resultados',exact:true}).click();await sheet.waitFor({state:'hidden'});
  }
  assert.deepEqual(errors,[]);console.log('PASS mobile visual foundation: first track visible, contextual actions, Back/Escape/focus, no double history or mutations, enqueue, filters and narrow/landscape layout');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
