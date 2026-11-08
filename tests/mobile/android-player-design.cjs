/** Player design with a simulated native bridge. File identity/favorite mapping is also tested in Kotlin. */
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
const {createRequire}=require('node:module');const {chromium}=createRequire(path.resolve(__dirname,'../../doomvault/package.json'))('playwright');
const navigation=require('./navigation-helpers.cjs');
(async()=>{
 const browser=await chromium.launch({...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{}),args:['--no-sandbox']});
 try{
  const page=await browser.newPage({viewport:{width:380,height:844}}),errors=[],requests=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>requests.push(r.url()));
  await page.addInitScript(()=>{
   function cover(a,b,title){const c=document.createElement('canvas');c.width=400;c.height=400;const x=c.getContext('2d');x.fillStyle=a;x.fillRect(0,0,400,400);x.fillStyle=b;x.beginPath();x.moveTo(0,300);x.lineTo(400,140);x.lineTo(400,400);x.lineTo(0,400);x.fill();x.fillStyle='#fff0d0';x.font='bold 30px sans-serif';x.fillText('AURORA NORTE',32,62);x.font='18px sans-serif';x.fillText(title,32,96);return c.toDataURL('image/jpeg',.85);}
   const covers={a:cover('#b85834','#54282a','PAISAGENS'),b:cover('#345eaf','#20324c','AO VIVO')};
   window.commands=[];window.favorites={a:false,b:false};window.holdFavorite=false;window.failFavorite=false;window.badLink=false;window.brokenCover=false;
   const state={title:'Depois do Sol',hasTrack:true,playing:true,loading:false,position:61000,duration:229000,failed:false,queue:[{id:'q-a',title:'Depois do Sol'},{id:'q-b',title:'Depois do Sol'},{id:'q-c',title:'Noite Clara'}],index:0,shuffle:false,repeat:0,canNext:true,canPrevious:false};window.playerState=state;
   window.__TAURI__={core:{invoke:async(name,args)=>{
    const cmd=name.split('|')[1];window.commands.push({cmd,args});
    if(cmd==='library_list'&&args?.home)return {total:0,recentTotal:0,favoriteTotal:0,recent:[],favorites:[]};
    if(cmd==='library_list')return {items:[],total:0,page:0,pageSize:50,artists:[],albums:[]};
    if(cmd==='track_details'){
     const key=args.id==='q-a'?'a':args.id==='q-b'?'b':null;
     return {id:args.id,artist:'Aurora Norte',album:key==='a'?'Paisagens':key==='b'?'Ao vivo':'Arquivo avulso',cover:window.brokenCover?'data:image/jpeg;base64,AAAA':key?covers[key]:null,libraryId:window.badLink?null:key?'lib-'+key:null,favorite:window.badLink?true:key?window.favorites[key]:null};
    }
    if(cmd==='library_favorite'){
     if(window.holdFavorite)await new Promise(resolve=>{window.releaseFavorite=resolve;});
     if(window.failFavorite)return {updated:false};const key=args.id==='lib-a'?'a':args.id==='lib-b'?'b':null;if(!key)throw Error('Wrong library identity');window.favorites[key]=args.favorite;return {updated:true};
    }
    if(cmd==='next')state.index=Math.min(state.queue.length-1,state.index+1);
    if(cmd==='previous')state.index=Math.max(0,state.index-1);
    if(cmd==='jump'){if(state.queue[args.index]?.id!==args.id)throw Error('Entrada mudou.');state.index=args.index;}
    if(cmd==='reorder'){if(state.queue[args.index]?.id!==args.id)throw Error('Entrada mudou.');const current=state.queue[state.index]?.id;const [t]=state.queue.splice(args.index,1);state.queue.splice(args.to,0,t);state.index=state.queue.findIndex(t=>t.id===current);}
    if(cmd==='remove'){if(state.queue[args.index]?.id!==args.id)throw Error('Entrada mudou.');const current=state.queue[state.index]?.id;state.queue.splice(args.index,1);state.index=Math.max(0,state.queue.findIndex(t=>t.id===current));if(state.queue.length===0)state.index=-1;}
    if(cmd==='shuffle')state.shuffle=!state.shuffle;if(cmd==='repeat')state.repeat=(state.repeat+1)%3;if(cmd==='pause')state.playing=false;if(cmd==='play')state.playing=true;if(cmd==='seek')state.position=args.position;
    state.hasTrack=state.queue.length>0;if(!state.hasTrack){state.playing=false;state.duration=0;state.position=0;}state.title=state.queue[state.index]?.title??'Escolha uma música';state.canNext=state.index<state.queue.length-1;state.canPrevious=state.index>0;
    return {...state,queue:state.queue.map(t=>({...t}))};
   }}};
  });
  await page.goto('http://127.0.0.1:1420/mobile.html');await navigation.trackTitle(page,'Depois do Sol').waitFor();await navigation.player(page);const dialog=navigation.dialog(page);
  await dialog.getByText('Paisagens',{exact:true}).waitFor();const favorite=()=>dialog.locator('.player-favorite');
  await page.waitForFunction(()=>document.querySelector('.player-favorite')?.disabled===false);
  await page.waitForFunction(()=>{const [r,,b]=getComputedStyle(document.querySelector('.player-dialog')).getPropertyValue('--player-art-color').split(',').map(Number);return r>b;});
  const footerBefore=await dialog.locator('.player-functions').innerText();
  if(process.env.BZTUNE_CAPTURE_DIR){fs.mkdirSync(process.env.BZTUNE_CAPTURE_DIR,{recursive:true});await page.screenshot({animations:'disabled',path:path.join(process.env.BZTUNE_CAPTURE_DIR,'player.png')});}
  await page.evaluate(()=>{window.holdFavorite=true;});await favorite().click();await page.waitForFunction(()=>typeof window.releaseFavorite==='function');assert.equal(await favorite().isDisabled(),true);
  await dialog.getByRole('button',{name:'Próxima',exact:true}).click();await dialog.getByText('Ao vivo',{exact:true}).waitFor();
  await page.evaluate(()=>{window.holdFavorite=false;window.releaseFavorite();});await page.waitForFunction(()=>window.favorites.a===true);await page.waitForFunction(()=>document.querySelector('.player-favorite')?.getAttribute('aria-pressed')==='false');
  assert.equal(await page.evaluate(()=>window.favorites.b),false,'late confirmation cannot favorite the next song with the same title');
  assert.equal(await page.evaluate(()=>window.commands.find(c=>c.cmd==='library_favorite').args.id),'lib-a');
  await page.waitForFunction(()=>{const [r,,b]=getComputedStyle(document.querySelector('.player-dialog')).getPropertyValue('--player-art-color').split(',').map(Number);return b>r;});
  await page.evaluate(()=>{window.failFavorite=true;});await favorite().click();await dialog.getByRole('alert').filter({hasText:'confirmar o favorito'}).waitFor();assert.equal(await favorite().getAttribute('aria-pressed'),'false');
  await page.evaluate(()=>{window.failFavorite=false;});await favorite().click();await page.waitForFunction(()=>document.querySelector('.player-favorite')?.getAttribute('aria-pressed')==='true');assert.equal(await dialog.locator('.player-functions').innerText(),footerBefore);
  const mutations=await page.evaluate(()=>window.commands.filter(c=>c.cmd==='library_favorite').length);
  await dialog.getByRole('button',{name:'Próxima',exact:true}).click();await dialog.getByText('Arquivo avulso',{exact:true}).waitFor();assert.equal(await favorite().isDisabled(),true);await dialog.getByText('Importe esta música na Biblioteca para favoritar.',{exact:true}).waitFor();
  await page.waitForFunction(()=>getComputedStyle(document.querySelector('.player-dialog')).getPropertyValue('--player-art-color').trim()==='37, 48, 61');assert.equal(await page.evaluate(()=>window.commands.filter(c=>c.cmd==='library_favorite').length),mutations);
  await dialog.getByRole('button',{name:'Anterior',exact:true}).click();await dialog.getByText('Ao vivo',{exact:true}).waitFor();await page.evaluate(()=>{window.brokenCover=true;});await navigation.closePlayer(page);await navigation.player(page);
  await page.evaluate(()=>{window.badLink=true;});
  // Changing the entry forces validation of a fresh incompatible library link.
  await dialog.getByRole('button',{name:'Anterior',exact:true}).click();await dialog.getByText('Detalhes inválidos da faixa.',{exact:true}).waitFor();assert.equal(await favorite().isDisabled(),true);
  await page.evaluate(()=>{window.badLink=false;});await dialog.getByRole('button',{name:'Recarregar detalhes',exact:true}).click();await dialog.getByText('Paisagens',{exact:true}).waitFor();await page.waitForFunction(()=>getComputedStyle(document.querySelector('.player-dialog')).getPropertyValue('--player-art-color').trim()==='37, 48, 61');assert.equal(await dialog.getByRole('button',{name:'Pausar',exact:true}).isEnabled(),true);
  await page.evaluate(()=>{window.brokenCover=false;});await dialog.getByRole('button',{name:'Próxima',exact:true}).click();await dialog.getByText('Ao vivo',{exact:true}).waitFor();
  const beforeQueue=await page.evaluate(()=>window.commands.filter(c=>['play','pause','seek','jump','reorder','remove'].includes(c.cmd)).length);
  await navigation.queue(page);const queue=dialog.getByRole('region',{name:'Fila · 3',exact:true});await queue.waitFor();assert.equal(await dialog.getByRole('button',{name:'Fechar fila',exact:true}).isVisible(),true);
  if(process.env.BZTUNE_CAPTURE_DIR)await page.screenshot({animations:'disabled',path:path.join(process.env.BZTUNE_CAPTURE_DIR,'fila.png')});
  await page.goBack();await queue.waitFor({state:'hidden'});assert.equal(await dialog.isVisible(),true);assert.equal(await page.evaluate(()=>document.activeElement?.textContent?.trim()),'Fila · 3');
  await navigation.queue(page);await queue.locator('li').nth(0).getByRole('button',{name:/^Opções de/}).click();let options=page.getByRole('dialog',{name:'Depois do Sol',exact:true});await options.waitFor();
  for(let i=0;i<7;i++){await page.keyboard.press('Tab');assert.equal(await page.evaluate(()=>!!document.activeElement?.closest('.action-sheet')),true);}
  await page.goBack();await options.waitFor({state:'hidden'});assert.equal(await queue.isVisible(),true);await page.keyboard.press('Escape');await queue.waitFor({state:'hidden'});assert.equal(await dialog.isVisible(),true);
  assert.equal(await page.evaluate(()=>window.commands.filter(c=>['play','pause','seek','jump','reorder','remove'].includes(c.cmd)).length),beforeQueue,'opening/closing panels cannot change playback');
  await navigation.queue(page);await queue.locator('li').nth(0).getByRole('button',{name:/^Opções de/}).click();await page.getByRole('dialog',{name:'Depois do Sol',exact:true}).waitFor();await page.reload();await queue.waitFor();await page.waitForFunction(()=>!history.state.bztuneSheet);await dialog.getByRole('button',{name:'Próxima',exact:true}).click();assert.equal(await page.locator('.action-sheet').count(),0);await page.goBack();await queue.waitFor({state:'hidden'});assert.equal(await dialog.isVisible(),true);
  await navigation.queue(page);await navigation.queueAction(page,'Depois do Sol','Descer Depois do Sol',1);await page.waitForFunction(()=>window.commands.some(c=>c.cmd==='reorder'&&c.args.id==='q-a'&&c.args.index===0&&c.args.to===1));assert.equal(await queue.locator('li').first().getAttribute('aria-current'),'true');
  await navigation.queueAction(page,'Noite Clara','Remover Noite Clara da fila');await dialog.getByRole('heading',{name:'Fila · 2',exact:true}).waitFor();
  await page.setViewportSize({width:320,height:568});const f=await dialog.locator('.player-dialog-footer').boundingBox(),q=await dialog.locator('.queue-panel').boundingBox();assert.ok(f&&q&&q.y>=0&&q.y+q.height<=f.y+1&&f.y+f.height<=569);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await navigation.closePlayer(page);assert.equal(await dialog.isVisible(),false);await page.getByRole('button',{name:'Abrir fila · 2',exact:true}).click();await dialog.getByRole('heading',{name:'Fila · 2',exact:true}).waitFor();await page.goBack();assert.equal(await dialog.isVisible(),true);assert.equal(await dialog.locator('.queue-panel').count(),0);await page.goBack();await dialog.waitFor({state:'hidden'});
  await page.getByRole('button',{name:'Abrir fila · 2',exact:true}).click();await dialog.getByRole('heading',{name:'Fila · 2',exact:true}).waitFor();
  await navigation.queueAction(page,'Depois do Sol','Remover Depois do Sol da fila',1);await dialog.getByRole('heading',{name:'Fila · 1',exact:true}).waitFor();
  await navigation.queueAction(page,'Depois do Sol','Remover Depois do Sol da fila',1);await dialog.getByRole('heading',{name:'Fila · 0',exact:true}).waitFor();
  await dialog.getByText('A fila está vazia.',{exact:true}).waitFor();assert.equal(await dialog.getByRole('button',{name:'Adicionar músicas à fila',exact:true}).isEnabled(),true);assert.equal(await dialog.getByRole('button',{name:'Tocar',exact:true}).isDisabled(),true);
  await navigation.closePlayer(page);await dialog.waitFor({state:'hidden'});
  await page.evaluate(()=>history.replaceState({...history.state,player:true,panel:'queue',queueLayer:false},''));await page.reload();await dialog.getByRole('heading',{name:'Fila · 3',exact:true}).waitFor();await dialog.getByRole('button',{name:'Fechar fila',exact:true}).click();await page.waitForFunction(()=>history.state.panel==='player');assert.equal(await dialog.isVisible(),true,'legacy queue entry can close its panel without skipping the player');
  assert.equal(requests.some(u=>/^https?:/.test(u)&&!u.includes('127.0.0.1:1420')),false);assert.deepEqual(errors,[]);
  console.log('PASS player favorite exact library identity, duplicate titles/late/failure/unlinked guards, local artwork colors/fallback, footer preservation, nested queue Back/Escape/focus, stable-ID reorder/remove, short screen and offline isolation');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
