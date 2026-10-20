import { apiFetch } from "../services/api-fetch";
import { useEffect, useRef, useState } from "react";
import { Archive, Download, HardDrive, RefreshCw, ShieldCheck, Upload } from "lucide-react";

import { usePlayer } from "../player/PlayerContext";
import { parseBrowserBackup, applyBrowserBackup } from "../services/browser-backup";

const API="http://127.0.0.1:5000";
const LOCAL_KEYS = (key: string) => key.startsWith("bztune-") || key.startsWith("doomvault-");
type Diagnosis = {python:string;platform:string;packages:Record<string,boolean>;ffmpeg:Record<string,string|null>;sqliteOK:boolean;tracks:number;libraryPath:string;freeBytes:number|null};

type BrowserBackup = {format:"bztune-browser-settings-v1";createdAt:string;settings:Record<string,string>};

function downloadBlob(blob:Blob,filename:string) {
  const url=URL.createObjectURL(blob);
  const anchor=document.createElement("a");anchor.href=url;anchor.download=filename;anchor.click();
  window.setTimeout(()=>URL.revokeObjectURL(url),1500);
}

export default function DataToolsPage(){
  const { setPlaying } = usePlayer();
  const [diag,setDiag]=useState<Diagnosis|null>(null);
  const [error,setError]=useState("");
  const [message,setMessage]=useState("");
  const [working,setWorking]=useState(false);
  const [revision,setRevision]=useState(0);
  const busyDialog=useRef<HTMLDialogElement>(null);
  const native=(window as Window & {__TAURI__?:{core?:{invoke:(cmd:string,args?:object)=>Promise<unknown>}}}).__TAURI__?.core;
  useEffect(()=>{ if(working) busyDialog.current?.showModal(); else busyDialog.current?.close(); },[working]);
  const browserInput=useRef<HTMLInputElement>(null);
  const archiveInput=useRef<HTMLInputElement>(null);
  useEffect(()=>{
    let live=true;
    apiFetch(`${API}/api/bztune/maintenance/diagnostics`).then(async r=>{if(!r.ok)throw Error("API indisponível");return await r.json() as Diagnosis;})
      .then(d=>{if(live)setDiag(d);}).catch(e=>{if(live)setError(e instanceof Error?e.message:"Serviço local indisponível");});
    return()=>{live=false;};
  },[revision]);

  function exportBrowser(){
    try {
    const settings:Record<string,string>={};
    for(let i=0;i<localStorage.length;i++){
      const key=localStorage.key(i);
      if(key&&LOCAL_KEYS(key)){const value=localStorage.getItem(key);if(value!==null)settings[key]=value;}
    }
    const backup:BrowserBackup={format:"bztune-browser-settings-v1",createdAt:new Date().toISOString(),settings};
    downloadBlob(new Blob([JSON.stringify(backup,null,2)],{type:"application/json"}),"BZtune-Configuracoes.json");
    setMessage("Configurações exportadas.");
    } catch { setError("Não foi possível ler o armazenamento para exportar as configurações."); }
  }
  async function importBrowser(file:File|undefined){
    if(!file)return;
    setError("");
    try{
      if(file.size>10*1024*1024)throw Error("Arquivo de configurações maior que 10 MB");
      const entries=parseBrowserBackup(JSON.parse(await file.text()));
      if(!window.confirm(`Restaurar ${entries.length} configurações? Algumas preferências atuais serão substituídas. A página será atualizada.`))return;
      applyBrowserBackup(entries,localStorage);
      window.location.reload();
    }catch(e){setError(e instanceof Error?e.message:"Falha na importação");}
  }
  async function stageZip(file:File|undefined){
    if(!file)return;
    if(!window.confirm(native ? "Restaurar este backup? Sua biblioteca atual será guardada em uma cópia de segurança. Aguarde a conclusão antes de fechar o aplicativo." : "Verificar e preparar este backup para restauração offline?"))return;
    setPlaying(false);
    setWorking(true);setError("");setMessage("Verificando integridade do backup, aguarde...");
    try{
      const form=new FormData();form.append("file",file);
      const reply=await apiFetch(`${API}/api/bztune/backup/stage`,{method:"POST",body:form},10*60*1000);
      const info=await reply.json() as {error?:string;files?:number;path?:string;sha256?:string};
      if(!reply.ok)throw Error(info.error||"Backup inválido");
      if(native){
        if(!info.sha256)throw Error("A identificação do backup não foi recebida.");
        setMessage("Restaurando a biblioteca e reiniciando o serviço local. Aguarde...");
        await native.invoke("desktop_restore_backup",{sha256:info.sha256});
        window.location.reload();
        return;
      }
      setMessage(`Backup verificado (${info.files} arquivos) e preparado em ${info.path}. Fecha o Flask e executa scripts/restaurar_bztune.py no terminal, primeiro sem --apply.`);
    }catch(e){setError(e instanceof Error?e.message:typeof e === "string"?e:"Falha ao preparar backup");setMessage("");}
    finally{setWorking(false);}
  }

  return <section className="bz-feat-root">
    <dialog ref={busyDialog} className="bz-maintenance-dialog" aria-label="Restauração em andamento" onCancel={e=>e.preventDefault()}><h2>Preparando sua biblioteca</h2><p role="status">{message}</p><p>Aguarde a conclusão antes de fechar o BZtune.</p></dialog>
    <div className="bz-feat-header"><div><p className="bz-eyebrow">BZTUNE / BACKUP</p><h2>Backup e portabilidade<span>.</span></h2><p>Protege tua biblioteca e prepara a migração para outro computador.</p></div><button title="Recarregar diagnóstico" onClick={()=>setRevision(x=>x+1)}><RefreshCw size={17}/></button></div>
    {error&&<p role="alert" className="bz-error">{error}</p>}{message&&<p role="status" className="bz-hint">{message}</p>}
    <div className="bz-tools-grid"><article><Archive size={27}/><h3>Biblioteca completa</h3><p>Exporta um ZIP com SQLite, músicas, capas e playlists. O banco é copiado com snapshot consistente.</p>
      <a href={`${API}/api/bztune/backup/export`} download="BZtune-Backup.zip"><Download size={17}/> Baixar backup</a></article>
      <article><ShieldCheck size={27}/><h3>Restaurar biblioteca</h3><p>{native ? "Restaura o ZIP pelo aplicativo e guarda a biblioteca anterior em uma cópia de segurança." : "Valida o ZIP para restauração offline, preservando uma cópia da biblioteca anterior."}</p>
        <button disabled={working} onClick={()=>archiveInput.current?.click()}><Upload size={17}/> {native ? "Restaurar backup" : "Verificar backup"}</button>
        <input hidden ref={archiveInput} type="file" accept=".zip,application/zip" onChange={e=>{void stageZip(e.target.files?.[0]);e.target.value="";}}/></article>
      <article><HardDrive size={27}/><h3>Favoritos e configurações</h3><p>Salva favoritos, preferências e letras do aplicativo, separados do backup da biblioteca.</p><div className="bz-action-row">
        <button onClick={exportBrowser}><Download size={17}/> Exportar JSON</button>
        <button onClick={()=>browserInput.current?.click()}><Upload size={17}/> Restaurar JSON</button></div>
        <input hidden ref={browserInput} type="file" accept=".json,application/json" onChange={e=>{void importBrowser(e.target.files?.[0]);e.target.value="";}}/></article></div>
    <h3>Diagnóstico do ambiente</h3>
    {diag ? <div className="bz-diagnostics"><div>Python <strong>{diag.python}</strong></div><div>SQLite <strong>{diag.sqliteOK?"Íntegro":"Verificar banco"}</strong></div><div>Faixas locais <strong>{diag.tracks}</strong></div>
      {Object.entries(diag.packages).map(([name,ok])=><div key={name}>{name}<strong>{ok?"Instalado":"Ausente"}</strong></div>)}
      {Object.entries(diag.ffmpeg).map(([name,path])=><div key={name}>{name}<strong>{path||"Não encontrado"}</strong></div>)}
      <div>Pasta da biblioteca<strong>{diag.libraryPath}</strong></div></div>:<p className="bz-hint">Aguardando o diagnóstico do serviço local.</p>}
    <p className="bz-hint">Para transferir entre PCs: exporta o ZIP e o JSON; instala o BZtune no novo PC; restaura o ZIP pela versão instalada; depois importa o JSON na interface.</p>
  </section>;
}
