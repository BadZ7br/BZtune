import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Upload, Play, ListPlus, Trash2, RefreshCw, HardDrive, Disc3, ImagePlus, Search, FolderPlus } from "lucide-react";
import { usePlayer } from "../player/PlayerContext";
import type { PlayerTrack } from "../player/PlayerContext";
import "./local-library.css";
import "./local-library-v12.css";
import "./album-library-v122.css";
import DownloadsManager from "./DownloadsManager";

const API = "http://127.0.0.1:5000";
type StoredTrack = {
  id: string; title: string; artist: string; filename: string;
  bytes: number; mime: string; audioUrl: string; coverUrl?: string | null;
  album?: string | null; albumId?: string | null;
};
type LocalAlbum = { id: string; title: string; artist: string; count: number; coverUrl: string; hasCover: boolean };
type IdentifyStatus = { running: boolean; done: number; total: number; assigned: number;
  ambiguous: number; foundCovers: number; error: string; finished: boolean };
type CoverTarget = { type: "album"; id: string } | { type: "track"; id: string };

function playerTrack(track: StoredTrack, version = 0): PlayerTrack {
  return { videoId: `library:${track.id}`, title: track.title, artist: track.artist,
    album: track.album || undefined,
    audioUrl: `${API}${track.audioUrl}`,
    cover: track.coverUrl ? `${API}${track.coverUrl}?v=${version}` : null,
  };
}

function TrackArtwork({track,version}:{track:StoredTrack;version:number}) {
  const [broken,setBroken] = useState(false);
  useEffect(()=>setBroken(false),[track.id,track.albumId,version]);
  const url = track.coverUrl ? `${API}${track.coverUrl}?v=${version}` : null;
  return <div className="ll-art-v12">{url&&!broken
    ? <img alt={`Capa de ${track.album || track.title}`} src={url} loading="lazy" onError={()=>setBroken(true)}/>
    : <Disc3 size={22}/>}</div>;
}

function AlbumArtwork({album,version}:{album:LocalAlbum;version:number}) {
  const [broken,setBroken] = useState(false);
  useEffect(()=>setBroken(false),[album.id,album.hasCover,version]);
  return <div className="ll-album-art">{album.hasCover&&!broken
    ? <img src={`${API}${album.coverUrl}?v=${version}`} alt={`Capa de ${album.title}`} onError={()=>setBroken(true)}/>
    : <Disc3 size={34}/>}</div>;
}

