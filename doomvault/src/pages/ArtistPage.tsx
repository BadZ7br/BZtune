import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Disc3, Heart, Plus, Check, Play, ChevronRight, Users } from "lucide-react";
import type { MusicAlbum } from "../services/api";
import { API, coverProxy } from "../utils/music-utils";
import CatalogDownloadButton from "../library/CatalogDownloadButton";
import AddToPlaylistButton from "../playlists/AddToPlaylistButton";
type ArtistRef = { name:string; id?:string|null; image?:string|null };
type Discography = { albums: (MusicAlbum & {release_type?:string})[]; count:number;
  sections?: Record<string,number>; warnings?:string[]; verified_id?:boolean; complete?:boolean };
type Props = {artist:ArtistRef;onBack:()=>void;onOpenAlbum:(album:MusicAlbum)=>void;
  favorites:string[];collection:string[];toggleFavorite:(album:MusicAlbum)=>void;toggleCollection:(album:MusicAlbum)=>void};
function norm(s:string){return s.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]/g,"")}
function AlbumArt({album}:{album:MusicAlbum}){
  const [failed,setFailed]=useState(false);
  useEffect(()=>setFailed(false),[album.id,album.cover]);
  return <div className="ap-artwork">{!failed?<img loading="lazy" src={coverProxy(album.title,album.artist,album.cover)} alt={`Capa de ${album.title}`} onError={()=>setFailed(true)}/>:<div className="ap-cover-fallback"><Disc3 size={34}/><span>DOOMVAULT</span><strong>{album.title}</strong></div>}</div>;
}
type ReleaseTab="all"|"album"|"single"|"ep"|"other";
function sectionKind(value?:string):Exclude<ReleaseTab,"all">{
  const v=(value||"").toLowerCase();
  if(/single/.test(v)) return "single";
  if(/\beps?\b|extended play/.test(v)) return "ep";
  if(/album/.test(v)) return "album";
  return "other";
}
function yearOf(album:MusicAlbum){const value=Number(album.year);return value>0&&Number.isFinite(value)?value:9999}
export default function ArtistPage({artist,onBack,onOpenAlbum,favorites,collection,toggleFavorite,toggleCollection}:Props){
  const [profiles,setProfiles]=useState<ArtistRef[]>([]);
  const [active,setActive]=useState<ArtistRef>(artist);
  const [profilesLoading,setProfilesLoading]=useState(false);
  const [data,setData]=useState<Discography|null>(null);
  const [error,setError]=useState("");
  const [loading,setLoading]=useState(true);
  const [sort,setSort]=useState("oldest");
  const [releaseTab,setReleaseTab]=useState<ReleaseTab>("all");
  const [failed,setFailed]=useState(false);
  useEffect(()=>{setActive(artist);setReleaseTab("all")},[artist.name,artist.id,artist.image]);
  useEffect(()=>{
    const controller=new AbortController();setProfilesLoading(true);
    fetch(`${API}/api/artists?q=${encodeURIComponent(artist.name)}`,{signal:controller.signal})
      .then(async r=>{if(!r.ok)throw new Error(`HTTP ${r.status}`);return r.json() as Promise<{results:ArtistRef[]}>})
      .then(d=>{
        if(controller.signal.aborted)return;
        const candidates=(d.results||[]).filter(x=>x.id&&norm(x.name)===norm(artist.name));
        const used=new Set<string>();
        const distinct=[...candidates,...(artist.id?[artist]:[])].filter(x=>{if(!x.id||used.has(x.id))return false;used.add(x.id);return true});
        setProfiles(distinct);
        // Não substituímos um ID escolhido por outro homônimo.
        setActive(prev=>prev.id?prev:(distinct[0]||prev));
      }).catch(()=>{if(!controller.signal.aborted)setProfiles(artist.id?[artist]:[])})
      .finally(()=>{if(!controller.signal.aborted)setProfilesLoading(false)});
    return ()=>controller.abort();
  },[artist.name,artist.id,artist.image]);
  useEffect(()=>{
    const controller=new AbortController();setData(null);setLoading(true);setError("");setFailed(false);setReleaseTab("all");
    fetch(`${API}/api/artists/${encodeURIComponent(active.id||"lookup")}/albums?name=${encodeURIComponent(active.name)}`,{signal:controller.signal})
      .then(async r=>{if(!r.ok)throw new Error(`Erro HTTP ${r.status}`);return r.json() as Promise<Discography>})
      .then(d=>{if(!controller.signal.aborted)setData(d)})
      .catch(e=>{if(!controller.signal.aborted)setError(`Não foi possível carregar o catálogo: ${e instanceof Error?e.message:"erro desconhecido"}`)})
      .finally(()=>{if(!controller.signal.aborted)setLoading(false)});
    return ()=>controller.abort();
  },[active.id,active.name]);
  const albums=useMemo(()=>{
    const ids=new Set<string>();
    return (data?.albums||[]).filter(a=>{if(!a.id||ids.has(a.id))return false;ids.add(a.id);return true});
  },[data]);
  const ordered=useMemo(()=>albums.filter(a=>releaseTab==="all"||sectionKind(a.release_type)===releaseTab)
    .sort((a,b)=>sort==="title"?a.title.localeCompare(b.title):sort==="newest"?yearOf(b)-yearOf(a):yearOf(a)-yearOf(b)),[albums,sort,releaseTab]);
  const sections:[ReleaseTab,string][]=[["all","Todas"],["album","Álbuns"],["single","Singles"],["ep","EPs"],["other","Outros"]];
  const image=active.image||null;
  return <section className="ap-root">
    <button className="ap-back" onClick={onBack}><ArrowLeft size={17}/> Voltar</button>
    <div className="ap-hero"><div className="ap-avatar">{image&&!failed?<img src={image} alt={`Imagem de ${active.name}`} onError={()=>setFailed(true)}/>:<Disc3 size={45}/>}</div>
      <div className="ap-identity"><span>ARTISTA / BANDA</span><h1>{active.name}<b>.</b></h1>
        <p>Perfil {active.id||"não identificado"} · Catálogo separado por ID</p><span>{albums.length} lançamentos encontrados</span></div></div>
    {(profiles.length>1||profilesLoading)&&<section className="ap-homonyms" aria-label="Perfis de artistas com o mesmo nome">
      <h2><Users size={18}/> Artistas com este nome</h2>
      {profilesLoading&&<p>Identificando outros perfis...</p>}
      <div className="ap-homonym-tabs" role="tablist" aria-label="Selecionar perfil do artista">
        {profiles.map((item,i)=><button type="button" role="tab" aria-selected={item.id===active.id} className={item.id===active.id?"active":""} key={item.id||i}
          onClick={()=>setActive(item)} title={`Perfil ${item.id||i}`}>
          {item.image&&<img src={item.image} alt=""/>}<span>{item.name}</span><small>Perfil {i+1}</small>
        </button>)}
      </div><p className="ap-note">Perfis com nomes idênticos permanecem separados. A identidade é o ID do catálogo, não o nome.</p>
    </section>}
    <div className="ap-heading"><h2>Discografia</h2><label>Ordenar <select value={sort} onChange={e=>setSort(e.target.value)}><option value="oldest">Mais antigos</option><option value="newest">Mais recentes</option><option value="title">Título A–Z</option></select></label></div>
    {!!albums.length&&<div className="ap-release-tabs" role="group" aria-label="Filtrar lançamentos">{sections.map(([id,label])=><button key={id} className={releaseTab===id?"active":""} onClick={()=>setReleaseTab(id)}>{label} <small>{id==="all"?albums.length:albums.filter(a=>sectionKind(a.release_type)===id).length}</small></button>)}</div>}
    {loading&&<p className="ap-message" role="status">Consultando a página do artista e as seções de lançamentos...</p>}
    {error&&<p className="ap-message" role="alert">{error}</p>}
    {!loading&&!error&&!albums.length&&<p className="ap-message">Não foram encontrados lançamentos deste perfil na fonte.</p>}
    <div className="ap-grid">{ordered.map(album=><article className="ap-card" key={album.id}>
      <button type="button" className="ap-open" onClick={()=>onOpenAlbum(album)} aria-label={`Abrir página de ${album.title}`}><AlbumArt album={album}/><span className="ap-open-hint"><Play size={14}/> Abrir álbum <ChevronRight size={14}/></span></button>
      <div className="ap-meta"><div><h3><button className="dv-plain-link" onClick={()=>onOpenAlbum(album)}>{album.title}</button></h3><p>{album.year||"Ano desconhecido"} · {album.release_type||"Lançamento"}</p></div>
        <div className="ap-actions"><button title="Favoritar" onClick={()=>toggleFavorite(album)}><Heart size={17} fill={favorites.includes(album.id)?"currentColor":"none"}/></button>
        <button title="Adicionar à coleção" onClick={()=>toggleCollection(album)}>{collection.includes(album.id)?<Check size={17}/>:<Plus size={17}/>}</button></div></div>
      <div className="ap-links"><CatalogDownloadButton artist={album.artist} title={album.title} kind="release"/>
        <AddToPlaylistButton artist={album.artist} title={album.title} kind="release" albumId={album.id} cover={album.cover}/></div>
    </article>)}</div>
    {!!data&&!loading&&<p className="ap-note">Mostrando {ordered.length} de {albums.length} lançamentos disponíveis. O YouTube Music pode não disponibilizar todas as obras ou edições; não ocultamos lançamentos diferentes que têm o mesmo título.</p>}
  </section>;
}
