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
    window.audioTestState={title:'Faixa local de teste',hasTrack:false,playing:false,loading:false,position:0,duration:120000,failed:false};
    window.audioCommands=[];window.cancelPick=false;window.badResponse=false;
    window.__TAURI__={core:{invoke:async(name,args)=>{
     const cmd=name.split('|')[1];window.audioCommands.push({cmd,args});
     if(cmd==='choose') {if(window.cancelPick)return {cancelled:true};window.audioTestState.hasTrack=true;}
     if(cmd==='play')window.audioTestState.playing=true;
     if(cmd==='pause')window.audioTestState.playing=false;
     if(cmd==='seek')window.audioTestState.position=args.position;
     return window.badResponse?{broken:true}:{...window.audioTestState};
    }}};
   });
   await page.goto('http://127.0.0.1:1420/mobile.html');
   await page.getByRole('button',{name:'Escolher música',exact:true}).click();
   await page.getByRole('heading',{name:'Faixa local de teste',exact:true}).waitFor();
   await page.getByRole('button',{name:'Tocar',exact:true}).click();
   await page.getByRole('button',{name:'Pausar',exact:true}).click();
   await page.getByRole('button',{name:'Avançar 10 segundos',exact:true}).click();
   await page.getByText('0:10 / 2:00',{exact:true}).waitFor();
   await page.evaluate(()=>{window.cancelPick=true;});
   await page.getByRole('button',{name:'Escolher música',exact:true}).click();
   assert.equal(await page.getByRole('heading',{name:'Faixa local de teste',exact:true}).isVisible(),true);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
   const commands=await page.evaluate(()=>window.audioCommands);
   assert.equal(commands.some(c=>c.cmd==='seek'&&c.args.position===10000),true);
   await page.evaluate(()=>{window.badResponse=true;});
   await page.getByRole('button',{name:'Tocar',exact:true}).click();
   await page.getByRole('alert').filter({hasText:'Resposta inválida'}).waitFor();
   assert.equal(requests.some(u=>u.includes(':5000')),false,'mobile must never access desktop backend');
   assert.deepEqual(errors,[]);await page.close();
  }
  const page=await browser.newPage();await page.goto('http://127.0.0.1:1420/mobile.html');
  assert.equal(await page.getByRole('button',{name:'Escolher música',exact:true}).isDisabled(),true);
  await page.close();console.log('PASS mobile controls, cancellation, invalid replies, small screens and no desktop API dependency');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
