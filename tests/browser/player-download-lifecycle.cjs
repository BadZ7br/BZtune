const assert=require('node:assert/strict');const{createRequire}=require('node:module');const{chromium}=createRequire(require('node:path').resolve(__dirname,'../../doomvault/package.json'))('playwright');const{fixture}=require('./frontend-contracts.cjs');
const a={videoId:'abcdefghijk',title:'Faixa de Teste',artist:'Artista de Teste'},b={videoId:'lmnopqrstuv',title:'Outra Faixa',artist:a.artist};
(async()=>{const browser=await chromium.launch({...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{}),args:['--no-sandbox']});try{
for(const scenario of ['track-change','delayed-start','unmounted']){
 let complete=false,posts=0,release;const gate=new Promise(resolve=>release=resolve);
 const f=await fixture(browser,{seed:{'doomvault-player-state-v11':JSON.stringify({tracks:[a,b],index:0,shuffle:false,repeat:'off'})},override:async(r,u)=>{
  if(u.pathname==='/api/library/auto-download'){posts++;if(scenario==='delayed-start')await gate;await r.fulfill({json:{id:'download1'}});return true;}
  if(u.pathname.endsWith('/auto-download/download1')){await r.fulfill({json:{id:'download1',status:complete?'complete':'downloading',total:1,completed:complete?1:0,errors:[]}});return true;}
 }});const p=f.page;await p.evaluate(()=>{window.downloadUpdates=0;window.addEventListener('doomvault-library-updated',()=>window.downloadUpdates++);});
 await p.getByRole('button',{name:'Expandir player',exact:true}).click();const footer=p.getByRole('toolbar',{name:'Ferramentas do player expandido'});await footer.getByRole('button',{name:'Baixar',exact:true}).click();await p.getByRole('button',{name:'Baixar música: Faixa de Teste',exact:true}).click();
 if(scenario!=='delayed-start')await p.getByText(/0\/1 concluída/).waitFor();
 if(scenario==='unmounted')await footer.getByRole('button',{name:'Fechar player e limpar fila',exact:true}).click();
 else{await p.getByRole('button',{name:'Próxima',exact:true}).click();await p.getByRole('button',{name:'Baixar música: Outra Faixa',exact:true}).waitFor();}
 complete=true;release();await p.waitForFunction(()=>window.downloadUpdates===1);
 if(scenario!=='unmounted'){assert.equal(await p.getByRole('button',{name:'Baixar música: Outra Faixa',exact:true}).isEnabled(),true);await p.getByRole('button',{name:'Anterior',exact:true}).click();assert.equal(await p.getByRole('button',{name:'Download concluído: Faixa de Teste',exact:true}).isDisabled(),true);}
 assert.equal(posts,1);assert.deepEqual(f.errors,[]);await p.close();console.log('PASS download ownership and completion: '+scenario);
}
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1});
