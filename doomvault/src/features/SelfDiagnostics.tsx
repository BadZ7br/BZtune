import { useEffect, useRef, useState } from 'react';
import { diagnosticIssueUrl, diagnosticMarkdown, runDiagnostics, type DiagnosticReport } from '../services/self-diagnostics';

const nativeCore = () => (window as Window & {__TAURI__?:{core?:{invoke:(command:string,args?:object)=>Promise<unknown>}}}).__TAURI__?.core;

export default function SelfDiagnostics() {
  const [report,setReport]=useState<DiagnosticReport|null>(null);
  const [mode,setMode]=useState<'quick'|'deep'>('quick');
  const [running,setRunning]=useState(false);
  const [status,setStatus]=useState('');
  const [error,setError]=useState('');
  const controller=useRef<AbortController|null>(null);
  useEffect(()=>()=>controller.current?.abort(),[]);
  async function run() {
    if(controller.current)return;
    const current=new AbortController();controller.current=current;
    setRunning(true);setError('');setReport(null);
    try {
      const native=nativeCore();
      const version=native ? String(await native.invoke('desktop_version').catch(()=> 'não identificada')) : 'modo navegador';
      const result=await runDiagnostics(current.signal,setStatus,version,mode);
      if(!current.signal.aborted){setReport(result);setStatus('Verificação concluída. Confira também os itens não testados.');}
    } catch { if(controller.current===current)setStatus('Verificação cancelada.'); }
    finally {if(controller.current===current){controller.current=null;setRunning(false);}}
  }
  function download() {
    if(!report)return;
    const url=URL.createObjectURL(new Blob([diagnosticMarkdown(report)],{type:'text/markdown;charset=utf-8'}));
    const a=document.createElement('a');a.href=url;a.download='BZtune-Diagnostico.md';a.click();setTimeout(()=>URL.revokeObjectURL(url),1500);
  }
  async function issue() {
    if(!report)return;
    setError('');
    const url=diagnosticIssueUrl(report);
    try {
      if(nativeCore()) await nativeCore()!.invoke('desktop_open_diagnostic_issue',{url});
      else if(!window.open(url,'_blank','noopener')) setStatus('Se o GitHub não abriu, permita novas abas no navegador.');
    } catch {setError('Não foi possível abrir o GitHub. Baixe o relatório e anexe a uma issue no repositório BadZ7br/BZtune.');}
  }
  return <article className="bz-self-diagnostics"><h3>Verificação do BZtune</h3>
    <p>Verifica serviços locais, formatos das respostas, banco, dependências e leitura das configurações. Não altera sua biblioteca nem interrompe a reprodução.</p>
    <label>Tipo de verificação <select aria-label="Tipo de verificação" disabled={running} value={mode} onChange={e=>setMode(e.target.value as 'quick'|'deep')}><option value="quick">Rápida — serviços locais</option><option value="deep">Aprofundada — inclui conexões externas</option></select></label>
    <p>A aprofundada faz consultas de diagnóstico ao LRCLIB, YouTube Music e GitHub sem enviar dados das suas músicas. Pode levar cerca de um minuto.</p>
    <div className="bz-action-row"><button disabled={running} onClick={()=>void run()}>Executar verificação</button>{running&&<button onClick={()=>controller.current?.abort()}>Cancelar verificação</button>}</div>
    <p role="status">{running?`Verificando: ${status}…`:status}</p>
    {error&&<p role="alert" className="bz-error">{error}</p>}
    {report&&<><p>O relatório contém apenas resultados técnicos, versão e data. Confira o texto antes de compartilhar publicamente.</p>
      <label>Relatório para revisão<textarea aria-label="Relatório do diagnóstico" readOnly value={diagnosticMarkdown(report)} rows={16} style={{width:'100%'}}/></label>
      <div className="bz-action-row"><button onClick={download}>Baixar diagnóstico</button><button onClick={()=>void issue()}>Revisar issue no GitHub</button></div>
      <p>O GitHub abrirá com o texto preenchido. Entre na sua conta e confirme a publicação; nada é enviado automaticamente.</p></>}
  </article>;
}
