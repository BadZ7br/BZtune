import { useEffect, useRef, useState } from "react";
import { Archive, Download, HardDrive, RefreshCw, ShieldCheck, Upload } from "lucide-react";

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
  const [diag,setDiag]=useState<Diagnosis|null>(null);
  const [error,setError]=useState("");
  const [message,setMessage]=useState("");
  const [working,setWorking]=useState(false);
  const [revision,setRevision]=useState(0);
  const browserInput=useRef<HTMLInputElement>(null);
  const archiveInput=useRef<HTMLInputElement>(null);
  useEffect(()=>{
    let live=true;
    fetch(`${API}/api/bztune/maintenance/diagnostics`).then(async r=>{if(!r.ok)throw Error("API indisponível");return await r.json() as Diagnosis;})
      .then(d=>{if(live)setDiag(d);}).catch(e=>{if(live)setError(e instanceof Error?e.message:"Sem conexão com Flask");});
    return()=>{live=false;};
  },[revision]);

  function exportBrowser(){
    const settings:Record<string,string>={};
    for(let i=0;i<localStorage.length;i++){
      const key=localStorage.key(i);
      if(key&&LOCAL_KEYS(key)){const value=localStorage.getItem(key);if(value!==null)settings[key]=value;}
    }
    const backup:BrowserBackup={format:"bztune-browser-settings-v1",createdAt:new Date().toISOString(),settings};
    downloadBlob(new Blob([JSON.stringify(backup,null,2)],{type:"application/json"}),"BZtune-Configuracoes.json");
    setMessage("Preferências do navegador exportadas.");
  }
  async function importBrowser(file:File|undefined){
    if(!file)return;
    setError("");
    try{
      if(file.size>10*1024*1024)throw Error("Arquivo de configurações maior que 10 MB");
      const parsed=JSON.parse(await file.text()) as Partial<BrowserBackup>;
      if(parsed.format!=="bztune-browser-settings-v1"||!parsed.settings||typeof parsed.settings!=="object")throw Error("Formato inválido");
      const entries=Object.entries(parsed.settings).filter(([key,value])=>LOCAL_KEYS(key)&&typeof value==="string");
      if(!window.confirm(`Restaurar ${entries.length} configurações? Algumas preferências atuais serão substituídas. A página será atualizada.`))return;
      for(const [key,value]of entries)localStorage.setItem(key,value);
      window.location.reload();
    }catch(e){setError(e instanceof Error?e.message:"Falha na importação");}
  }
  async function stageZip(file:File|undefined){
    if(!file)return;
    if(!window.confirm("Verificar e preparar este backup? O BZtune NÃO fará a restauração enquanto o Flask estiver ligado."))return;
    setWorking(true);setError("");setMessage("Verificando integridade do backup, aguarde...");
    try{
      const form=new FormData();form.append("file",file);
      const reply=await fetch(`${API}/api/bztune/backup/stage`,{method:"POST",body:form});
      const info=await reply.json() as {error?:string;files?:number;path?:string};
      if(!reply.ok)throw Error(info.error||"Backup inválido");
      setMessage(`Backup verificado (${info.files} arquivos) e preparado em ${info.path}. Fecha o Flask e executa scripts/restaurar_bztune.py no terminal, primeiro sem --apply.`);
    }catch(e){setError(e instanceof Error?e.message:"Falha ao preparar backup");setMessage("");}
    finally{setWorking(false);}
  }

  return <section className="bz-feat-root">
    <div className="bz-feat-header"><div><p className="bz-eyebrow">BZTUNE / BACKUP</p><h2>Backup e portabilidade<span>.</span></h2><p>Protege tua biblioteca e prepara a migração para outro computador.</p></div><button title="Recarregar diagnóstico" onClick={()=>setRevision(x=>x+1)}><RefreshCw size={17}/></button></div>
    {error&&<p role="alert" className="bz-error">{error}</p>}{message&&<p role="status" className="bz-hint">{message}</p>}
    <div className="bz-tools-grid"><article><Archive size={27}/><h3>Biblioteca completa</h3><p>Exporta um ZIP com SQLite, músicas, capas e playlists. O banco é copiado com snapshot consistente.</p>
      <a href={`${API}/api/bztune/backup/export`} download="BZtune-Backup.zip"><Download size={17}/> Baixar backup</a></article>
      <article><ShieldCheck size={27}/><h3>Restaurar biblioteca</h3><p>Seleciona um ZIP para validar. A substituição só será feita com o Flask fechado, por um script que guarda o estado anterior.</p>
        <button disabled={working} onClick={()=>archiveInput.current?.click()}><Upload size={17}/> Verificar backup</button>
        <input hidden ref={archiveInput} type="file" accept=".zip,application/zip" onChange={e=>{void stageZip(e.target.files?.[0]);e.target.value="";}}/></article>
      <article><HardDrive size={27}/><h3>Favoritos e configurações</h3><p>Salva as preferências e letras que ficam no navegador, separadas do backup SQLite.</p><div className="bz-action-row">
        <button onClick={exportBrowser}><Download size={17}/> Exportar JSON</button>
        <button onClick={()=>browserInput.current?.click()}><Upload size={17}/> Restaurar JSON</button></div>
        <input hidden ref={browserInput} type="file" accept=".json,application/json" onChange={e=>{void importBrowser(e.target.files?.[0]);e.target.value="";}}/></article></div>
    <h3>Diagnóstico do ambiente</h3>
    {diag ? <div className="bz-diagnostics"><div>Python <strong>{diag.python}</strong></div><div>SQLite <strong>{diag.sqliteOK?"Íntegro":"Verificar banco"}</strong></div><div>Faixas locais <strong>{diag.tracks}</strong></div>
      {Object.entries(diag.packages).map(([name,ok])=><div key={name}>{name}<strong>{ok?"Instalado":"Ausente"}</strong></div>)}
      {Object.entries(diag.ffmpeg).map(([name,path])=><div key={name}>{name}<strong>{path||"Não encontrado"}</strong></div>)}
      <div>Pasta da biblioteca<strong>{diag.libraryPath}</strong></div></div>:<p className="bz-hint">Ligue o Flask para executar o diagnóstico.</p>}
    <p className="bz-hint">Para transferir entre PCs: exporta o ZIP e o JSON; instala o BZtune no novo PC; restaura o ZIP com o Flask desligado; depois importa o JSON na interface.</p>
  </section>;
}
