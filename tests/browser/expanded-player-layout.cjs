/** Long titles, small windows and appearance scales must scroll inside the full player card. */
const assert=require('node:assert/strict');
const path=require('node:path');
const {createRequire}=require('node:module');
const {chromium}=createRequire(path.resolve(__dirname,'../../doomvault/package.json'))('playwright');
const {fixture}=require('./frontend-contracts.cjs');
const title="(Beginning of What's About to Happen) Hwy 74 — Uma gravação com título longo";
async function insideCard(locator,page){
 await locator.scrollIntoViewIfNeeded();
 const bounds=await locator.evaluate(element=>{
  const r=element.getBoundingClientRect(),s=document.querySelector('.bz32-shell').getBoundingClientRect();
  return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,card:{left:s.left,right:s.right,top:s.top,bottom:s.bottom}};
 });
 assert.ok(bounds.left>=bounds.card.left-1&&bounds.right<=bounds.card.right+1,JSON.stringify(bounds));
 assert.ok(bounds.top>=bounds.card.top-1&&bounds.bottom<=bounds.card.bottom+1,JSON.stringify(bounds));
 assert.equal(await page.evaluate(()=>window.scrollY),0);
}
(async()=>{
 const browser=await chromium.launch({...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{}),args:['--no-sandbox']});
 try{
  for(const [width,height,large,local]of [[1920,1080,false],[1360,870,false],[960,640,false],[526,945,false],[390,844,false],[320,640,false],[1024,640,true],[1360,870,false,true],[390,844,false,true]]){
   const f=await fixture(browser,{width,height,seed:{
    'doomvault-player-state-v11':JSON.stringify({tracks:[{videoId:local?'library:local1':'abcdefghijk',title,artist:'Kyuss',album:'Wretch',...(local?{audioUrl:'http://127.0.0.1:5000/audio/local1'}:{})}],index:0,shuffle:false,repeat:'off'}),
    'bztune-settings-v1':JSON.stringify({startPage:'home',theme:'midnight',autoUpdates:false,fontSize:large?'large':'medium',density:large?'spacious':'normal'})
   }});
   await f.page.getByRole('button',{name:'Expandir player',exact:true}).click();
   const shell=f.page.locator('.bz32-shell');await shell.waitFor();
   const box=await shell.boundingBox();
   assert.ok(box.x>=0&&box.y>=0&&box.x+box.width<=width+1&&box.y+box.height<=height+1,JSON.stringify({width,height,box}));
   const overflow=await shell.evaluate(e=>({x:e.scrollWidth-e.clientWidth,y:getComputedStyle(e).overflowY}));
   assert.ok(overflow.x<=1,JSON.stringify({width,overflow}));assert.equal(overflow.y,'auto');
   if(!local){
    const video=await f.page.evaluate(()=>{
     const frame=document.querySelector('.bz32-video').getBoundingClientRect(),surface=document.querySelector('.bz32-media-surface').getBoundingClientRect();
     return {bottom:frame.bottom,surfaceBottom:surface.bottom};
    });
    assert.ok(video.bottom<=video.surfaceBottom+1,`Video controls clipped: ${JSON.stringify(video)}`);
   }
   if(width<=900){
    const gap=await f.page.evaluate(()=>document.querySelector('.bz32-center').getBoundingClientRect().top-document.querySelector('.bz32-media').getBoundingClientRect().bottom);
    assert.ok(gap<=40,`Excessive media/control gap: ${gap}`);
   }
   for(const name of ['Letra','Fila','Equalizador','Histórico','Crossfade'])await insideCard(f.page.getByRole('button',{name,exact:true}),f.page);
   if(!local)await insideCard(f.page.locator('.bz-online-help'),f.page);
   // A playlist menu must remain reachable after clipping is restored to the card.
   await f.page.getByRole('button',{name:'Adicionar '+title+' à playlist',exact:true}).click();
   const dialog=f.page.getByRole('dialog',{name:'Escolher playlist',exact:true});
   await insideCard(dialog.getByRole('button',{name:'Playlist de Teste',exact:true}),f.page);
   await dialog.getByRole('button',{name:'Fechar',exact:true}).click();
   await f.page.getByRole('button',{name:'Crossfade',exact:true}).click();
   await insideCard(f.page.locator('#bz32-crossfade'),f.page);
   await f.page.getByRole('button',{name:'Letra',exact:true}).click();
   await insideCard(f.page.getByRole('button',{name:'Voltar ao mini-player',exact:true}),f.page);
   await f.page.getByRole('button',{name:'Voltar ao mini-player',exact:true}).click();
   await f.page.getByRole('button',{name:'Expandir player',exact:true}).waitFor();
   assert.deepEqual(f.errors,[]);await f.page.close();console.log(`PASS full-player containment, tools, playlist and crossfade at ${width}x${height}${large?' large/spacious':''}${local?' local audio':''}`);
  }
 }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
