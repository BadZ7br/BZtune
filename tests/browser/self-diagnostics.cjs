const assert=require('node:assert/strict');
const path=require('node:path');
const {createRequire}=require('node:module');
const {chromium}=createRequire(path.resolve(__dirname,'../../doomvault/package.json'))('playwright');
const {fixture}=require('./frontend-contracts.cjs');
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
 try {
  let broken=false;
  const f=await fixture(browser,{tab:'maintenance',override:async(route,u)=>{
   if(broken&&u.pathname==='/api/playlists'){await route.fulfill({json:{playlists:'invalid SECRET_TOKEN /home/PRIVATE'}});return true;}
   return false;
  }});
  const p=f.page;
  await p.getByRole('button',{name:'Executar verificação',exact:true}).click();
  const preview=p.getByRole('textbox',{name:'Relatório do diagnóstico'});
  await preview.waitFor();
  let report=await preview.inputValue();
  assert.match(report,/OK — Playlists/);assert.match(report,/NÃO TESTADO/);
  assert.equal(report.includes('Test Library'),false);assert.equal(report.includes('Faixa Local'),false);
  const download=p.waitForEvent('download');await p.getByRole('button',{name:'Baixar diagnóstico',exact:true}).click();
  assert.equal((await download).suggestedFilename(),'BZtune-Diagnostico.md');
  await p.evaluate(()=>{window.open=(url)=>{window.diagnosticUrl=url;return {};};});
  await p.getByRole('button',{name:'Revisar issue no GitHub'}).click();
  const url=new URL(await p.evaluate(()=>window.diagnosticUrl));
  assert.equal(url.origin,'https://github.com');assert.equal(url.pathname,'/BadZ7br/BZtune/issues/new');
  assert.equal(url.searchParams.get('body'),report);
  broken=true;
  await p.getByRole('button',{name:'Executar verificação',exact:true}).click();await preview.waitFor();
  report=await preview.inputValue();assert.match(report,/FALHA — Playlists/);assert.match(report,/OK — Histórico/);
  assert.equal(report.includes('SECRET_TOKEN'),false);assert.equal(report.includes('/home/PRIVATE'),false);
  assert.equal(f.requests.some(r=>r.method!=='GET'),false,'diagnostic must not mutate the library');
  assert.deepEqual(f.errors,[]);
  await p.close();console.log('PASS diagnostics success, partial failure, privacy, export and GitHub draft');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
