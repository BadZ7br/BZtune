import { useEffect, useRef, useState } from 'react';
import { diagnosticIssueUrl, diagnosticMarkdown, runDiagnostics, type DiagnosticReport } from '../services/self-diagnostics';

const nativeCore = () => (window as Window & {__TAURI__?:{core?:{invoke:(command:string,args?:object)=>Promise<unknown>}}}).__TAURI__?.core;

async function nativeDiagnosticCommand(command: string): Promise<unknown> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {return await Promise.race([nativeCore()!.invoke(command), new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('timeout')),4000);})]);}
  finally {clearTimeout(timer);}
}

export default function SelfDiagnostics() {
  const [report,setReport]=useState<DiagnosticReport|null>(null);
  const [mode,setMode]=useState<'quick'|'deep'>('quick');
  const [running,setRunning]=useState(false);
  const [status,setStatus]=useState('');
  const [description,setDescription]=useState('');
  const [comparison,setComparison]=useState('');
  const previous=useRef<DiagnosticReport|null>(null);
  const [error,setError]=useState('');
  const controller=useRef<AbortController|null>(null);
  useEffect(()=>()=>controller.current?.abort(),[]);
  async function run() {
    if(controller.current)return;
    const current=new AbortController();controller.current=current;
    setRunning(true);setError('');setReport(null);
    try {
      const native=nativeCore();
      const version=native ? String(await nativeDiagnosticCommand('desktop_version').catch(()=> 'não identificada')) : 'modo navegador';
      const result=await runDiagnostics(current.signal,setStatus,version,mode);
      current.signal.throwIfAborted();
      if(native) {
        try {
          const value = await nativeDiagnosticCommand('desktop_update_status') as {enabled?:boolean;channel?:string};
          if(typeof value?.enabled !== 'boolean') throw Error('format');
          result.checks.push({name:'Configuração de atualização',status:value.enabled?'ok':'warning',detail:value.enabled?'Atualizador habilitado; download e assinatura não foram testados.':'Atualizador não habilitado nesta instalação.'});
        } catch {result.checks.push({name:'Configuração de atualização',status:'failed',detail:'Não foi possível consultar o atualizador.'});}
      } else result.checks.push({name:'Configuração de atualização',status:'not-tested',detail:'Disponível apenas no aplicativo desktop.'});
      if(!current.signal.aborted){
        const old=previous.current;
        setComparison(old ? `${result.checks.filter(c=>old.checks.some(o=>o.name===c.name && o.status!==c.status)).length} resultado(s) com estado diferente da verificação anterior nesta sessão.` : 'Primeira verificação nesta sessão.');
        previous.current=result;
        setReport(result);setStatus('Verificação concluída. Confira também os itens não testados.');}
    } catch { if(controller.current===current)setStatus('Verificação cancelada.'); }
    finally {if(controller.current===current){controller.current=null;setRunning(false);}}
  }
  function download() {
    if(!report)return;
    const url=URL.createObjectURL(new Blob([diagnosticMarkdown(report,description)],{type:'text/markdown;charset=utf-8'}));
    const a=document.createElement('a');a.href=url;a.download='BZtune-Diagnostico.md';a.click();setTimeout(()=>URL.revokeObjectURL(url),1500);
  }
  async function issue() {
    if(!report)return;
    setError('');
    const url=diagnosticIssueUrl(report,description);
    if(url.length>24000){setError('Relatório extenso: baixe o diagnóstico e anexe a uma issue no GitHub.');return;}
    try {
      if(nativeCore()) await nativeCore()!.invoke('desktop_open_diagnostic_issue',{url});
      else if(!window.open(url,'_blank','noopener')) setStatus('Se o GitHub não abriu, permita novas abas no navegador.');
    } catch {setError('Não foi possível abrir o GitHub. Baixe o relatório e anexe a uma issue no repositório BadZ7br/BZtune.');}
  }
  return <article className="bz-self-diagnostics"><h3>Verificação do BZtune</h3>
    <p>Verifica serviços locais, formatos das respostas, banco, dependências e leitura e gravação temporária das configurações. Não altera sua biblioteca nem interrompe a reprodução.</p>
    <label>Tipo de verificação <select aria-label="Tipo de verificação" disabled={running} value={mode} onChange={e=>setMode(e.target.value as 'quick'|'deep')}><option value="quick">Rápida — serviços locais</option><option value="deep">Aprofundada — inclui conexões externas</option></select></label>
    <p>A aprofundada faz consultas de diagnóstico ao LRCLIB, YouTube Music e GitHub sem enviar dados das suas músicas. Também confere uma amostra de arquivos e ferramentas de download. Usa arquivos temporários para testar gravação. Pode levar cerca de um minuto.</p>
    <div className="bz-action-row"><button disabled={running} onClick={()=>void run()}>Executar verificação</button>{running&&<button onClick={()=>controller.current?.abort()}>Cancelar verificação</button>}</div>
    <p role="status">{running?`Verificando: ${status}…`:status}</p>
    {error&&<p role="alert" className="bz-error">{error}</p>}
    {report&&<><p role="status">{comparison}</p>
      <p>{report.checks.filter(c=>c.status==='ok').length} aprovado(s) · {report.checks.filter(c=>c.status==='failed').length} falha(s) · {report.checks.filter(c=>c.status==='warning').length} aviso(s) · {report.checks.filter(c=>c.status==='not-tested').length} não testado(s)</p>
      <ul>{report.checks.map((check,index)=><li key={index}><strong>{({ok:'Aprovado',failed:'Falhou',warning:'Atenção','not-tested':'Não testado'})[check.status]} — {check.name}</strong><p>{check.detail}</p></li>)}</ul>
      <button disabled={running} onClick={()=>void run()}>Testar novamente</button>
      <label>O que aconteceu? <textarea aria-label="Descrição do problema" maxLength={400} value={description} onChange={e=>setDescription(e.target.value)} placeholder="Descreva os passos e o resultado esperado. Evite dados pessoais." rows={3} style={{width:'100%'}}/></label>
      <p>O relatório contém apenas resultados técnicos, versão e data. Confira o texto antes de compartilhar publicamente.</p>
      <label>Relatório para revisão<textarea aria-label="Relatório do diagnóstico" readOnly value={diagnosticMarkdown(report,description)} rows={16} style={{width:'100%'}}/></label>
      <div className="bz-action-row"><button onClick={download}>Baixar diagnóstico</button><button onClick={()=>void issue()}>Revisar issue no GitHub</button></div>
      <p>O GitHub abrirá com o texto preenchido. Entre na sua conta e confirme a publicação; nada é enviado automaticamente.</p></>}
  </article>;
}
