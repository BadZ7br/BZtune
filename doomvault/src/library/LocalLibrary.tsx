import { useCallback, useEffect, useRef, useState } from "react";
import { Upload, Play, ListPlus, Trash2, RefreshCw, HardDrive, Disc3, ImagePlus, Search, Pencil, Check, X } from "lucide-react";
import { usePlayer } from "../player/PlayerContext";
import { API, fromLocal, type StoredTrack } from "../music-utils";
import "./local-library.css";
import "./local-library-v12.css";
import DownloadsManager from "./DownloadsManager";

type MetadataDraft = { title: string; artist: string; album: string; year: string; genre: string };

function normalize(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

function TrackArtwork({track,version,onLoaded}:{track:StoredTrack;version:number;onLoaded?:()=>void}) {
  const [broken,setBroken] = useState(false);
  useEffect(()=>setBroken(false),[track.id,version]);
  const url = track.coverUrl ? `${API}${track.coverUrl}?v=${version}` : null;
  return <div className="ll-art-v12">{url&&!broken
    ? <img alt={`Capa de ${track.title}`} src={url} loading="lazy" onLoad={onLoaded} onError={()=>setBroken(true)}/>
    : <Disc3 size={22}/>}</div>;
}

export default function LocalLibrary() {
  const { playTrack, addToQueue } = usePlayer();
  const input = useRef<HTMLInputElement>(null);
  const coverInput = useRef<HTMLInputElement>(null);
  const coverTarget = useRef<StoredTrack | null>(null);
  const albumCoverTarget = useRef<{artist:string;album:string}|null>(null);
  const [uploadingCover, setUploadingCover] = useState<string | null>(null);
  const [tracks, setTracks] = useState<StoredTrack[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [artVersions,setArtVersions] = useState<Record<string,number>>({});
  const [repairing,setRepairing] = useState(false);
  const [query,setQuery] = useState("");
  const [yearFilter,setYearFilter] = useState("");
  const [genreFilter,setGenreFilter] = useState("");
  const [coverFilter,setCoverFilter] = useState(false);
  const [groupBy,setGroupBy] = useState<"track"|"album"|"artist">("track");
  const [sortBy,setSortBy] = useState<"title"|"artist"|"album"|"added">("added");
  const [editing,setEditing] = useState<string|null>(null);
  const [draft,setDraft] = useState<MetadataDraft>({title:"",artist:"",album:"",year:"",genre:""});

  const load = useCallback(async () => {
    try {
      const response = await fetch(`${API}/api/library/tracks`);
      if (!response.ok) throw new Error("A biblioteca não respondeu.");
      const data: { tracks: StoredTrack[] } = await response.json();
      setTracks(data.tracks);
      setError("");
    } catch {
      setError("Não foi possível acessar a biblioteca. Confere se o Flask está ligado.");
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    setNotice("");
    setError("");
    let imported = 0;
    let duplicates = 0;
    let failures = 0;
    for (const file of Array.from(files)) {
      if (!/\.(mp3|flac)$/i.test(file.name)) { failures++; continue; }
      const form = new FormData();
      form.append("file", file);
      try {
        const response = await fetch(`${API}/api/library/import`, { method: "POST", body: form });
        const data: { duplicate?: boolean; error?: string } = await response.json();
        if (!response.ok) { failures++; setError(data.error || "Erro ao importar arquivo."); }
        else if (data.duplicate) duplicates++;
        else imported++;
      } catch { failures++; setError("Conexão com Flask interrompida durante a importação."); }
    }
    setNotice(`${imported} importado(s), ${duplicates} repetido(s), ${failures} erro(s).`);
    await load();
    setBusy(false);
  }

  async function repairCovers() {
    if (repairing || !tracks.length) return;
    setRepairing(true);setError("");
    let repaired=0;
    let notFound=0;
    const examples:string[]=[];
    try {
      // Consultas sequenciais para não sobrecarregar os serviços de capas.
      for(const [idx,track] of tracks.entries()) {
        const response=await fetch(`${API}/api/library/tracks/${encodeURIComponent(track.id)}/refresh-cover`, {method:"POST"});
        if(response.ok) {
          const result=await response.json() as {found:boolean;detail?:string};
          if(result.found){repaired++;setTracks(current=>current.map(item=>item.id===track.id?{...item,hasCover:true}:item))}
          else {
            notFound++;
            if(examples.length<3) examples.push(`${track.title}: ${result.detail || "Capa não encontrada"}`);
          }
          setArtVersions(old=>({...old,[track.id]:(old[track.id]||0)+1}));
        } else {
          notFound++;
          if(examples.length<3) examples.push(`${track.title}: HTTP ${response.status}`);
        }
        setNotice(`Verificando capas: ${idx+1}/${tracks.length}...`);
      }
      setNotice(`${repaired} com capa, ${notFound} sem capa. ${examples.length ? "Exemplos: " + examples.join(" | ") : ""}`);
    } catch {setError("Não foi possível terminar a recuperação de capas. Tenta novamente.")}
    finally {setRepairing(false)}
  }

  function chooseCover(track:StoredTrack) {
    if(track.album?.trim()){
      chooseAlbumCover(track.artist,track.album);
      return;
    }
    albumCoverTarget.current=null;
    coverTarget.current=track;
    coverInput.current?.click();
  }

  function chooseAlbumCover(artist:string,album:string) {
    coverTarget.current=null;
    albumCoverTarget.current={artist,album};
    coverInput.current?.click();
  }

  async function uploadArtwork(files:FileList | null) {
    const albumTarget=albumCoverTarget.current;
    albumCoverTarget.current=null;
    const track=coverTarget.current;
    coverTarget.current=null;
    if((!track&&!albumTarget) || !files?.length)return;
    const file=files[0];
    if(file.size > 4*1024*1024 || !/\.(jpg|jpeg|png|webp)$/i.test(file.name)) {
      setError("Usa uma imagem JPG, PNG ou WebP de no máximo 4 MB.");
      return;
    }
    if(track)setUploadingCover(track.id);
    setError("");
    try {
      const form=new FormData();
      form.append("file",file);
      const endpoint=albumTarget?"/api/library/albums/cover":`/api/library/tracks/${encodeURIComponent(track!.id)}/cover-upload`;
      if(albumTarget){form.append("artist",albumTarget.artist);form.append("album",albumTarget.album)}
      const response=await fetch(`${API}${endpoint}`,{method:"POST",body:form});
      const result=await response.json() as {saved?:boolean;error?:string};
      if(!response.ok || !result.saved)throw new Error(result.error || "Falha ao salvar capa.");
      const affected=albumTarget?tracks.filter(item=>normalize(item.artist)===normalize(albumTarget.artist)&&normalize(item.album||"")===normalize(albumTarget.album)):track?[track]:[];
      setTracks(current=>current.map(item=>affected.some(target=>target.id===item.id)?{...item,hasCover:true}:item));
      setArtVersions(prev=>{const next={...prev};for(const item of affected)next[item.id]=(next[item.id]||0)+1;return next});
      setNotice(albumTarget?`Capa de ${albumTarget.album} salva para o álbum.`:`Capa de ${track!.title} salva!`);
    } catch(err) {
      setError(err instanceof Error ? err.message : "Falha no upload da capa.");
    } finally { if(track)setUploadingCover(null); }
  }

  async function remove(track: StoredTrack) {
    if (!window.confirm(`Excluir "${track.title}" da biblioteca?`)) return;
    try {
      const response = await fetch(`${API}/api/library/tracks/${encodeURIComponent(track.id)}`, { method: "DELETE" });
      if (!response.ok) throw new Error();
      await load();
    } catch { setError("Não foi possível excluir a faixa."); }
  }

  function startEditing(track:StoredTrack) {
    setEditing(track.id);
    setDraft({title:track.title,artist:track.artist,album:track.album||"",year:track.year?String(track.year):"",genre:track.genre||""});
  }

  async function saveMetadata(track:StoredTrack) {
    const year=draft.year.trim() ? Number(draft.year) : null;
    if(year!==null && (!Number.isInteger(year)||year<1000||year>9999)) {
      setError("O ano precisa ser um número entre 1000 e 9999.");
      return;
    }
    try {
      const response=await fetch(`${API}/api/library/tracks/${encodeURIComponent(track.id)}`,{
        method:"PATCH",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({...draft,year}),
      });
      const result=await response.json() as {track?:StoredTrack;error?:string};
      if(!response.ok||!result.track)throw new Error(result.error||"Não foi possível salvar os metadados.");
      setTracks(current=>current.map(item=>item.id===track.id?{...item,...result.track}:item));
      setEditing(null);setError("");setNotice("Metadados atualizados.");
    } catch(err) {setError(err instanceof Error?err.message:"Falha ao salvar metadados.")}
  }

  const visibleTracks=tracks.filter(track=>{
    const search=normalize(`${track.title} ${track.artist} ${track.album||""} ${track.genre||""}`);
    return (!query||search.includes(normalize(query)))
      &&(!yearFilter||String(track.year||"")===yearFilter)
      &&(!genreFilter||track.genre===genreFilter)
      &&(!coverFilter||!track.hasCover);
  }).sort((left,right)=>{
    if(sortBy==="title")return left.title.localeCompare(right.title);
    if(sortBy==="artist")return left.artist.localeCompare(right.artist)||left.title.localeCompare(right.title);
    if(sortBy==="album")return (left.album||"").localeCompare(right.album||"")||left.title.localeCompare(right.title);
    return (right.created_at||"").localeCompare(left.created_at||"");
  });
  const groups=groupBy==="track"?[]:Array.from(visibleTracks.reduce((map,track)=>{
    const label=groupBy==="artist"?track.artist:(track.album||"Álbum desconhecido");
    const key=groupBy==="artist"?normalize(label):`${normalize(track.artist)}|${normalize(label)}`;
    const group=map.get(key)||{label,artist:track.artist,tracks:[] as StoredTrack[]};
    group.tracks.push(track);map.set(key,group);return map;
  },new Map<string,{label:string;artist:string;tracks:StoredTrack[]}>()).values());

  function renderTrack(track:StoredTrack) {
    return <div className="ll-track" key={track.id}>
      <TrackArtwork track={track} version={artVersions[track.id]||0} onLoaded={()=>setTracks(current=>current.map(item=>item.id===track.id?{...item,hasCover:true}:item))}/>
      <div className="ll-track-info"><strong>{track.title}</strong><span>{[track.artist,track.album,track.year,track.genre,track.filename].filter(Boolean).join(" · ")} · {(track.bytes / 1048576).toFixed(1)} MB</span></div>
      <button title="Corrigir metadados" aria-label={`Corrigir metadados de ${track.title}`} onClick={()=>startEditing(track)}><Pencil size={16}/></button>
      <button title={track.album?"Alterar capa compartilhada do álbum":"Escolher capa manualmente (JPG, PNG ou WebP)"} aria-label={`Escolher capa de ${track.album||track.title}`} disabled={uploadingCover === track.id || repairing} onClick={()=>chooseCover(track)}><ImagePlus size={17}/></button>
      <button title="Reproduzir" aria-label={`Reproduzir ${track.title}`} onClick={() => playTrack(fromLocal(track), visibleTracks.map(fromLocal))}><Play size={17}/></button>
      <button title="Adicionar à fila" aria-label={`Adicionar ${track.title} à fila`} onClick={() => addToQueue(fromLocal(track))}><ListPlus size={18}/></button>
      <button title="Remover da biblioteca" aria-label={`Excluir ${track.title}`} onClick={() => void remove(track)}><Trash2 size={17}/></button>
      {editing===track.id&&<form className="ll-metadata-form" onSubmit={event=>{event.preventDefault();void saveMetadata(track)}}>
        <label>Título<input value={draft.title} onChange={event=>setDraft({...draft,title:event.target.value})} required maxLength={200}/></label>
        <label>Artista<input value={draft.artist} onChange={event=>setDraft({...draft,artist:event.target.value})} required maxLength={200}/></label>
        <label>Álbum<input value={draft.album} onChange={event=>setDraft({...draft,album:event.target.value})} maxLength={200}/></label>
        <label>Ano<input type="number" min="1000" max="9999" value={draft.year} onChange={event=>setDraft({...draft,year:event.target.value})}/></label>
        <label>Gênero<input value={draft.genre} onChange={event=>setDraft({...draft,genre:event.target.value})} maxLength={100}/></label>
        <button type="submit" title="Salvar metadados"><Check size={16}/></button>
        <button type="button" title="Cancelar edição" onClick={()=>setEditing(null)}><X size={16}/></button>
      </form>}
    </div>;
  }

  return <section className="ll-root">
    <div className="ll-header">
      <div><p className="ll-eyebrow">ARQUIVOS SALVOS NO COMPUTADOR</p><h2>Biblioteca offline<span>.</span></h2>
        <p>MP3 e FLAC guardados no servidor local, disponíveis mesmo sem internet.</p></div>
      <div className="ll-actions">
        <button type="button" onClick={() => void repairCovers()} title="Buscar ou recuperar capas" disabled={busy||repairing}><Disc3 size={16}/>{repairing?" Recuperando...":" Recuperar capas"}</button>
        <button type="button" onClick={() => void load()} title="Atualizar biblioteca"><RefreshCw size={16}/></button>
        <button type="button" className="ll-primary" disabled={busy} onClick={() => input.current?.click()}><Upload size={17}/>{busy ? "Importando..." : "Importar MP3 / FLAC"}</button>
      </div>
    </div>
    <input ref={coverInput} type="file" accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp" hidden
      onChange={event=>{void uploadArtwork(event.target.files);event.target.value="";}}/>
    <input ref={input} type="file" multiple accept=".mp3,.flac,audio/mpeg,audio/flac" hidden
      onChange={event => { void upload(event.target.files); event.target.value = ""; }}/>
    <div className="ll-library-tools">
      <label className="ll-library-search"><Search size={16}/><input value={query} onChange={event=>setQuery(event.target.value)} placeholder="Buscar faixa, álbum ou artista" aria-label="Buscar na biblioteca"/></label>
      <select value={groupBy} onChange={event=>setGroupBy(event.target.value as typeof groupBy)} aria-label="Agrupar biblioteca"><option value="track">Faixas</option><option value="album">Agrupar por álbum</option><option value="artist">Agrupar por artista</option></select>
      <select value={sortBy} onChange={event=>setSortBy(event.target.value as typeof sortBy)} aria-label="Ordenar biblioteca"><option value="added">Adicionadas recentemente</option><option value="title">Nome</option><option value="artist">Artista</option><option value="album">Álbum</option></select>
      <select value={yearFilter} onChange={event=>setYearFilter(event.target.value)} aria-label="Filtrar por ano"><option value="">Todos os anos</option>{Array.from(new Set(tracks.map(track=>track.year).filter((year):year is number=>typeof year==="number"))).sort((a,b)=>b-a).map(year=><option key={year} value={year}>{year}</option>)}</select>
      <select value={genreFilter} onChange={event=>setGenreFilter(event.target.value)} aria-label="Filtrar por gênero"><option value="">Todos os gêneros</option>{Array.from(new Set(tracks.map(track=>track.genre).filter((genre):genre is string=>!!genre))).sort((a,b)=>a.localeCompare(b)).map(genre=><option key={genre} value={genre}>{genre}</option>)}</select>
      <label className="ll-cover-filter"><input type="checkbox" checked={coverFilter} onChange={event=>setCoverFilter(event.target.checked)}/> Sem capa</label>
      <span className="ll-visible-count">{visibleTracks.length} faixas</span>
    </div>
    {notice && <p role="status" className="ll-notice">{notice}</p>}
    {error && <p role="alert" className="ll-error">{error}</p>}
    {!tracks.length && <div className="ll-empty"><HardDrive size={30}/><h3>Nenhuma música importada ainda.</h3><p>Escolhe arquivos MP3 ou FLAC do teu computador para começar.</p></div>}
    <div className="ll-list">{groupBy==="track"?visibleTracks.map(renderTrack):groups.map(group=><section className="ll-track-group" key={`${group.artist}|${group.label}`}>
      <div className="ll-track-group-heading"><div><strong>{group.label}</strong><span>{groupBy==="album"?group.artist:""} · {group.tracks.length} faixa(s)</span></div>
      <div className="ll-track-group-actions">{groupBy==="album"&&group.label!=="Álbum desconhecido"&&<button title="Escolher capa compartilhada do álbum" aria-label={`Escolher capa de ${group.label}`} onClick={()=>chooseAlbumCover(group.artist,group.label)}><ImagePlus size={16}/></button>}
      <button title={`Tocar ${groupBy==="album"?"álbum":"artista"}`} aria-label={`Tocar ${group.label}`} onClick={()=>playTrack(fromLocal(group.tracks[0]),group.tracks.map(fromLocal))}><Play size={16}/></button></div></div>
      {group.tracks.map(renderTrack)}</section>)}</div>
    <DownloadsManager onFinished={load} />
    <p className="ll-note">Offline significa sem conexão à internet: o Flask local ainda precisa estar rodando. Alguns navegadores não reproduzem FLAC; se isso acontecer, tenta um MP3.</p>
  </section>;
}
