import {useEffect,useRef,useState} from 'react';
import {Heart,Disc3,ListMusic,LibraryBig,Plus,FolderOpen,Play,MoreHorizontal,ListPlus,Trash2} from 'lucide-react';
import ActionSheet from './ActionSheet';
import Artwork from './Artwork';
import {homeLibrary,importLibrary,setLibraryFavorite,forgetLibraryTrack,type HomeLibrary,type LibraryTrack} from './services/library';
import type {AudioState} from './services/audio';
import type {TrackDetails} from './services/details';

type Props={active:boolean;revision:number;native:boolean;disabled:boolean;state:AudioState;details:TrackDetails|null;onResume:()=>void;onExpand:()=>void;onChoose:()=>void;onLibrary:()=>void;onFavorites:()=>void;onCollection:()=>void;onPlaylists:()=>void;onPlaylist:(id:string,title:string)=>void;onWorking:(value:boolean)=>void;onCatalogChange:()=>void;onPlay:(id:string,append:boolean)=>Promise<void>};
export default function HomeScreen({active,revision,native,disabled,state,details,onResume,onExpand,onChoose,onLibrary,onFavorites,onCollection,onPlaylists,onPlaylist,onWorking,onCatalogChange,onPlay}:Props){
 const [data,setData]=useState<HomeLibrary|null>(null),[error,setError]=useState(''),[loadError,setLoadError]=useState(''),[message,setMessage]=useState(''),[loading,setLoading]=useState(false),[working,setWorking]=useState(false),[retry,setRetry]=useState(0);
 const [selected,setSelected]=useState<LibraryTrack|null>(null);const epoch=useRef(0),alive=useRef(true),operation=useRef(false);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;epoch.current++;onWorking(false);};},[onWorking]);
 useEffect(()=>{
  const current=++epoch.current;if(!active||!native||working)return;let stopped=false;setLoading(true);
  void homeLibrary().then(result=>{if(!stopped&&alive.current&&epoch.current===current){setData(result);setLoadError('');}}).catch(e=>{if(!stopped&&alive.current&&epoch.current===current)setLoadError((e as Error).message);}).finally(()=>{if(!stopped&&alive.current&&epoch.current===current)setLoading(false);});
  return()=>{stopped=true;};
 },[active,native,revision,retry,working]);
 async function operate(task:()=>Promise<void>){
  if(operation.current||disabled)return;operation.current=true;epoch.current++;setWorking(true);setLoading(false);onWorking(true);setError('');setMessage('');
  try{await task();}catch(e){if(alive.current)setError((e as Error).message);}finally{operation.current=false;if(alive.current){setWorking(false);onWorking(false);}}
 }
 async function importFiles(){await operate(async()=>{const result=await importLibrary();if(result&&alive.current){onCatalogChange();setMessage(`${result.imported??result.items.length} arquivo(s) processado(s).`);}});}
 if(!active)return null;
 const locked=disabled||working,cardLocked=locked||loading;
 const songs=(n:number)=>`${n} ${n===1?'música':'músicas'}`;
 function shelf(title:string,items:LibraryTrack[],kind:'recent'|'favorites',total:number){return <section className="home-shelf" aria-label={title}>
  <div className="home-section-heading"><h2>{title}</h2><button disabled={locked} onClick={kind==='favorites'?onFavorites:onLibrary}>{kind==='favorites'?'Ver todas':'Biblioteca'} →</button></div>
  <p className="home-shelf-count">{items.length} de {songs(total)}</p>
  {items.length===0?<p className="home-empty-hint">{kind==='favorites'?'Marque músicas como favoritas para encontrá-las aqui.':'Novas músicas importadas aparecerão aqui. As anteriores continuam na Biblioteca.'}</p>:<ul className="home-card-list">{items.map(track=><li key={track.id}>
   <button className="home-card-main" disabled={cardLocked} onClick={()=>void operate(()=>onPlay(track.id,false))} aria-label={`Tocar ${track.title} em ${kind==='recent'?'recentes':'favoritas'}`}><Artwork src={track.cover}/><strong>{track.title}</strong><span>{track.artist}</span></button>
   <button className="icon-button home-card-menu" aria-label={`Opções de ${track.title} em ${kind==='recent'?'recentes':'favoritas'}`} disabled={cardLocked} onClick={()=>setSelected(track)}><MoreHorizontal/></button>
  </li>)}</ul>}
 </section>;}
 return <section className="home-screen" aria-label="Início">
  {state.hasTrack&&<section className="home-resume" aria-label="Continue ouvindo"><button className="resume-art" onClick={onExpand} aria-label="Ver música atual"><Artwork src={details?.cover??null}/></button><div className="resume-copy"><span className="eyebrow">{state.playing?'TOCANDO AGORA':'CONTINUE OUVINDO'}</span><h2>{state.title}</h2><p>{details?.artist||'Áudio local'}{details?.album?` · ${details.album}`:''}</p><button className="primary" disabled={locked||state.loading} onClick={state.playing?onExpand:onResume}><Play/>{state.playing?'Abrir player':state.failed?'Tentar reproduzir':'Continuar'}</button></div></section>}
  {loading&&<p role="status">Carregando seu início…</p>}{working&&<p role="status">Atualizando biblioteca…</p>}{message&&<p role="status">{message}</p>}
  {(error||loadError)&&<div role="alert"><p>{error||loadError}{data?' O último conteúdo válido foi preservado.':''}</p><button disabled={locked} onClick={()=>{setError('');setRetry(v=>v+1);}}>Recarregar início</button></div>}
  {data&&<>
   <p className="home-library-count">{songs(data.total)} na sua biblioteca</p>
   {data.total===0?<div className="home-empty"><LibraryBig/><h2>Sua música começa aqui</h2><p>Importe arquivos do aparelho para montar sua biblioteca. Os originais permanecem onde você os escolheu.</p></div>:<>{shelf('Adicionadas recentemente',data.recent,'recent',data.recentTotal)}{shelf('Suas favoritas',data.favorites,'favorites',data.favoriteTotal)}</>}
  </>}
  <div className="home-shortcuts"><button disabled={locked} onClick={onLibrary}><LibraryBig/><span>Músicas</span></button><button disabled={locked} onClick={onFavorites}><Heart/><span>Favoritas</span></button><button disabled={locked} onClick={onCollection}><Disc3/><span>Coleção</span></button><button disabled={locked} onClick={onPlaylists}><ListMusic/><span>Playlists</span></button></div>
  <div className="home-import-actions"><button className={data?.total===0?'primary':''} disabled={!native||locked} onClick={()=>void importFiles()}><Plus/>Importar músicas</button><button disabled={!native||locked} onClick={onChoose}><FolderOpen/>Escolher músicas</button></div>
  <p className="home-import-hint">Importar salva na biblioteca. Escolher músicas abre arquivos para a fila.</p>
  {selected&&<ActionSheet title={selected.title} onClose={()=>setSelected(null)}>{dismiss=><>
   <p className="sheet-subtitle">{selected.artist} · {selected.album}</p><div className="sheet-actions">
    <button disabled={cardLocked} onClick={()=>dismiss(()=>void operate(()=>onPlay(selected.id,false)))}><Play/>Tocar agora</button>
    <button disabled={cardLocked} onClick={()=>dismiss(()=>void operate(()=>onPlay(selected.id,true)))}><ListPlus/>Adicionar à fila</button>
    <button disabled={cardLocked} onClick={()=>dismiss(()=>onPlaylist(selected.id,selected.title))}><ListMusic/>Adicionar à playlist</button>
    <button disabled={cardLocked} aria-pressed={selected.favorite} onClick={()=>dismiss(()=>void operate(async()=>{await setLibraryFavorite(selected.id,!selected.favorite);if(alive.current){onCatalogChange();setMessage(selected.favorite?'Música removida das favoritas.':'Música adicionada às favoritas.');}}))}><Heart/>{selected.favorite?'Remover das favoritas':'Marcar como favorita'}</button>
    <button className="destructive" disabled={cardLocked} onClick={()=>dismiss(()=>void operate(async()=>{await forgetLibraryTrack(selected.id);if(alive.current){onCatalogChange();setMessage('Registro removido. O arquivo e a fila foram preservados.');}}))}><Trash2/>Remover da biblioteca</button>
   </div><p className="sheet-help">Remover preserva o arquivo e a fila, mas retira a música das playlists.</p>
  </>}</ActionSheet>}
 </section>;
}
