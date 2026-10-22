/** Recent cards must keep readable labels and preserve play/next/queue actions. */
const assert=require('node:assert/strict');
const path=require('node:path');
const {createRequire}=require('node:module');
const {chromium}=createRequire(path.resolve(__dirname,'../../doomvault/package.json'))('playwright');
const {fixture}=require('./frontend-contracts.cjs');
const tracks=Array.from({length:8},(_,i)=>({id:'recent'+i,title:i===0?"(Beginning of What's About to Happen) Hwy 74":'Música da biblioteca com um título longo '+i,
 artist:'Artista com nome completo '+i,audioUrl:'/audio/recent'+i,coverUrl:null}));
(async()=>{
 const browser=await chromium.launch({...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{}),args:['--no-sandbox']});
 try{
  for(const [width,large]of [[1920,false],[1360,false],[960,false],[526,false],[390,false],[320,false],[1024,true]]){
   const f=await fixture(browser,{width,seed:{'bztune-settings-v1':JSON.stringify({startPage:'home',theme:'midnight',autoUpdates:false,fontSize:large?'large':'medium',density:large?'spacious':'normal'})},override:async(route,url)=>{
    if(url.pathname==='/api/library/tracks'){await route.fulfill({json:{tracks}});return true;}
   }});
   const cards=f.page.locator('.bz-home-track');await cards.first().waitFor();assert.equal(await cards.count(),8);
   const measurements=await cards.evaluateAll(elements=>elements.map(card=>{
    const box=card.getBoundingClientRect(),main=card.querySelector('.dv-home-tile'),title=main.querySelector('strong'),r=title.getBoundingClientRect();
    return {left:box.left,right:box.right,width:box.width,titleWidth:r.width,title:title.title,
     actions:[...card.querySelectorAll('.bz-home-queue-action')].map(button=>{const b=button.getBoundingClientRect();return {left:b.left,right:b.right,top:b.top,bottom:b.bottom,height:b.height,textFits:button.scrollWidth<=button.clientWidth}}),
     bottom:box.bottom};
   }));
   for(const card of measurements){
    assert.ok(card.left>=0&&card.right<=width+1,JSON.stringify({width,card}));
    assert.ok(card.titleWidth>=Math.min(150,card.width*.45),JSON.stringify({width,card}));
    assert.ok(card.title.length>20);
    for(const action of card.actions){assert.ok(action.left>=card.left&&action.right<=card.right&&action.bottom<=card.bottom,JSON.stringify({width,card}));assert.ok(action.height>=44&&action.textFits);}
   }
   const first=cards.first();
   await first.getByRole('button',{name:'Tocar '+tracks[0].title+' a seguir',exact:true}).click();
   await f.page.waitForFunction(()=>JSON.parse(localStorage.getItem('doomvault-player-state-v11')).tracks[1]?.videoId==='library:recent0');
   await cards.nth(1).getByRole('button',{name:'Adicionar '+tracks[1].title+' ao fim da fila',exact:true}).click();
   await f.page.waitForFunction(()=>JSON.parse(localStorage.getItem('doomvault-player-state-v11')).tracks.at(-1)?.videoId==='library:recent1');
   let state=await f.page.evaluate(()=>JSON.parse(localStorage.getItem('doomvault-player-state-v11')));
   assert.equal(state.index,0);assert.equal(state.tracks[0].videoId,'abcdefghijk');
   await first.getByRole('button',{name:'Reproduzir '+tracks[0].title,exact:true}).click();
   await f.page.waitForFunction(()=>JSON.parse(localStorage.getItem('doomvault-player-state-v11')).tracks.length===8);
   state=await f.page.evaluate(()=>JSON.parse(localStorage.getItem('doomvault-player-state-v11')));
   assert.equal(state.tracks[state.index].videoId,'library:recent0');
   assert.deepEqual(state.tracks.map(track=>track.videoId),tracks.map(track=>'library:'+track.id));
   assert.deepEqual(f.errors,[]);await f.page.close();console.log(`PASS readable recent cards and play/next/queue at ${width}px${large?' large/spacious':''}`);
  }
 }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
