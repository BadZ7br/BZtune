import { useEffect, useMemo, useState } from "react";
import { Search, X, Heart, Plus, Check, Music2, Users, Disc3, Play } from "lucide-react";
import type { MusicAlbum } from "../services/api";
import { usePlayer } from "../player/PlayerContext";
import { coverProxy, fromWebTrack, videoIdValid } from "../utils/music-utils";
import CatalogDownloadButton from "../library/CatalogDownloadButton";
import AddToPlaylistButton from "../playlists/AddToPlaylistButton";
type Artist={id:string|null;name:string;image:string|null;type:"artist"};
type Release=MusicAlbum&{release_type?:string|null;type:"album"};
type Song={id:string|null;title:string;artist:string;album:string|null;duration:string|null;duration_seconds:number|null;cover:string|null;type:"song"};
type Payload={query:string;corrected?:string|null;results:{artists:Artist[];albums:Release[];songs:Song[]}};
type Filter="all"|"artists"|"albums"|"eps"|"singles"|"splits"|"songs";
const filters:{id:Filter;label:string}[]=[{id:"all",label:"Todos"},{id:"artists",label:"Artistas"},{id:"albums",label:"Álbuns"},{id:"eps",label:"EPs"},{id:"singles",label:"Singles"},{id:"splits",label:"Splits"},{id:"songs",label:"Músicas"}];
function releaseKind(r:Release):Exclude<Filter,"all"|"artists"|"songs">{
  const text=`${r.release_type||""} ${r.title}`.toLowerCase();
  return /\bsplit\b/.test(text)?"splits":/\bep\b|extended play/.test(text)?"eps":/\bsingle\b/.test(text)?"singles":"albums";
}
function Img({src,title,artist}:{src:string|null;title:string;artist:string}){
  const [failed,setFailed]=useState(false);
  useEffect(()=>setFailed(false),[src,title,artist]);
  return <div className="us-cover">{!failed?<img loading="lazy" src={coverProxy(title,artist,src)} alt={`Capa de ${title}`} onError={()=>setFailed(true)}/>:<div className="us-fallback"><Disc3 size={27}/><strong>{title}</strong></div>}</div>;
}
export default function UniversalSearch({favorites,collection,toggleFavorite,toggleCollection,onOpenArtist,onOpenAlbum}:{
  favorites:string[];collection:string[];toggleFavorite:(a:MusicAlbum)=>void;toggleCollection:(a:MusicAlbum)=>void;
  onOpenArtist:(artist:{name:string;id?:string|null;image?:string|null})=>void;onOpenAlbum:(album:MusicAlbum)=>void;
}){
  const [query,setQuery]=useState("");const [filter,setFilter]=useState<Filter>("all");
  const [data,setData]=useState<Payload|null>(null);const [loading,setLoading]=useState(false);const [error,setError]=useState("");
  const {playTrack,addToQueue}=usePlayer();
  useEffect(()=>{
    const term=query.trim();if(!term){setData(null);setLoading(false);setError("");return;}
    const controller=new AbortController();
    const timer=window.setTimeout(async()=>{
      setLoading(true);setError("");
      try{const res=await fetch(`http://127.0.0.1:5000/api/search?q=${encodeURIComponent(term)}`,{signal:controller.signal});if(!res.ok)throw new Error(`API ${res.status}`);
        const v=await res.json() as Payload;if(!controller.signal.aborted)setData(v)}
      catch(e){if(!controller.signal.aborted){setData(null);setError(e instanceof Error?e.message:"Erro na pesquisa")}}
      finally{if(!controller.signal.aborted)setLoading(false)}
    },450);
    return ()=>{window.clearTimeout(timer);controller.abort()};
  },[query]);
  const artists=useMemo(()=>(data?.results.artists||[]).filter(a=>a.id&&a.name),[data]);
  const releases=useMemo(()=>{const seen=new Set<string>();return (data?.results.albums||[]).filter(a=>{if(!a.id||!a.title)return false;const key=a.id;if(seen.has(key))return false;seen.add(key);return true})},[data]);
  const songs=useMemo(()=>(data?.results.songs||[]).filter(s=>s.id&&s.title),[data]);
  const visibleReleases=releases.filter(a=>filter==="all"||filter===releaseKind(a));
  const showArtists=filter==="all"||filter==="artists";const showReleases=filter!=="artists"&&filter!=="songs";const showSongs=filter==="all"||filter==="songs";
  const total=(showArtists?artists.length:0)+(showReleases?visibleReleases.length:0)+(showSongs?songs.length:0);
  return <div className="us-root">
    <div className="us-search"><Search size={20}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Pesquisar artistas, álbuns, EPs e músicas..." aria-label="Pesquisar música"/>{query&&<button type="button" onClick={()=>setQuery("")} aria-label="Limpar pesquisa"><X size={18}/></button>}</div>
    <div className="us-filters" role="group" aria-label="Filtrar resultados">{filters.map(f=><button key={f.id} className={filter===f.id?"selected":""} onClick={()=>setFilter(f.id)}>{f.label}</button>)}</div>
    {data?.corrected&&<p className="us-note">Corrigido para <strong>{data.corrected}</strong></p>}
    {loading&&<p role="status" className="us-note">Pesquisando...</p>}
    {error&&<p role="alert" className="us-error">{error} · Confere o Flask.</p>}
    {!query.trim()&&<p className="us-note">Pesquisa tua próxima descoberta. A pesquisa fica aqui quando navegas para outra página.</p>}
    {!loading&&data&&<p className="us-count">{total} resultados neste filtro</p>}
    {showArtists&&artists.length>0&&<section className="us-section"><h2><Users size={19}/> Artistas</h2><div className="us-artists">{artists.map(a=><button key={a.id} className="us-artist" onClick={()=>onOpenArtist({name:a.name,id:a.id,image:a.image})}><Img src={a.image} title={a.name} artist={a.name}/><span>{a.name}</span></button>)}</div></section>}
    {showReleases&&visibleReleases.length>0&&<section className="us-section"><h2><Disc3 size={19}/> Lançamentos</h2><div className="us-grid">{visibleReleases.map(album=><article className="us-card" key={album.id}>
      <div className="us-art"><button className="dv-art-click" aria-label={`Abrir álbum ${album.title}`} onClick={()=>onOpenAlbum(album)}><Img src={album.cover} title={album.title} artist={album.artist}/></button><button className={`us-heart ${favorites.includes(album.id)?"active":""}`} onClick={()=>toggleFavorite(album)} title="Favoritar"><Heart size={16} fill={favorites.includes(album.id)?"currentColor":"none"}/></button></div>
      <div className="us-line"><div><h3><button className="dv-plain-link" onClick={()=>onOpenAlbum(album)}>{album.title}</button></h3><p><button className="dv-artist-link" onClick={()=>onOpenArtist({name:album.artist})}>{album.artist}</button></p></div><button className="us-add" title="Minha coleção" onClick={()=>toggleCollection(album)}>{collection.includes(album.id)?<Check size={17}/>:<Plus size={17}/>}</button></div>
      <div className="us-meta"><span>{releaseKind(album)==="albums"?"Álbum":releaseKind(album).toUpperCase()}</span><span>{album.year||""}</span></div>
      <div className="us-services"><button className="dv-action" onClick={()=>onOpenAlbum(album)}><Play size={15}/> Abrir / ouvir</button><CatalogDownloadButton artist={album.artist} title={album.title} kind="release"/><AddToPlaylistButton artist={album.artist} title={album.title} kind="release" albumId={album.id} cover={album.cover}/></div>
    </article>)}</div></section>}
    {showSongs&&songs.length>0&&<section className="us-section"><h2><Music2 size={19}/> Músicas</h2><div className="us-songs">{songs.map(song=>{
      const player=fromWebTrack({video_id:song.id,title:song.title,cover:song.cover},song.artist,song.album||undefined,song.cover);
      return <div className="dv-song-download-row" key={song.id}>
        <div className="us-song dv-song-content"><div className="us-song-thumb"><Img src={song.cover} title={song.title} artist={song.artist}/></div><div className="dv-song-label"><strong>{song.title}</strong><p>{song.artist}{song.album?` · ${song.album}`:""}</p></div><span>{song.duration||""}</span></div>
        <button className="dv-action" disabled={!player} title="Reproduzir" onClick={()=>player&&playTrack(player)}><Play size={16}/></button>
        <button className="dv-action" disabled={!player} title="Adicionar à fila" onClick={()=>player&&addToQueue(player)}><Plus size={16}/></button>
        <CatalogDownloadButton artist={song.artist} title={song.title} kind="track"/>
        {videoIdValid(song.id)&&<AddToPlaylistButton artist={song.artist} title={song.title} kind="track" videoId={song.id} album={song.album||undefined} cover={song.cover}/>} 
      </div>})}</div></section>}
    {!loading&&data&&total===0&&<p className="us-empty">Não encontramos resultados neste filtro.</p>}
  </div>;
}