export default function LocalLibrary() {
  const { playTrack, addToQueue } = usePlayer();
  const input = useRef<HTMLInputElement>(null);
  const coverInput = useRef<HTMLInputElement>(null);
  const coverTarget = useRef<CoverTarget | null>(null);
  const identifyInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const [tracks,setTracks] = useState<StoredTrack[]>([]);
  const [albums,setAlbums] = useState<LocalAlbum[]>([]);
  const [selected,setSelected] = useState<string[]>([]);
  const [destination,setDestination] = useState("");
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState("");
  const [notice,setNotice] = useState("");
  const [artVersion,setArtVersion] = useState(0);
  const [repairing,setRepairing] = useState(false);
  const [identifying,setIdentifying] = useState(false);
  const [identifyProgress,setIdentifyProgress] = useState<IdentifyStatus | null>(null);
  const [uploadingCover,setUploadingCover] = useState(false);

  const load = useCallback(async () => {
    try {
      const [tracksResponse,albumsResponse] = await Promise.all([
        fetch(`${API}/api/library/tracks`), fetch(`${API}/api/library/albums`),
      ]);
      if (!tracksResponse.ok || !albumsResponse.ok) throw new Error("API da biblioteca indisponível.");
      const tracksResult: { tracks: StoredTrack[] } = await tracksResponse.json();
      const albumsResult: { albums: LocalAlbum[] } = await albumsResponse.json();
      setTracks(tracksResult.tracks);
      setAlbums(albumsResult.albums);
      setSelected(previous=>previous.filter(id=>tracksResult.tracks.some(t=>t.id===id)));
      setError("");
    } catch {
      setError("Não foi possível carregar a biblioteca ou os álbuns. Confere se o Flask v1.2.2 está ligado.");
    }
  }, []);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => () => {
    if (identifyInterval.current) clearInterval(identifyInterval.current);
  }, []);

  const selectedTracks = useMemo(() => tracks.filter(track=>selected.includes(track.id)),[tracks,selected]);
  const ungrouped = useMemo(() => tracks.filter(t=>!t.albumId), [tracks]);
  const byAlbum = useMemo(() => {
    const groups: Record<string,StoredTrack[]> = {};
    for(const track of tracks) if(track.albumId) (groups[track.albumId] ||= []).push(track);
    return groups;
  }, [tracks]);

  async function upload(files:FileList|null) {
    if(!files?.length) return;
    setBusy(true);setError("");setNotice("");
    let imported=0,duplicates=0,failures=0;
    for(const file of Array.from(files)) {
      if(!/\.(mp3|flac)$/i.test(file.name)) {failures++;continue;}
      const form=new FormData();form.append("file",file);
      try {
        const response=await fetch(`${API}/api/library/import`,{method:"POST",body:form});
        const data:{duplicate?:boolean;error?:string}=await response.json();
        if(!response.ok) {failures++;setError(data.error||"Falha ao importar arquivo.");}
        else if(data.duplicate) duplicates++;
        else imported++;
      } catch {failures++;setError("Conexão perdida durante a importação.");}
    }
    await load();setBusy(false);
    setNotice(`${imported} importado(s), ${duplicates} repetido(s), ${failures} erro(s).`);
  }

  function toggleTrack(id:string) {
    setSelected(prev=>prev.includes(id)?prev.filter(value=>value!==id):[...prev,id]);
  }

  async function assignToAlbum(albumId:string, ids = selected) {
    if(!albumId || !ids.length) return;
    setBusy(true);setError("");
    try {
      const response=await fetch(`${API}/api/library/albums/${encodeURIComponent(albumId)}/tracks`,{
        method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({track_ids:ids}),
      });
      const result:{assigned?:number;ignored?:number;error?:string}=await response.json();
      if(!response.ok) throw new Error(result.error||"Não foi possível vincular as músicas.");
      setNotice(`${result.assigned||0} faixa(s) vinculada(s) ao álbum. ${result.ignored||0} ignorada(s) por artista diferente.`);
      setSelected([]);setDestination("");await load();setArtVersion(v=>v+1);
    } catch(err) {setError(err instanceof Error?err.message:"Falha ao associar álbum.");}
    finally {setBusy(false);}
  }

  async function createAlbum() {
    if(!selectedTracks.length) return;
    const artist=selectedTracks[0].artist;
    if(selectedTracks.some(track=>track.artist.trim().toLowerCase()!==artist.trim().toLowerCase())) {
      setError("Seleciona apenas músicas de um mesmo artista para criar o álbum.");return;
    }
    const title=window.prompt(`Nome do álbum de ${artist}:`);
    if(!title?.trim()) return;
    setBusy(true);setError("");
    try {
      const response=await fetch(`${API}/api/library/albums`,{
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({artist,title:title.trim()}),
      });
      const result:{id?:string;error?:string}=await response.json();
      if(!response.ok||!result.id) throw new Error(result.error||"Não foi possível criar o álbum.");
      await assignToAlbum(result.id);
    } catch(err) {setError(err instanceof Error?err.message:"Falha ao criar álbum.");}
    finally {setBusy(false);}
  }

  function chooseCover(target:CoverTarget) {coverTarget.current=target;coverInput.current?.click();}

  async function uploadArtwork(files:FileList|null) {
    const target=coverTarget.current;coverTarget.current=null;
    if(!target||!files?.length) return;
    const file=files[0];
    if(file.size>4*1024*1024 || !/\.(jpg|jpeg|png|webp)$/i.test(file.name)) {
      setError("A imagem precisa ser JPG, PNG ou WebP, com até 4 MB.");return;
    }
    setUploadingCover(true);setError("");
    try {
      const endpoint=target.type==="album"
        ? `/api/library/albums/${encodeURIComponent(target.id)}/cover-upload`
        : `/api/library/tracks/${encodeURIComponent(target.id)}/cover-upload`;
      const form=new FormData();form.append("file",file);
      const response=await fetch(`${API}${endpoint}`,{method:"POST",body:form});
      const result:{saved?:boolean;error?:string}=await response.json();
      if(!response.ok||!result.saved) throw new Error(result.error||"Falha ao salvar capa.");
      setArtVersion(v=>v+1);setNotice("Capa salva! Todas as faixas deste álbum mostrarão a mesma imagem.");
      await load();
    } catch(err) {setError(err instanceof Error?err.message:"Falha ao salvar capa.");}
    finally {setUploadingCover(false);}
  }

  async function searchAlbumCover(album:LocalAlbum) {
    setBusy(true);setError("");setNotice(`Procurando capa de ${album.title}...`);
    try {
      const response=await fetch(`${API}/api/library/albums/${encodeURIComponent(album.id)}/cover-search`,{method:"POST"});
      const result:{found?:boolean;error?:string}=await response.json();
      if(!response.ok)throw new Error(result.error||"Falha ao procurar capa.");
      setNotice(result.found?`Capa do álbum ${album.title} encontrada!`:`Nenhuma capa confiável para ${album.title}. Usa o botão Escolher capa.`);
      setArtVersion(v=>v+1);await load();
    } catch(err){setError(err instanceof Error?err.message:"Falha na busca.");}
    finally {setBusy(false);}
  }

  async function repairCovers() {
    if(repairing) return;
    setRepairing(true);setError("");
    const tasks = [
      ...albums.map(album=>({id:album.id,endpoint:`/api/library/albums/${album.id}/cover-search`})),
      ...ungrouped.map(track=>({id:track.id,endpoint:`/api/library/tracks/${track.id}/refresh-cover`})),
    ];
    let found=0,missing=0;
    try {
      for(const [index,task] of tasks.entries()){
        const response=await fetch(`${API}${task.endpoint}`,{method:"POST"});
        const result:{found?:boolean}=response.ok?await response.json():{found:false};
        if(result.found)found++;else missing++;
        setNotice(`Recuperando capas por álbum: ${index+1}/${tasks.length}...`);
      }
      setArtVersion(v=>v+1);await load();
      setNotice(`${found} capas disponíveis, ${missing} sem correspondência. Álbuns compartilham uma única imagem.`);
    } catch{setError("Não foi possível terminar a recuperação de capas.");}
    finally{setRepairing(false);}
  }

  async function startIdentify() {
    setError("");setNotice("Identificando lançamentos do catálogo. Isso pode demorar...");
    try {
      const response=await fetch(`${API}/api/library/albums/identify`,{method:"POST"});
      if(!response.ok) throw new Error("O backend não iniciou a identificação.");
      setIdentifying(true);
      if(identifyInterval.current)clearInterval(identifyInterval.current);
      identifyInterval.current=setInterval(async()=>{
        try{
          const reply=await fetch(`${API}/api/library/albums/identify/status`);
          const data:{status:IdentifyStatus}=await reply.json();
          setIdentifyProgress(data.status);
          if(!data.status.running){
            if(identifyInterval.current)clearInterval(identifyInterval.current);
            identifyInterval.current=null;
            setIdentifying(false);
            await load();setArtVersion(v=>v+1);
            setNotice(data.status.error?`Erro: ${data.status.error}`:
              `${data.status.assigned} música(s) identificada(s), ${data.status.foundCovers} capa(s) de álbum encontrada(s). ${data.status.ambiguous} correspondência(s) ambígua(s) para conferir manualmente.`);
          }
        }catch{setError("Não foi possível consultar o progresso da identificação.");}
      },1400);
    } catch(err){setIdentifying(false);setError(err instanceof Error?err.message:"Falha ao identificar álbuns.");}
  }

  async function remove(track:StoredTrack) {
    if(!window.confirm(`Excluir "${track.title}" da biblioteca?`))return;
    try{
      const response=await fetch(`${API}/api/library/tracks/${encodeURIComponent(track.id)}`,{method:"DELETE"});
      if(!response.ok)throw new Error();
      await load();
    }catch{setError("Não foi possível excluir a faixa.");}
  }

  const renderTrack=(track:StoredTrack)=><div className="ll-track ll-album-track" key={track.id}>
    <input type="checkbox" aria-label={`Selecionar ${track.title}`} checked={selected.includes(track.id)} onChange={()=>toggleTrack(track.id)}/>
    <TrackArtwork track={track} version={artVersion}/>
    <div className="ll-track-info"><strong>{track.title}</strong><span>{track.artist} · {track.filename} · {(track.bytes/1048576).toFixed(1)} MB</span></div>
    <button title={track.albumId?"Alterar capa de todo o álbum":"Escolher capa da música"} disabled={uploadingCover||repairing}
      onClick={()=>chooseCover(track.albumId?{type:"album",id:track.albumId}:{type:"track",id:track.id})}><ImagePlus size={17}/></button>
    <button title="Reproduzir" aria-label={`Reproduzir ${track.title}`}
      onClick={()=>playTrack(playerTrack(track,artVersion),tracks.map(item=>playerTrack(item,artVersion)))}><Play size={17}/></button>
    <button title="Adicionar à fila" aria-label={`Adicionar ${track.title} à fila`}
      onClick={()=>addToQueue(playerTrack(track,artVersion))}><ListPlus size={18}/></button>
    <button title="Excluir música" aria-label={`Excluir ${track.title}`} onClick={()=>void remove(track)}><Trash2 size={17}/></button>
  </div>;

  return <section className="ll-root">
    <div className="ll-header">
      <div><p className="ll-eyebrow">ARQUIVOS SALVOS NO COMPUTADOR</p><h2>Biblioteca offline<span>.</span></h2>
        <p>Álbuns com capas unificadas e músicas disponíveis mesmo sem internet.</p></div>
      <div className="ll-actions">
        <button type="button" onClick={()=>void startIdentify()} disabled={identifying||busy||repairing} title="Identificar os álbuns pelo catálogo"><Search size={16}/>{identifying?" Identificando...":" Identificar álbuns"}</button>
        <button type="button" onClick={()=>void repairCovers()} disabled={repairing||busy||identifying} title="Recuperar uma capa por álbum"><Disc3 size={16}/>{repairing?" Recuperando...":" Recuperar capas"}</button>
        <button type="button" title="Atualizar biblioteca" onClick={()=>void load()}><RefreshCw size={16}/></button>
        <button type="button" className="ll-primary" disabled={busy} onClick={()=>input.current?.click()}><Upload size={17}/>{busy?"Importando...":"Importar MP3 / FLAC"}</button>
      </div>
    </div>
    <input ref={coverInput} type="file" accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp" hidden
      onChange={event=>{void uploadArtwork(event.target.files);event.target.value="";}}/>
    <input ref={input} type="file" multiple accept=".mp3,.flac,audio/mpeg,audio/flac" hidden
      onChange={event=>{void upload(event.target.files);event.target.value="";}}/>
    {identifying&&identifyProgress&&<p role="status" className="ll-notice">Analisando músicas: {identifyProgress.done}/{identifyProgress.total||"..."}. As correspondências incertas exigirão confirmação.</p>}
    {notice&&<p role="status" className="ll-notice">{notice}</p>}
    {error&&<p role="alert" className="ll-error">{error}</p>}
    <div className="ll-album-toolbar">
      <strong>{selected.length} música(s) selecionada(s)</strong>
      <select aria-label="Álbum de destino" value={destination} onChange={event=>setDestination(event.target.value)} disabled={!selected.length}>
        <option value="">Escolher álbum existente...</option>
        {albums.map(album=><option key={album.id} value={album.id}>{album.artist} — {album.title}</option>)}
      </select>
      <button type="button" disabled={!selected.length||!destination||busy} onClick={()=>void assignToAlbum(destination)}>Vincular ao álbum</button>
      <button type="button" disabled={!selected.length||busy} onClick={()=>void createAlbum()}><FolderPlus size={15}/> Criar álbum com seleção</button>
      {selected.length>0&&<button type="button" onClick={()=>setSelected([])}>Limpar seleção</button>}
    </div>
    {!tracks.length&&<div className="ll-empty"><HardDrive size={30}/><h3>Nenhuma música importada ainda.</h3></div>}
    <div className="ll-album-groups">
      {albums.filter(a=>(byAlbum[a.id]||[]).length>0).map(album=><section className="ll-album-section" key={album.id}>
        <div className="ll-album-header">
          <AlbumArtwork album={album} version={artVersion}/>
          <div className="ll-album-title"><h3>{album.title}</h3><p>{album.artist} · {(byAlbum[album.id]||[]).length} música(s)</p></div>
          <div className="ll-album-buttons">
            <button type="button" disabled={busy||repairing} onClick={()=>void searchAlbumCover(album)}><Search size={16}/> Procurar capa</button>
            <button type="button" disabled={uploadingCover||repairing} onClick={()=>chooseCover({type:"album",id:album.id})}><ImagePlus size={16}/> Escolher capa</button>
          </div>
        </div>
        <div className="ll-list">{(byAlbum[album.id]||[]).map(renderTrack)}</div>
      </section>)}
      {ungrouped.length>0&&<section className="ll-album-section">
        <div className="ll-album-header"><div className="ll-album-art"><Disc3 size={34}/></div>
          <div className="ll-album-title"><h3>Sem álbum identificado</h3>
            <p>Seleciona as músicas e cria ou escolhe um álbum. Não juntamos edições diferentes sem confirmação.</p></div></div>
        <div className="ll-list">{ungrouped.map(renderTrack)}</div>
      </section>}
    </div>
    <DownloadsManager onFinished={load}/>
    <p className="ll-note">As capas compartilhadas ficam no computador; os MP3/FLAC permanecem intactos. Se uma faixa entrar no álbum errado, seleciona-a e escolhe o álbum correto.</p>
  </section>;
}
