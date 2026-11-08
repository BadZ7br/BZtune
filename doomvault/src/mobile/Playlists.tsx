import {useEffect,useRef,useState} from 'react';
import {ArrowLeft,Plus,Search,ListMusic,MoreHorizontal,Play,ListPlus,Pencil,Trash2,ArrowUp,ArrowDown} from 'lucide-react';
import ActionSheet from './ActionSheet';
import {isAndroidBridgeAvailable} from './services/audio';
import {playlists,type PlaylistsState,type PlaylistRequest} from './services/playlists';
export type PendingTrack={id:string;title:string;ids?:string[]};
type Sheet='create'|'options'|'rename'|'delete'|{trackId:string}|null;
type Props={active?:boolean;disabled:boolean;catalogRevision:number;selectedId:string|null;onOpen:(id:string|null,replace?:boolean)=>void;onBack:()=>void;onWorking:(busy:boolean)=>void;onPlay:(id:string,revision:number,append:boolean)=>Promise<void>};
export default function Playlists({disabled,catalogRevision,selectedId,onOpen,onBack,onWorking,onPlay,active=true}:Props) {
 const [data,setData]=useState<PlaylistsState|null>(null),[sheet,setSheet]=useState<Sheet>(null);
 const [name,setName]=useState(''),[rename,setRename]=useState(''),[query,setQuery]=useState('');
 const [error,setError]=useState(''),[message,setMessage]=useState(''),[loading,setLoading]=useState(false),[working,setWorking]=useState(false),[revision,setRevision]=useState(0);
 const alive=useRef(true),operation=useRef(false),epoch=useRef(0);const heading=useRef<HTMLHeadingElement>(null);const native=isAndroidBridgeAvailable();
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;epoch.current++;onWorking(false);};},[onWorking]);
 useEffect(()=>{setSheet(null);setError('');setMessage('');heading.current?.focus();},[selectedId,active]);
 useEffect(()=>{
  const current=++epoch.current;if(!active||!native||working)return;setLoading(true);let stopped=false;
  void playlists({action:'list',id:selectedId??''}).then(result=>{if(!stopped&&alive.current&&current===epoch.current){
   if(selectedId&&result.selected?.id!==selectedId){setError('Esta playlist não está mais disponível. Volte à lista para conferir.');setData({...result,selected:null});}
   else setData(result);
  }}).catch(e=>{if(!stopped&&alive.current&&current===epoch.current)setError((e as Error).message);}).finally(()=>{if(!stopped&&alive.current&&current===epoch.current)setLoading(false);});
  return()=>{stopped=true;};
 },[active,selectedId,catalogRevision,revision,working,native]);
 const selected=data?.selected?.id===selectedId?data.selected:null;
 async function operate(task:()=>Promise<void>){
  if(operation.current||disabled)return;operation.current=true;epoch.current++;setWorking(true);setLoading(false);onWorking(true);setError('');setMessage('');
  try{await task();}catch(e){if(alive.current)setError((e as Error).message);}finally{operation.current=false;if(alive.current){setWorking(false);onWorking(false);}}
 }
 async function edit(request:PlaylistRequest,success:string){
  const result=await playlists(request);if(!alive.current)return;setData(result);setMessage(success);
  if(request.action==='create'){if(!result.selected)throw Error('Não foi possível confirmar a playlist criada. Recarregue para conferir.');setName('');onOpen(result.selected.id);}
  if(request.action==='delete')onOpen(null,true);
 }
 const locked=disabled||loading||working||!native;
 const request=(action:PlaylistRequest['action']):PlaylistRequest=>({action,id:selected!.id,revision:selected!.revision});
 function trackAction(trackId:string,delta:number){
  const ids=selected!.tracks.map(t=>t.id),index=ids.indexOf(trackId),to=index+delta;
  if(index<0||to<0||to>=ids.length)return;
  [ids[index],ids[to]]=[ids[to],ids[index]];return edit({...request('reorder'),trackIds:ids},'Ordem salva.');
 }
 if(!active)return null;
 const matching=data?.playlists.filter(p=>p.name.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().includes(query.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase()))??[];
 const sheetTrack=sheet&&typeof sheet==='object'?selected?.tracks.find(t=>t.id===sheet.trackId):null;
 const sheetTitle=sheet==='create'?'Nova playlist':sheet==='rename'?'Renomear playlist':sheet==='delete'?'Excluir playlist':sheetTrack?.title??selected?.name??'Opções da playlist';
 return <section className="mobile-playlists" aria-labelledby="playlists-title">
  <h2 id="playlists-title" className="sr-only" tabIndex={-1} ref={heading}>{selectedId?'Detalhes da playlist':'Playlists locais'}</h2>
  {selectedId?<button className="detail-back" disabled={disabled||working} onClick={onBack}><ArrowLeft/>Voltar</button>:<>
   <div className="playlist-list-toolbar"><div className="library-searchbar"><Search aria-hidden="true"/><label className="sr-only" htmlFor="playlist-search">Buscar playlists</label><input id="playlist-search" type="search" maxLength={120} value={query} onChange={e=>setQuery(e.target.value)} placeholder="Buscar playlists"/></div><button className="icon-button" aria-label="Nova playlist" disabled={locked||(data?.playlists.length??0)>=100} onClick={()=>setSheet('create')}><Plus/></button></div>
  </>}
  {loading&&<p role="status">Carregando playlists…</p>}{working&&<p role="status">Atualizando playlist…</p>}{message&&<p role="status">{message}</p>}
  {error&&<div role="alert"><p>{error}</p><button disabled={working||disabled} onClick={()=>{setError('');setRevision(v=>v+1);}}>Recarregar playlists</button></div>}
  {!selectedId&&data&&<>
   <p className="catalog-count">{data.playlists.length} playlist(s) no aparelho</p>
   {data.playlists.length===0&&!loading&&<div className="playlist-empty"><ListMusic/><h3>Nenhuma playlist criada.</h3><p>Reúna suas músicas para cada momento.</p><button className="primary" disabled={locked} onClick={()=>setSheet('create')}><Plus/>Criar primeira playlist</button></div>}
   {data.playlists.length>0&&matching.length===0&&!loading&&<p>Nenhuma playlist corresponde à busca.</p>}
   <ul className="playlist-list">{matching.map(p=><li key={p.id}><button disabled={locked} aria-label={`Abrir playlist ${p.name}`} onClick={()=>onOpen(p.id)}><span className="playlist-symbol"><ListMusic/></span><span className="track-copy"><strong>{p.name}</strong><span>{p.count} música(s)</span></span><span className="playlist-arrow" aria-hidden="true">›</span></button></li>)}</ul>
  </>}
  {selectedId&&selected&&<div className="playlist-detail">
   <div className="playlist-hero"><ListMusic/><span>PLAYLIST LOCAL</span></div>
   <div className="playlist-detail-heading"><div><h3>{selected.name}</h3><p>{selected.count} música(s)</p></div><button className="icon-button" aria-label="Opções da playlist" disabled={locked} onClick={()=>setSheet('options')}><MoreHorizontal/></button></div>
   <div className="playlist-play-actions"><button className="primary" disabled={locked||selected.count===0} onClick={()=>void operate(()=>onPlay(selected.id,selected.revision,false))}><Play/>Tocar playlist</button><button disabled={locked||selected.count===0} onClick={()=>void operate(()=>onPlay(selected.id,selected.revision,true))}><ListPlus/>Adicionar playlist à fila</button></div>
   <h4>Músicas</h4><ol className="playlist-track-list">{selected.tracks.map((track,index)=><li key={track.id}><span className="playlist-position">{index+1}</span><div className="track-copy"><strong>{track.title}</strong><span>{track.artist} · {track.album}</span></div><button className="icon-button" aria-label={`Opções de ${track.title} na playlist`} disabled={locked} onClick={()=>setSheet({trackId:track.id})}><MoreHorizontal/></button></li>)}</ol>
   {selected.count===0&&<p>Esta playlist está vazia. Abra uma música da biblioteca e use “Adicionar à playlist”.</p>}
  </div>}
  {sheet&&<ActionSheet title={sheetTitle} onClose={()=>setSheet(null)}>{dismiss=><>
   {sheet==='create'&&<form onSubmit={e=>{e.preventDefault();dismiss(()=>void operate(()=>edit({action:'create',name},'Playlist criada.')));}}><label htmlFor="playlist-name">Nome da nova playlist</label><input id="playlist-name" value={name} maxLength={120} disabled={locked} onChange={e=>setName(e.target.value)}/><button className="primary" disabled={locked||!name.trim()||(data?.playlists.length??0)>=100}>Criar playlist</button></form>}
   {sheet==='options'&&selected&&<div className="sheet-actions"><button onClick={()=>{setRename(selected.name);setSheet('rename');}}><Pencil/>Renomear playlist</button><button className="destructive" onClick={()=>setSheet('delete')}><Trash2/>Excluir playlist</button></div>}
   {sheet==='rename'&&selected&&<form onSubmit={e=>{e.preventDefault();dismiss(()=>void operate(()=>edit({...request('rename'),name:rename},'Playlist renomeada.')));}}><label htmlFor="playlist-rename">Renomear playlist</label><input id="playlist-rename" value={rename} maxLength={120} disabled={locked} onChange={e=>setRename(e.target.value)}/><button className="primary" disabled={locked||!rename.trim()||rename.trim()===selected.name}>Salvar nome</button></form>}
   {sheet==='delete'&&selected&&<><p>Excluir “{selected.name}”? A biblioteca, os arquivos e a fila de reprodução serão preservados.</p><div className="sheet-actions"><button className="destructive" disabled={locked} onClick={()=>dismiss(()=>void operate(()=>edit(request('delete'),'Playlist excluída. Os arquivos e a fila foram preservados.')))}><Trash2/>Confirmar exclusão</button><button disabled={working} onClick={()=>dismiss()}>Cancelar exclusão</button></div></>}
   {sheetTrack&&selected&&<div className="sheet-actions"><button disabled={locked||selected.tracks[0]?.id===sheetTrack.id} aria-label={`Subir ${sheetTrack.title} na playlist`} onClick={()=>dismiss(()=>void operate(async()=>{await trackAction(sheetTrack.id,-1);} ))}><ArrowUp/>Mover para cima</button><button disabled={locked||selected.tracks[selected.tracks.length-1]?.id===sheetTrack.id} aria-label={`Descer ${sheetTrack.title} na playlist`} onClick={()=>dismiss(()=>void operate(async()=>{await trackAction(sheetTrack.id,1);} ))}><ArrowDown/>Mover para baixo</button><button className="destructive" disabled={locked} aria-label={`Remover ${sheetTrack.title} da playlist`} onClick={()=>dismiss(()=>void operate(()=>edit({...request('remove'),trackId:sheetTrack.id},'Música removida da playlist; o arquivo foi preservado.')))}><Trash2/>Remover da playlist</button></div>}
  </>}</ActionSheet>}
  <details className="library-help"><summary>Sobre as playlists</summary><p>Até 100 playlists, com 200 músicas em cada uma. A mesma faixa entra uma vez por playlist. Arquivos removidos da biblioteca também saem das playlists. Excluir uma playlist não apaga os arquivos.</p></details>
 </section>;
}
