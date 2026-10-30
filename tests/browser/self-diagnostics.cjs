const assert=require('node:assert/strict');
const path=require('node:path');
const {createRequire}=require('node:module');
const {chromium}=createRequire(path.resolve(__dirname,'../../doomvault/package.json'))('playwright');
const {fixture}=require('./frontend-contracts.cjs');
(async()=>{
 const browser=await chromium.launch({...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{}),args:['--no-sandbox']});
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
  await p.getByLabel('Descrição do problema',{exact:true}).fill('Falha ao abrir o player');
  report=await preview.inputValue();assert.match(report,/Falha ao abrir o player/);
  assert.equal(await p.evaluate(()=>Object.keys(localStorage).some(k=>k.startsWith('bztune-diagnostic-temp-'))),false);
  const deep=await fixture(browser,{tab:'maintenance',override:async(route,u)=>{
    if(u.pathname.includes('/maintenance/checks/')) {
      await route.fulfill({json:{checks:[{name:u.pathname.split('/').pop(),status:'ok',detail:'Verificação simulada.'}]}});return true;
    }
    return false;
  }});
  const d=deep.page;
  await d.getByLabel('Tipo de verificação',{exact:true}).selectOption('deep');
  await d.getByRole('button',{name:'Executar verificação',exact:true}).click();
  const dp=d.getByRole('textbox',{name:'Relatório do diagnóstico'});await dp.waitFor();
  for(const area of ['lrclib','catalog','github','files','tools'])assert.equal(deep.requests.some(r=>r.path.endsWith('/checks/'+area)),true);
  await d.evaluate(()=>localStorage.setItem('doomvault-player-state-v11','broken-json-SECRET'));
  await d.getByRole('button',{name:'Testar novamente',exact:true}).click();await dp.waitFor();
  assert.match(await dp.inputValue(),/ATENÇÃO — Formato da fila salva/);
  assert.equal((await dp.inputValue()).includes('SECRET'),false);
  assert.match(await d.locator('.bz-self-diagnostics').innerText(),/estado diferente/);
  assert.equal(await d.evaluate(()=>localStorage.getItem('doomvault-player-state-v11')),'broken-json-SECRET');
  // Hold a local probe until cancellation, without sending it to the server.
  await d.evaluate(()=>{
    const original=window.fetch;window.originalDiagnosticFetch=original;
    window.fetch=(input,init)=>String(input).endsWith('/api/library/tracks')?new Promise((resolve,reject)=>init.signal.addEventListener('abort',()=>reject(new DOMException('aborted','AbortError')),{once:true})):original(input,init);
  });
  await d.getByRole('button',{name:'Executar verificação',exact:true}).click();
  await d.getByText('Verificando: Biblioteca de músicas…',{exact:true}).waitFor();
  await d.getByRole('button',{name:'Cancelar verificação',exact:true}).click();
  await d.getByText('Verificação cancelada.',{exact:true}).waitFor();
  assert.equal(await dp.count(),0);
  await d.evaluate(()=>{
    window.fetch=window.originalDiagnosticFetch;
    window.__TAURI__={core:{invoke:async(command,args)=>{
      if(command==='desktop_version')return '2.0.test';
      if(command==='desktop_update_status')return {enabled:false,channel:'preview'};
      if(command==='desktop_open_diagnostic_issue'){window.nativeDiagnosticUrl=args.url;return;}
      throw Error('unsupported');
    }}};
  });
  await d.getByLabel('Tipo de verificação',{exact:true}).selectOption('quick');
  await d.getByRole('button',{name:'Executar verificação',exact:true}).click();await dp.waitFor();
  assert.match(await dp.inputValue(),/ATENÇÃO — Configuração de atualização/);
  await d.getByRole('button',{name:'Revisar issue no GitHub'}).click();
  assert.match(await d.evaluate(()=>window.nativeDiagnosticUrl),/^https:\/\/github.com\/BadZ7br\/BZtune\/issues\/new\?/);
  assert.deepEqual(deep.errors,[]);await d.close();
  await p.close();console.log('PASS diagnostics success, partial failure, privacy, export and GitHub draft');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
