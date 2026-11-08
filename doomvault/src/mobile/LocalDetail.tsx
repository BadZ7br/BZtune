import {useState,useRef,useCallback,useEffect} from 'react';
import {ArrowLeft,Disc3,UserRound,Heart,Check} from 'lucide-react';
import Albums from './Albums';
import Library from './Library';
import Artwork from './Artwork';
import {albums,albumDetails,type Album} from './services/albums';
import type {LocalDetail as Detail} from './useNavigation';

type Props={detail:Detail;disabled:boolean;playerBusy:boolean;revision:number;onBack:()=>void;onAlbum:(album:Album)=>void;onArtist:(name:string)=>void;onWorking:(busy:boolean)=>void;onCatalogChange:()=>void;onPlaylist:(id:string,title:string)=>void;onPlay:(id:string,append:boolean)=>Promise<void>};
export default function LocalDetail({detail,disabled,playerBusy,revision,onBack,onAlbum,onArtist,onWorking,onCatalogChange,onPlaylist,onPlay}:Props){
 const [summary,setSummary]=useState<{total:number;cover:string|null}|null>(null);
 const [saved,setSaved]=useState<Album|null>(null),[error,setError]=useState(''),[message,setMessage]=useState('');
 const alive=useRef(true);useEffect(()=>{alive.current=true;return()=>{alive.current=false;onWorking(false);};},[onWorking]);
 const [detailsRetry,setDetailsRetry]=useState(0);
 useEffect(()=>{if(detail.kind!=='album')return;let stopped=false;setSaved(null);setError('');void albumDetails(detail.album.id).then(value=>{if(!stopped){setSaved(value);if(!value)setError('Este álbum não está mais no catálogo. Volte à biblioteca.');}}).catch(e=>{if(!stopped)setError((e as Error).message);});return()=>{stopped=true;};},[detail.kind,detail.kind==='album'?detail.album.id:'',revision,detailsRetry]);
 const operations=useRef({albums:false,tracks:false,marks:false});const [nestedBusy,setNestedBusy]=useState(false);
 const report=useCallback((kind:keyof typeof operations.current,value:boolean)=>{if(!alive.current){onWorking(false);return;}operations.current[kind]=value;const busy=Object.values(operations.current).some(Boolean);setNestedBusy(busy);onWorking(busy);},[onWorking]);
 const albumsWorking=useCallback((v:boolean)=>report('albums',v),[report]);
 const tracksWorking=useCallback((v:boolean)=>report('tracks',v),[report]);
 const title=detail.kind==='album'?(saved?.title??detail.album.title):detail.name;
 const filter=detail.kind==='album'?{album:detail.album.id,artist:'',label:title}:{album:'',artist:detail.name,label:title};
 async function mark(field:'favorite'|'collected'){
  if(!saved||Object.values(operations.current).some(Boolean)||disabled)return;
  report('marks',true);setError('');setMessage('');
  const next={...saved,[field]:!saved[field]};
  try{await albums({query:'',artist:'',filter:'all',page:0},{id:saved.id,favorite:next.favorite,collected:next.collected,expectedFavorite:saved.favorite,expectedCollected:saved.collected});if(alive.current){setSaved(next);setMessage('Escolha do álbum salva.');onCatalogChange();}}
  catch(e){if(alive.current)setError((e as Error).message);}finally{if(alive.current)report('marks',false);}
 }
 return <section className="local-detail" aria-label={detail.kind==='album'?'Detalhes do álbum':'Detalhes do artista'}>
  <button className="detail-back" onClick={onBack} disabled={disabled||nestedBusy}><ArrowLeft/>Voltar</button>
  <div className={`local-detail-hero ${detail.kind==='artist'?'artist-hero':''}`}>
   {detail.kind==='album'?(summary?.cover?<Artwork src={summary.cover}/>:<span className="album-art detail-album-art"><Disc3/></span>):<span className="artist-avatar artist-avatar-large"><UserRound/></span>}
   <div className="detail-heading"><span className="eyebrow">{detail.kind==='album'?'ÁLBUM LOCAL':'ARTISTA LOCAL'}</span><h2>{title}</h2>
    {detail.kind==='album'&&<button className="detail-artist" disabled={disabled||nestedBusy} onClick={()=>onArtist((saved?.artist??detail.album.artist))}>{saved?.artist??detail.album.artist}</button>}
    <p>{detail.kind==='album'&&(saved?.year??detail.album.year)?`${saved?.year??detail.album.year} · `:''}{summary?`${summary.total} música(s) locais`:'Consultando arquivos locais…'}</p>
   </div>
  </div>
  {saved&&<div className="detail-marks"><button disabled={disabled||nestedBusy} aria-pressed={saved.favorite} aria-label={`Favoritar álbum ${saved.title} ${saved.year}`} onClick={()=>void mark('favorite')}><Heart/>Favorito</button><button disabled={disabled||nestedBusy} aria-pressed={saved.collected} aria-label={`Colecionar álbum ${saved.title} ${saved.year}`} onClick={()=>void mark('collected')}><Check/>{saved.collected?'Na coleção':'Colecionar'}</button></div>}
  {message&&<p role="status">{message}</p>}{error&&<div role="alert"><p>{error}</p><button disabled={disabled||nestedBusy} onClick={()=>setDetailsRetry(v=>v+1)}>Recarregar álbum</button></div>}
  {detail.kind==='artist'&&<Albums active artistName={detail.name} disabled={disabled||nestedBusy} catalogRevision={revision} onWorking={albumsWorking} onOpenAlbum={onAlbum} onOpenArtist={onArtist}/>}
  <h3 className="detail-tracks-title">Músicas</h3>
  <fieldset className="mobile-section-fieldset" disabled={disabled||nestedBusy}>
   <Library active catalogRevision={revision} fixedFilter={filter} onSummary={setSummary} requestedFilter={null} playerBusy={playerBusy} onWorking={tracksWorking} onCatalogChange={onCatalogChange} onPlaylist={onPlaylist} onPlay={onPlay}/>
  </fieldset>
 </section>;
}
