/** Recent cards keep readable labels and expose next/queue through an accessible menu. */
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
     controls:[main,card.querySelector('.bz-home-menu-trigger')].map(button=>{const b=button.getBoundingClientRect();return {left:b.left,right:b.right,bottom:b.bottom,height:b.height};}),
     bottom:box.bottom};
   }));
   for(const card of measurements){
    assert.ok(card.left>=0&&card.right<=width+1,JSON.stringify({width,card}));
    assert.ok(card.titleWidth>=Math.min(120,card.width*.4),JSON.stringify({width,card}));
    assert.ok(card.title.length>20);
    assert.ok(card.controls[0].right<=card.controls[1].left+1);
    for(const action of card.controls){assert.ok(action.left>=card.left&&action.right<=card.right&&action.bottom<=card.bottom,JSON.stringify({width,card}));assert.ok(action.height>=44);}
   }
   const first=cards.first(), trigger=first.getByRole('button',{name:'Mais opções de '+tracks[0].title,exact:true});
   const menu=f.page.getByRole('menu');
   const next=menu.getByRole('menuitem',{name:'Tocar '+tracks[0].title+' a seguir',exact:true});
   const queued=menu.getByRole('menuitem',{name:'Adicionar '+tracks[0].title+' ao fim da fila',exact:true});
   assert.equal(await menu.count(),0);
   await trigger.click();await next.waitFor();
   assert.equal(await trigger.getAttribute('aria-expanded'),'true');
   const bounds=await menu.boundingBox();
   assert.ok(bounds.x>=0&&bounds.y>=0&&bounds.x+bounds.width<=width&&bounds.y+bounds.height<=870,JSON.stringify({width,bounds}));
   assert.equal(await menu.evaluate(e=>e.scrollWidth<=e.clientWidth),true);
   assert.equal(await next.evaluate(e=>document.activeElement===e),true);
   await f.page.keyboard.press('ArrowUp');assert.equal(await queued.evaluate(e=>document.activeElement===e),true);
   await f.page.keyboard.press('Home');assert.equal(await next.evaluate(e=>document.activeElement===e),true);
   await f.page.keyboard.press('End');assert.equal(await queued.evaluate(e=>document.activeElement===e),true);
   await f.page.keyboard.press('Escape');assert.equal(await menu.count(),0);
   assert.equal(await trigger.evaluate(e=>document.activeElement===e),true);
   await f.page.keyboard.press('ArrowUp');assert.equal(await queued.evaluate(e=>document.activeElement===e),true);
   await f.page.keyboard.press('Tab');assert.equal(await menu.count(),0);
   await trigger.click();await trigger.click();assert.equal(await menu.count(),0);
   await trigger.click();await f.page.getByRole('heading',{name:'Biblioteca recente',exact:true}).click();assert.equal(await menu.count(),0);
   await trigger.click();await next.click();
   assert.equal(await menu.count(),0);assert.equal(await trigger.evaluate(e=>document.activeElement===e),true);
   await f.page.waitForFunction(()=>JSON.parse(localStorage.getItem('doomvault-player-state-v11')).tracks[1]?.videoId==='library:recent0');
   await trigger.click();
   const secondTrigger=cards.nth(1).getByRole('button',{name:'Mais opções de '+tracks[1].title,exact:true});
   await secondTrigger.click();assert.equal(await menu.count(),1);assert.equal(await trigger.getAttribute('aria-expanded'),'false');
   assert.equal(await menu.getAttribute('aria-label'),'Ações de '+tracks[1].title);
   await menu.getByRole('menuitem',{name:'Adicionar '+tracks[1].title+' ao fim da fila',exact:true}).click();
   await f.page.waitForFunction(()=>JSON.parse(localStorage.getItem('doomvault-player-state-v11')).tracks.at(-1)?.videoId==='library:recent1');
   let state=await f.page.evaluate(()=>JSON.parse(localStorage.getItem('doomvault-player-state-v11')));
   assert.equal(state.index,0);assert.equal(state.tracks[0].videoId,'abcdefghijk');
   await first.getByRole('button',{name:'Reproduzir '+tracks[0].title+' '+tracks[0].artist,exact:true}).click();
   await f.page.waitForFunction(()=>JSON.parse(localStorage.getItem('doomvault-player-state-v11')).tracks.length===8);
   state=await f.page.evaluate(()=>JSON.parse(localStorage.getItem('doomvault-player-state-v11')));
   assert.equal(state.tracks[state.index].videoId,'library:recent0');
   assert.deepEqual(state.tracks.map(track=>track.videoId),tracks.map(track=>'library:'+track.id));
   assert.deepEqual(f.errors,[]);await f.page.close();console.log(`PASS recent cards, menu keyboard/focus/dismissal and play/next/queue at ${width}px${large?' large/spacious':''}`);
  }
  for(const theme of ['midnight','light']){
   const touchBrowser={newPage:options=>browser.newPage({...options,hasTouch:true})};
   const f=await fixture(touchBrowser,{width:390,height:640,seed:{'bztune-settings-v1':JSON.stringify({startPage:'home',theme,autoUpdates:false})},override:async(route,url)=>{
    if(url.pathname==='/api/library/tracks'){await route.fulfill({json:{tracks}});return true;}
   }});
   const last=f.page.locator('.bz-home-track').last();await last.waitFor();
   const trigger=last.getByRole('button',{name:'Mais opções de '+tracks[7].title,exact:true});
   await trigger.scrollIntoViewIfNeeded();await trigger.tap();
   const menu=f.page.getByRole('menu');await menu.waitFor();
   const bounds=await menu.boundingBox();
   assert.ok(bounds.x>=0&&bounds.y>=0&&bounds.x+bounds.width<=390&&bounds.y+bounds.height<=640,JSON.stringify(bounds));
   const queue=menu.getByRole('menuitem',{name:'Adicionar '+tracks[7].title+' ao fim da fila',exact:true});
   assert.equal(await queue.evaluate(e=>{const r=e.getBoundingClientRect();return e.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))}),true);
   await queue.tap();assert.equal(await menu.count(),0);
   await f.page.waitForFunction(()=>JSON.parse(localStorage.getItem('doomvault-player-state-v11')).tracks.at(-1)?.videoId==='library:recent7');
   assert.deepEqual(f.errors,[]);await f.page.close();console.log(`PASS touch menu at bottom of small viewport in ${theme} theme`);
  }
 }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
