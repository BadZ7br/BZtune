/** Browser tests of the mobile interface; native audio is explicitly simulated. */
const assert=require('node:assert/strict'),path=require('node:path');
const {createRequire}=require('node:module');
const {chromium}=createRequire(path.resolve(__dirname,'../../doomvault/package.json'))('playwright');
(async()=>{
 const browser=await chromium.launch({...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{}),args:['--no-sandbox']});
 try {
  for(const width of [320,412]) {
   const page=await browser.newPage({viewport:{width,height:820}});const errors=[],requests=[];
   page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>requests.push(r.url()));
   await page.addInitScript(()=>{
    window.audioTestState={title:'Faixa local de teste',hasTrack:false,playing:false,loading:false,position:0,duration:120000,failed:false,queue:[],index:-1,shuffle:false,repeat:0,canNext:false,canPrevious:false};
    window.audioCommands=[];window.cancelPick=false;window.badResponse=false;
    window.__TAURI__={core:{invoke:async(name,args)=>{
     const cmd=name.split('|')[1];window.audioCommands.push({cmd,args});
     if(cmd==='playlists')return {playlists:[],selected:null};
     if(cmd==='albums')return {items:[],total:0,page:0,pageSize:50,artists:[]};
     if(cmd==='library_list')return {items:[],total:0,page:0,pageSize:50,artists:[],albums:[]};
     const st=window.audioTestState;
     if(cmd==='choose') {if(window.cancelPick)return {cancelled:true};if(args?.append){st.queue.push({id:'second',title:'Segunda faixa'});}else{st.queue=[{id:'first',title:'Faixa local de teste'}];st.index=0;st.playing=false;}}
     if(cmd==='next')st.index=Math.min(st.queue.length-1,st.index+1);
     if(cmd==='previous')st.index=Math.max(0,st.index-1);
     if(cmd==='jump')st.index=args.index;
     if(cmd==='shuffle')st.shuffle=!st.shuffle;
     if(cmd==='repeat')st.repeat=st.repeat===0?2:st.repeat===2?1:0;
     if(cmd==='reorder'){const current=st.queue[st.index]?.id;const [track]=st.queue.splice(args.index,1);st.queue.splice(args.to,0,track);st.index=st.queue.findIndex(t=>t.id===current);}
     if(cmd==='remove'){const current=st.queue[st.index]?.id;st.queue.splice(args.index,1);const saved=st.queue.findIndex(t=>t.id===current);st.index=saved<0?Math.min(args.index,st.queue.length-1):saved;}
     st.hasTrack=st.queue.length>0;st.title=st.queue[st.index]?.title||'Escolha uma música';st.canNext=st.index<st.queue.length-1;st.canPrevious=st.index>0;
     if(cmd==='play')window.audioTestState.playing=true;
     if(cmd==='pause')window.audioTestState.playing=false;
     if(cmd==='seek')window.audioTestState.position=args.position;
     return window.badResponse?{...window.audioTestState,queue:[null]}:{...window.audioTestState};
    }}};
   });
   await page.goto('http://127.0.0.1:1420/mobile.html');
   await page.getByRole('button',{name:'Escolher músicas',exact:true}).click();
   await page.getByRole('heading',{name:'Faixa local de teste',exact:true}).waitFor();
   await page.getByRole('button',{name:'Tocar',exact:true}).click();
   await page.getByRole('button',{name:'Pausar',exact:true}).click();
   await page.getByRole('button',{name:'Avançar 10 segundos',exact:true}).click();
   await page.getByText('0:10 / 2:00',{exact:true}).waitFor();
   await page.getByRole('button',{name:'Adicionar músicas à fila',exact:true}).click();
   await page.getByRole('heading',{name:'Fila · 2',exact:true}).waitFor();
   await page.getByRole('button',{name:'Próxima',exact:true}).click();
   await page.getByRole('heading',{name:'Segunda faixa',exact:true}).waitFor();
   await page.getByRole('button',{name:'Subir Segunda faixa',exact:true}).click();
   assert.equal(await page.locator('.mobile-queue li').first().getAttribute('aria-current'),'true');
   await page.getByRole('button',{name:'Shuffle',exact:true}).click();
   assert.equal(await page.getByRole('button',{name:'Shuffle',exact:true}).getAttribute('aria-pressed'),'true');
   await page.getByRole('button',{name:'Repetição: desligada',exact:true}).click();
   await page.getByRole('button',{name:'Repetição: toda a fila',exact:true}).waitFor();
   await page.getByRole('button',{name:'Selecionar Faixa local de teste',exact:true}).click();
   await page.getByRole('heading',{name:'Faixa local de teste',exact:true}).waitFor();
   await page.getByRole('button',{name:'Remover Segunda faixa da fila',exact:true}).click();
   await page.getByRole('heading',{name:'Fila · 1',exact:true}).waitFor();
   await page.getByRole('button',{name:'Tocar',exact:true}).click();
   await page.getByRole('button',{name:'Pausar',exact:true}).waitFor();
   await page.getByRole('button',{name:'Escolher músicas',exact:true}).click();
   await page.getByRole('button',{name:'Tocar',exact:true}).waitFor();
   await page.evaluate(()=>{window.cancelPick=true;});
   await page.getByRole('button',{name:'Escolher músicas',exact:true}).click();
   assert.equal(await page.getByRole('heading',{name:'Faixa local de teste',exact:true}).isVisible(),true);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
   const commands=await page.evaluate(()=>window.audioCommands);
   assert.equal(commands.some(c=>c.cmd==='seek'&&c.args.position===10000),true);
   assert.equal(commands.some(c=>c.cmd==='reorder'&&c.args.id==='second'),true);
   await page.evaluate(()=>{window.badResponse=true;});
   await page.getByRole('button',{name:'Tocar',exact:true}).click();
   await page.getByRole('alert').filter({hasText:'Resposta inválida'}).waitFor();
   assert.equal(await page.locator('.mobile-queue li').count(),1);
   assert.equal(requests.some(u=>u.includes(':5000')),false,'mobile must never access desktop backend');
   assert.deepEqual(errors,[]);await page.close();
  }
  const page=await browser.newPage();await page.goto('http://127.0.0.1:1420/mobile.html');
  assert.equal(await page.getByRole('button',{name:'Escolher músicas',exact:true}).isDisabled(),true);
  await page.close();console.log('PASS mobile controls, cancellation, invalid replies, small screens and no desktop API dependency');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
