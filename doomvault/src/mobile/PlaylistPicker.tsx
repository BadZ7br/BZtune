import {useEffect,useRef,useState} from 'react';
import {Check,ListMusic,Plus,Search} from 'lucide-react';
import ActionSheet from './ActionSheet';
import type {PendingTrack} from './Playlists';
import {playlists,type PlaylistsState} from './services/playlists';

type Props={track:PendingTrack;onClose:()=>void;onWorking:(busy:boolean)=>void;onChanged:()=>void;onAdded:(playlistName:string)=>void};
export default function PlaylistPicker({track,onClose,onWorking,onChanged,onAdded}:Props){
 const [data,setData]=useState<PlaylistsState|null>(null),[selectedId,setSelectedId]=useState(''),[query,setQuery]=useState(''),[creating,setCreating]=useState(false),[name,setName]=useState('');
 const [error,setError]=useState(''),[loading,setLoading]=useState(true),[working,setWorking]=useState(false),[revision,setRevision]=useState(0),[completed,setCompleted]=useState('');
 const epoch=useRef(0),alive=useRef(true),operation=useRef(false);const dismiss=useRef<((after?:()=>void)=>void)|null>(null);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;epoch.current++;onWorking(false);};},[onWorking]);
 useEffect(()=>{
  const id=++epoch.current;if(working)return;let stopped=false;setLoading(true);setError('');
  void playlists({action:'list',id:selectedId}).then(result=>{if(!stopped&&alive.current&&epoch.current===id){
   if(selectedId&&result.selected?.id!==selectedId)throw Error('A playlist mudou. Escolha outra ou recarregue.');setData(result);
  }}).catch(e=>{if(!stopped&&alive.current&&epoch.current===id)setError((e as Error).message);}).finally(()=>{if(!stopped&&alive.current&&epoch.current===id)setLoading(false);});
  return()=>{stopped=true;};
 },[selectedId,revision]);
 useEffect(()=>{if(completed&&!working)dismiss.current?.(()=>onAdded(completed));},[completed,working,onAdded]);
 const selected=data?.selected?.id===selectedId?data.selected:null;
 const requested=track.ids??[track.id];
 const missing=requested.filter(id=>!selected?.tracks.some(t=>t.id===id));
 const duplicate=!!selected&&missing.length===0;
 const locked=loading||working;
 async function mutate(create:boolean){
  if(operation.current||locked||(!create&&(!selected||duplicate||selected.count+missing.length>200||error)))return;
  operation.current=true;epoch.current++;setWorking(true);onWorking(true);setError('');
  try{
   const result=create?await playlists({action:'create',name}):await playlists(track.ids?{action:'add_many',id:selected!.id,revision:selected!.revision,trackIds:requested}:{action:'add',id:selected!.id,revision:selected!.revision,trackId:track.id});
   if(!alive.current)return;
   if(!result.selected||(!create&&result.selected.id!==selected!.id)||(!create&&!requested.every(id=>result.selected!.tracks.some(t=>t.id===id))))throw Error('Não foi possível confirmar a alteração. Recarregue as playlists para conferir.');
   setData(result);onChanged();
   if(create){setSelectedId(result.selected.id);setCreating(false);setQuery('');setName('');}
   else setCompleted(result.selected.name);
  }catch(e){if(alive.current)setError((e as Error).message);}
  finally{operation.current=false;if(alive.current){setWorking(false);onWorking(false);}}
 }
 const fold=(v:string)=>v.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR');
 const matches=data?.playlists.filter(p=>fold(p.name).includes(fold(query)))??[];
 return <ActionSheet title="Adicionar à playlist" onClose={onClose} busy={working}>{close=>{dismiss.current=close;return <>
  <p className="sheet-subtitle">Música selecionada: <strong>{track.title}</strong></p>
  {loading&&<p role="status">Carregando playlists…</p>}{working&&<p role="status">Salvando playlist…</p>}
  {error&&<div role="alert"><p>{error}</p><button disabled={working} onClick={()=>setRevision(v=>v+1)}>Recarregar playlists</button></div>}
  {creating?<form className="picker-create" onSubmit={e=>{e.preventDefault();void mutate(true);}}><label htmlFor="picker-name">Nome da nova playlist</label><input id="picker-name" autoFocus maxLength={120} value={name} disabled={working} onChange={e=>setName(e.target.value)}/><button className="primary" disabled={locked||!!error||!name.trim()||(data?.playlists.length??0)>=100}>Criar playlist</button><button type="button" disabled={working} onClick={()=>setCreating(false)}>Voltar às playlists</button></form>:<>
   <div className="playlist-list-toolbar"><div className="library-searchbar"><Search aria-hidden="true"/><label className="sr-only" htmlFor="picker-search">Buscar playlist de destino</label><input id="picker-search" type="search" maxLength={120} value={query} disabled={working} onChange={e=>setQuery(e.target.value)} placeholder="Buscar playlist"/></div><button className="icon-button" aria-label="Nova playlist" disabled={locked||(data?.playlists.length??0)>=100} onClick={()=>setCreating(true)}><Plus/></button></div>
   {data?.playlists.length===0&&!loading&&<p>Nenhuma playlist criada. Use + para criar a primeira.</p>}
   {data&&data.playlists.length>0&&matches.length===0&&!loading&&<p>Nenhuma playlist corresponde à busca.</p>}
   <ul className="playlist-picker-list">{matches.map(p=><li key={p.id}><button aria-pressed={p.id===selectedId} aria-label={`Selecionar playlist ${p.name}`} disabled={locked} onClick={()=>setSelectedId(p.id)}><span className="playlist-symbol"><ListMusic/></span><span className="track-copy"><strong>{p.name}</strong><span>{p.count} música(s){p.count>=200?' · Limite atingido':''}</span></span>{p.id===selectedId&&<Check/>}</button></li>)}</ul>
   {duplicate&&<p role="status">Esta música já está nesta playlist.</p>}
   {selected&&selected.count+missing.length>200&&!duplicate&&<p role="status">Esta playlist atingiu o limite de 200 músicas.</p>}
   <div className="picker-confirm"><button className="primary" disabled={locked||!selected||duplicate||selected.count+missing.length>200||!!error} onClick={()=>void mutate(false)}>Adicionar música selecionada</button><button disabled={working} onClick={()=>close()}>Cancelar seleção da música</button></div>
  </>}
 </>;}}</ActionSheet>;
}
