import {useEffect,useRef,useState} from 'react';
import {bridge} from './services/audio';
type Preview={token:string;tracks:number;queued:number;favorites:number;playlists:number;albums:number;createdAt:string};
export default function Backup({disabled,onWorking,onRestore,active=true}:{active?:boolean;disabled:boolean;onWorking:(busy:boolean)=>void;onRestore:(token:string)=>Promise<void>}) {
  const [preview,setPreview]=useState<Preview|null>(null);const [working,setWorking]=useState(false);const [error,setError]=useState('');const [message,setMessage]=useState('');
  const alive=useRef(true);const busy=useRef(false);const native=!!bridge();
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;onWorking(false);};},[onWorking]);
  async function invoke(command:string) {const core=bridge();if(!core)throw Error('Use o APK Android para acessar arquivos.');return core.invoke(`plugin:bztune-audio|${command}`);}
  async function operate(task:()=>Promise<void>) {
    if(busy.current||disabled)return;
    busy.current=true;setWorking(true);onWorking(true);setError('');setMessage('');
    try{await task();}catch(e){if(alive.current)setError(e instanceof Error?e.message:typeof e==='string'?e:'Não foi possível concluir a operação.');}
    finally{busy.current=false;if(alive.current){setWorking(false);onWorking(false);}}
  }
  if(!active)return null;
  return <section className="mobile-backup" aria-labelledby="backup-title"><h2 id="backup-title">Backup dos dados</h2>
    <p>Salve catálogo, favoritas, playlists, álbuns e fila. Limite de 10 MB por arquivo. Músicas, capas e permissões de acesso não são incluídas; os originais precisam continuar disponíveis.</p>
    <div className="queue-row-actions">
      <button disabled={!native||disabled||working} onClick={()=>void operate(async()=>{const result=await invoke('export_backup') as {exported?:boolean;cancelled?:boolean};if(result?.cancelled)return;if(result?.exported!==true)throw Error('Não foi possível confirmar a exportação.');if(alive.current)setMessage('Backup exportado para o destino escolhido.');})}>Exportar backup</button>
      <button disabled={!native||disabled||working} onClick={()=>void operate(async()=>{const result=await invoke('export_previous_backup') as {exported?:boolean;cancelled?:boolean};if(result?.cancelled)return;if(result?.exported!==true)throw Error('Não foi possível confirmar a exportação.');if(alive.current)setMessage('Cópia anterior exportada.');})}>Exportar cópia anterior</button>
      <button disabled={!native||disabled||working} onClick={()=>void operate(async()=>{
        setPreview(null);
        const result=await invoke('stage_backup') as Preview&{cancelled?:boolean};if(result?.cancelled)return;
        if(!result||typeof result.token!=='string'||result.token.length===0||result.token.length>200||typeof result.createdAt!=='string'||!Number.isInteger(result.tracks)||result.tracks<0||result.tracks>10000||!Number.isInteger(result.favorites)||result.favorites<0||result.favorites>result.tracks||!Number.isInteger(result.playlists)||result.playlists<0||result.playlists>100||!Number.isInteger(result.albums)||result.albums<0||result.albums>2000||!Number.isInteger(result.queued)||result.queued<0||result.queued>200)throw Error('Prévia de backup inválida; nada foi restaurado.');
        if(alive.current)setPreview(result);
      })}>Escolher backup para conferir</button>
    </div>
    {working&&<p role="status">Aguarde a conclusão…</p>}{message&&<p role="status">{message}</p>}{error&&<p role="alert">{error}</p>}
    {preview&&<div className="backup-preview" role="region" aria-label="Confirmar restauração">
      <h3>Confira antes de restaurar</h3><p>{preview.tracks} música(s) no catálogo e {preview.queued} na fila; {preview.favorites} favorita(s); {preview.playlists} playlist(s); {preview.albums} álbum(ns) salvo(s).</p>
      <p>A restauração substitui catálogo, favoritas, playlists, álbuns salvos e fila atuais e deixa o player pausado. O aplicativo guarda uma cópia anterior privada. Os arquivos de áudio não são alterados. Backups da versão 0.4.0 não contêm favoritas; os da 0.4.0/0.5.0 não contêm playlists. Backups até a 0.6.0 não contêm álbuns salvos. Pode ser necessário escolher os originais novamente para recuperar o acesso.</p>
      <button disabled={disabled||working} onClick={()=>void operate(async()=>{try {await onRestore(preview.token);if(alive.current)setMessage('Backup restaurado. Confira o acesso aos arquivos pelo seletor Android.');}finally {if(alive.current)setPreview(null);}})}>Confirmar restauração</button>
      <button disabled={disabled||working} onClick={()=>void operate(async()=>{const result=await invoke('cancel_backup') as {cancelled?:boolean};if(result?.cancelled!==true)throw Error('Não foi possível cancelar a prévia.');if(alive.current)setPreview(null);})}>Cancelar restauração</button>
    </div>}
  </section>;
}
