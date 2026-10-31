const navigation=require('./navigation-helpers.cjs');
/** UI workflow only; actual JSON/SQLite transactions are tested by Kotlin on API 24. */
const assert=require('node:assert/strict'),path=require('node:path');
const {createRequire}=require('node:module');
const {chromium}=createRequire(path.resolve(__dirname,'../../doomvault/package.json'))('playwright');
(async()=>{
 const browser=await chromium.launch({...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{}),args:['--no-sandbox']});
 try {
  const page=await browser.newPage({viewport:{width:360,height:820}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{
   window.commands=[];window.badBackupPreview=false;window.cancelBackupPicker=false;window.failRestore=false;
   const player={title:'Original',hasTrack:true,playing:true,loading:false,position:12000,duration:120000,failed:false,queue:[{id:'original',title:'Original'}],index:0,shuffle:false,repeat:0,canNext:false,canPrevious:false};
   window.__TAURI__={core:{invoke:async(name,args)=>{
    const cmd=name.split('|')[1];window.commands.push({cmd,args});
    if(cmd==='playlists')return {playlists:[],selected:null};
    if(cmd==='albums')return {items:[],total:0,page:0,pageSize:50,artists:[]};
    if(cmd==='track_details')return {id:args.id,artist:'Artista',album:'Disco',cover:null};
    if(cmd==='library_list')return {items:[{id:'record',title:player.title,artist:'Artista',album:'Album',year:'2020',duration:120000,favorite:false,cover:null}],total:1,page:0,pageSize:50,artists:['Artista'],albums:[]};
    if(cmd==='export_backup'||cmd==='export_previous_backup')return {exported:true};
    if(cmd==='stage_backup')return window.cancelBackupPicker?{cancelled:true}:window.badBackupPreview?{token:'invalid',tracks:'bad'}:{token:'fixture-token',tracks:1,queued:1,favorites:1,playlists:0,albums:0,createdAt:'2026-10-31T00:00:00Z'};
    if(cmd==='cancel_backup')return {cancelled:true};
    if(cmd==='restore_backup'){
     if(window.failRestore)throw Error('Não foi possível restaurar. Seus dados anteriores foram preservados.');
     return new Promise(resolve=>{window.finishRestore=()=>{
      player.title='Restaurada';player.queue=[{id:'restored',title:'Restaurada'}];player.playing=false;player.position=25000;
      resolve({...player,queue:[...player.queue]});
     };});
    }
    return {...player,queue:[...player.queue]};
   }}};
  });
  await page.goto('http://127.0.0.1:1420/mobile.html');
  await navigation.nav(page,'Ajustes');
  const backup=page.getByRole('region',{name:'Backup dos dados',exact:true});
  await navigation.trackTitle(page,'Original').waitFor();
  await backup.getByRole('button',{name:'Exportar backup',exact:true}).click();
  await backup.getByRole('status').filter({hasText:'Backup exportado'}).waitFor();
  await backup.getByRole('button',{name:'Escolher backup para conferir',exact:true}).click();
  await backup.getByRole('region',{name:'Confirmar restauração',exact:true}).waitFor();
  await backup.getByText('1 música(s) no catálogo e 1 na fila; 1 favorita(s); 0 playlist(s); 0 álbum(ns) salvo(s).',{exact:true}).waitFor();
  assert.equal(await page.evaluate(()=>window.commands.some(c=>c.cmd==='restore_backup')),false);
  await backup.getByRole('button',{name:'Cancelar restauração',exact:true}).click();
  assert.equal(await backup.getByRole('region',{name:'Confirmar restauração',exact:true}).count(),0);
  await page.evaluate(()=>{window.badBackupPreview=true;});
  await backup.getByRole('button',{name:'Escolher backup para conferir',exact:true}).click();
  await backup.getByRole('alert').filter({hasText:'Prévia de backup inválida'}).waitFor();
  assert.equal(await navigation.trackTitle(page,'Original').isVisible(),true);
  await page.evaluate(()=>{window.badBackupPreview=false;});
  await backup.getByRole('button',{name:'Escolher backup para conferir',exact:true}).click();
  await backup.getByRole('button',{name:'Confirmar restauração',exact:true}).click();
  await page.waitForFunction(()=>typeof window.finishRestore==='function');
  assert.equal(await page.getByRole('navigation',{name:'Navegação principal',exact:true}).getByRole('button',{name:'Biblioteca',exact:true}).isDisabled(),true);
  assert.equal(await backup.getByRole('button',{name:'Confirmar restauração',exact:true}).isDisabled(),true);
  await page.evaluate(()=>window.finishRestore());
  await navigation.trackTitle(page,'Restaurada').waitFor();
  await page.getByRole('button',{name:'Tocar',exact:true}).waitFor();
  await backup.getByRole('status').filter({hasText:'Backup restaurado'}).waitFor();
  assert.equal(await backup.getByRole('region',{name:'Confirmar restauração',exact:true}).count(),0);
  await backup.getByRole('button',{name:'Exportar cópia anterior',exact:true}).click();
  await backup.getByRole('status').filter({hasText:'Cópia anterior exportada'}).waitFor();
  await page.evaluate(()=>{window.failRestore=true;});
  await backup.getByRole('button',{name:'Escolher backup para conferir',exact:true}).click();
  await backup.getByRole('button',{name:'Confirmar restauração',exact:true}).click();
  await backup.getByRole('alert').filter({hasText:'dados anteriores foram preservados'}).waitFor();
  assert.equal(await backup.getByRole('region',{name:'Confirmar restauração',exact:true}).count(),0);
  assert.equal(await navigation.trackTitle(page,'Restaurada').isVisible(),true);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  assert.deepEqual(errors,[]);await page.close();
  console.log('PASS mobile backup export, explicit confirmation, cancellation, invalid preview, mutation locking, paused restore and failure recovery');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
