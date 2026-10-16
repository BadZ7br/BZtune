import { useCallback, useEffect, useRef, useState } from "react";
import { Upload, Play, ListPlus, Trash2, RefreshCw, HardDrive, Disc3, ImagePlus } from "lucide-react";
import { usePlayer } from "../player/PlayerContext";
import type { PlayerTrack } from "../player/PlayerContext";
import "./local-library.css";
import "./local-library-v12.css";
import DownloadsManager from "./DownloadsManager";

const API = "http://127.0.0.1:5000";
type StoredTrack = {
  id: string;
  title: string;
  artist: string;
  filename: string;
  bytes: number;
  mime: string;
  audioUrl: string;
  coverUrl?: string | null;
};

function playerTrack(track: StoredTrack): PlayerTrack {
  return {
    videoId: `library:${track.id}`,
    title: track.title,
    artist: track.artist,
    audioUrl: `${API}${track.audioUrl}`,
    cover: track.coverUrl ? `${API}${track.coverUrl}` : null,
  };
}

function TrackArtwork({track,version}:{track:StoredTrack;version:number}) {
  const [broken,setBroken] = useState(false);
  useEffect(()=>setBroken(false),[track.id,version]);
  const url = track.coverUrl ? `${API}${track.coverUrl}?v=${version}` : null;
  return <div className="ll-art-v12">{url&&!broken
    ? <img alt={`Capa de ${track.title}`} src={url} loading="lazy" onError={()=>setBroken(true)}/>
    : <Disc3 size={22}/>}</div>;
}

export default function LocalLibrary() {
  const { playTrack, addToQueue } = usePlayer();
  const input = useRef<HTMLInputElement>(null);
  const coverInput = useRef<HTMLInputElement>(null);
  const coverTarget = useRef<StoredTrack | null>(null);
  const [uploadingCover, setUploadingCover] = useState<string | null>(null);
  const [tracks, setTracks] = useState<StoredTrack[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [artVersions,setArtVersions] = useState<Record<string,number>>({});
  const [repairing,setRepairing] = useState(false);

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
          if(result.found)repaired++;
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
    coverTarget.current=track;
    coverInput.current?.click();
  }

  async function uploadArtwork(files:FileList | null) {
    const track=coverTarget.current;
    coverTarget.current=null;
    if(!track || !files?.length)return;
    const file=files[0];
    if(file.size > 4*1024*1024 || !/\.(jpg|jpeg|png|webp)$/i.test(file.name)) {
      setError("Usa uma imagem JPG, PNG ou WebP de no máximo 4 MB.");
      return;
    }
    setUploadingCover(track.id);
    setError("");
    try {
      const form=new FormData();
      form.append("file",file);
      const response=await fetch(`${API}/api/library/tracks/${encodeURIComponent(track.id)}/cover-upload`,{method:"POST",body:form});
      const result=await response.json() as {saved?:boolean;error?:string};
      if(!response.ok || !result.saved)throw new Error(result.error || "Falha ao salvar capa.");
      setArtVersions(prev=>({...prev,[track.id]:(prev[track.id]||0)+1}));
      setNotice(`Capa de ${track.title} salva!`);
    } catch(err) {
      setError(err instanceof Error ? err.message : "Falha no upload da capa.");
    } finally { setUploadingCover(null); }
  }

  async function remove(track: StoredTrack) {
    if (!window.confirm(`Excluir "${track.title}" da biblioteca?`)) return;
    try {
      const response = await fetch(`${API}/api/library/tracks/${encodeURIComponent(track.id)}`, { method: "DELETE" });
      if (!response.ok) throw new Error();
      await load();
    } catch { setError("Não foi possível excluir a faixa."); }
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
    {notice && <p role="status" className="ll-notice">{notice}</p>}
    {error && <p role="alert" className="ll-error">{error}</p>}
    {!tracks.length && <div className="ll-empty"><HardDrive size={30}/><h3>Nenhuma música importada ainda.</h3><p>Escolhe arquivos MP3 ou FLAC do teu computador para começar.</p></div>}
    <div className="ll-list">
      {tracks.map(track => <div className="ll-track" key={track.id}>
        <TrackArtwork track={track} version={artVersions[track.id]||0}/>
        <div className="ll-track-info"><strong>{track.title}</strong><span>{track.artist} · {track.filename} · {(track.bytes / 1048576).toFixed(1)} MB</span></div>
        <button title="Escolher capa manualmente (JPG, PNG ou WebP)" aria-label={`Escolher capa de ${track.title}`} disabled={uploadingCover === track.id || repairing} onClick={()=>chooseCover(track)}><ImagePlus size={17}/></button>
        <button title="Reproduzir" aria-label={`Reproduzir ${track.title}`} onClick={() => playTrack(playerTrack(track), tracks.map(playerTrack))}><Play size={17}/></button>
        <button title="Adicionar à fila" aria-label={`Adicionar ${track.title} à fila`} onClick={() => addToQueue(playerTrack(track))}><ListPlus size={18}/></button>
        <button title="Remover da biblioteca" aria-label={`Excluir ${track.title}`} onClick={() => void remove(track)}><Trash2 size={17}/></button>
      </div>)}
    </div>
    <DownloadsManager onFinished={load} />
    <p className="ll-note">Offline significa sem conexão à internet: o Flask local ainda precisa estar rodando. Alguns navegadores não reproduzem FLAC; se isso acontecer, tenta um MP3.</p>
  </section>;
}
