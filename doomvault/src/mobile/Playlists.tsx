import {useEffect,useRef,useState} from 'react';
import {isAndroidBridgeAvailable} from './services/audio';
import {playlists,type PlaylistsState,type PlaylistRequest} from './services/playlists';
export type PendingTrack={id:string;title:string};
type Props={disabled:boolean;catalogRevision:number;pending:PendingTrack|null;onClearPending:()=>void;onWorking:(busy:boolean)=>void;onPlay:(id:string,revision:number,append:boolean)=>Promise<void>};
export default function Playlists({disabled,catalogRevision,pending,onClearPending,onWorking,onPlay}:Props) {
  const [data,setData]=useState<PlaylistsState|null>(null);const [selectedId,setSelectedId]=useState('');
  const [name,setName]=useState('');const [rename,setRename]=useState('');const [deleting,setDeleting]=useState(false);
  const [error,setError]=useState('');const [message,setMessage]=useState('');const [loading,setLoading]=useState(false);const [working,setWorking]=useState(false);const [revision,setRevision]=useState(0);
  const alive=useRef(true);const operation=useRef(false);const epoch=useRef(0);const heading=useRef<HTMLHeadingElement>(null);const native=isAndroidBridgeAvailable();
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;epoch.current++;onWorking(false);};},[onWorking]);
  useEffect(()=>{if(pending){heading.current?.focus();heading.current?.scrollIntoView({block:'start'});}},[pending]);
  useEffect(()=>{
    const current=++epoch.current;if(!native||working)return;
    setLoading(true);let stopped=false;
    void playlists({action:'list',id:selectedId}).then(result=>{if(!stopped&&alive.current&&current===epoch.current){setData(result);}}).catch(e=>{if(!stopped&&alive.current&&current===epoch.current)setError((e as Error).message);}).finally(()=>{if(!stopped&&alive.current&&current===epoch.current)setLoading(false);});
    return()=>{stopped=true;};
  },[selectedId,catalogRevision,revision,working,native]);
  const selected=data?.selected?.id===selectedId?data.selected:null;
  useEffect(()=>{setRename(selected?.name??'');setDeleting(false);},[selected?.id,selected?.name]);
  async function operate(task:()=>Promise<void>) {
    if(operation.current||disabled)return;
    operation.current=true;epoch.current++;setWorking(true);setLoading(false);onWorking(true);setError('');setMessage('');
    try {await task();}catch(e){if(alive.current)setError((e as Error).message);}
    finally {operation.current=false;if(alive.current){setWorking(false);onWorking(false);}}
  }
  async function edit(request:PlaylistRequest,success:string) {
    const result=await playlists(request);
    if(alive.current){setData(result);setSelectedId(result.selected?.id??'');setMessage(success);setDeleting(false);if(['delete','remove','add'].includes(request.action))heading.current?.focus();}
  }
  const locked=disabled||loading||working||!native;
  function selectedRequest(action:PlaylistRequest['action']):PlaylistRequest {return {action,id:selected!.id,revision:selected!.revision};}
  return <section className="mobile-playlists" aria-labelledby="playlists-title">
    <h2 id="playlists-title" tabIndex={-1} ref={heading}>Playlists locais</h2>
    <p>Organize referências às músicas da biblioteca, sem duplicar os arquivos.</p>
    <form onSubmit={e=>{e.preventDefault();void operate(async()=>{await edit({action:'create',name},'Playlist criada.');if(alive.current)setName('');});}}>
      <label htmlFor="playlist-name">Nome da nova playlist</label><input id="playlist-name" value={name} maxLength={120} disabled={locked} onChange={e=>setName(e.target.value)}/>
      <button disabled={locked||!name.trim()||(data?.playlists.length??0)>=100}>Criar playlist</button>
    </form>
    {data&&<label className="playlist-selector">Playlist<select value={selectedId} disabled={locked} onChange={e=>{setError('');setSelectedId(e.target.value);setDeleting(false);}}><option value="">Escolha uma playlist</option>{data.playlists.map(p=><option key={p.id} value={p.id}>{p.name} · {p.count} música(s)</option>)}</select></label>}
    {pending&&<div className="backup-preview"><p>Música selecionada: <strong>{pending.title}</strong>. Escolha ou crie uma playlist para adicioná-la.</p>
      <button disabled={locked||!selected||selected.tracks.some(t=>t.id===pending.id)} onClick={()=>void operate(async()=>{await edit({...selectedRequest('add'),trackId:pending.id},'Música adicionada à playlist.');if(alive.current)onClearPending();})}>Adicionar música selecionada</button>
      <button disabled={working} onClick={onClearPending}>Cancelar seleção da música</button>
    </div>}
    {loading&&<p role="status">Carregando playlists…</p>}{working&&<p role="status">Atualizando playlist…</p>}{message&&<p role="status">{message}</p>}
    {error&&<div role="alert"><p>{error}</p><button disabled={working||disabled} onClick={()=>{setError('');setRevision(v=>v+1);}}>Recarregar playlists</button></div>}
    {data?.playlists.length===0&&!loading&&<p>Nenhuma playlist criada. Comece dando um nome à sua primeira playlist.</p>}
    {selected&&<div className="playlist-detail"><h3>{selected.name}</h3><p>{selected.count} música(s). Adicione faixas usando “Adicionar à playlist” na biblioteca.</p>
      <div className="queue-row-actions"><button disabled={locked||selected.count===0} onClick={()=>void operate(()=>onPlay(selected.id,selected.revision,false))}>Tocar playlist</button><button disabled={locked||selected.count===0} onClick={()=>void operate(()=>onPlay(selected.id,selected.revision,true))}>Adicionar playlist à fila</button></div>
      <form onSubmit={e=>{e.preventDefault();void operate(()=>edit({...selectedRequest('rename'),name:rename},'Playlist renomeada.'));}}><label htmlFor="playlist-rename">Renomear playlist</label><input id="playlist-rename" value={rename} maxLength={120} disabled={locked} onChange={e=>setRename(e.target.value)}/><button disabled={locked||!rename.trim()||rename.trim()===selected.name}>Salvar nome</button></form>
      <ol>{selected.tracks.map((track,index)=><li key={track.id}><strong>{track.title}</strong><p>{track.artist} · {track.album}</p><div className="queue-row-actions">
        <button disabled={locked||index===0} aria-label={`Subir ${track.title} na playlist`} onClick={()=>void operate(()=>{const ids=selected.tracks.map(t=>t.id);[ids[index-1],ids[index]]=[ids[index],ids[index-1]];return edit({...selectedRequest('reorder'),trackIds:ids},'Ordem salva.');})}>Subir</button>
        <button disabled={locked||index===selected.tracks.length-1} aria-label={`Descer ${track.title} na playlist`} onClick={()=>void operate(()=>{const ids=selected.tracks.map(t=>t.id);[ids[index+1],ids[index]]=[ids[index],ids[index+1]];return edit({...selectedRequest('reorder'),trackIds:ids},'Ordem salva.');})}>Descer</button>
        <button disabled={locked} aria-label={`Remover ${track.title} da playlist`} onClick={()=>void operate(()=>edit({...selectedRequest('remove'),trackId:track.id},'Música removida da playlist; o arquivo foi preservado.'))}>Remover da playlist</button>
      </div></li>)}</ol>
      {selected.count===0&&<p>Esta playlist está vazia.</p>}
      {!deleting?<button disabled={locked} onClick={()=>setDeleting(true)}>Excluir playlist</button>:<div className="backup-preview" role="group" aria-label="Confirmar exclusão da playlist"><p>Excluir “{selected.name}”? A biblioteca, os arquivos e a fila de reprodução serão preservados.</p><button disabled={locked} onClick={()=>void operate(()=>edit(selectedRequest('delete'),'Playlist excluída. Os arquivos e a fila foram preservados.'))}>Confirmar exclusão</button><button disabled={working} onClick={()=>setDeleting(false)}>Cancelar exclusão</button></div>}
    </div>}
    <p>Até 100 playlists, com 200 músicas em cada uma. A mesma faixa entra uma vez por playlist. Arquivos removidos da biblioteca também saem das playlists.</p>
  </section>;
}
