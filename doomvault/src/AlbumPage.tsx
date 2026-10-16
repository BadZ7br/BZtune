import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Disc3, Play, SkipForward, Search } from "lucide-react";
import type { MusicAlbum } from "./api";
import { usePlayer } from "./player/PlayerContext";
import CatalogDownloadButton from "./library/CatalogDownloadButton";
import AddToPlaylistButton from "./playlists/AddToPlaylistButton";
import { API, coverProxy, fromWebTrack, type WebTrack } from "./music-utils";
import "./album-page.css";

type Details = { title: string; artist_id?: string | null; year?: string | number | null; description?: string | null; tracks: WebTrack[] };
type Props = { album: MusicAlbum; onBack: () => void; onOpenArtist?: (artist: {name:string;id?:string|null}) => void };
export default function AlbumPage({ album, onBack, onOpenArtist }: Props) {
  const [details, setDetails] = useState<Details | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [artError, setArtError] = useState(false);
  const [coverRetry, setCoverRetry] = useState(0);
  const { playTrack, addToQueue } = usePlayer();
  useEffect(() => {
    const controller = new AbortController();
    setDetails(null); setError(""); setLoading(true); setArtError(false);
    fetch(`${API}/api/albums/${encodeURIComponent(album.id)}`, { signal: controller.signal })
      .then(async response => { if (!response.ok) throw new Error(`Erro HTTP ${response.status}`); return response.json() as Promise<Details> })
      .then(data => { if (!controller.signal.aborted) setDetails(data) })
      .catch(error => { if (!controller.signal.aborted) setError(error instanceof Error ? error.message : "Não foi possível carregar o álbum") })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) });
    return () => controller.abort();
  }, [album.id]);
  const playable = useMemo(() => details?.tracks.map(t => fromWebTrack(t, album.artist, album.title, album.cover)).filter((t): t is NonNullable<typeof t> => !!t) || [], [details, album]);
  const cover = `${coverProxy(album.title, album.artist, album.cover)}&retry=${coverRetry}`;
  return <section className="dv-album-detail">
    <button className="dv-detail-back" onClick={onBack}><ArrowLeft size={18} /> Voltar</button>
    <header className="dv-album-hero">
      <div className="dv-album-cover">{artError ? <div className="dv-album-cover-missing"><Disc3 size={48}/><button onClick={()=>{setArtError(false);setCoverRetry(value=>value+1)}}><Search size={15}/> Procurar capa</button></div> : <img src={cover} onError={() => setArtError(true)} alt={`Capa de ${album.title}`} />}</div>
      <div className="dv-album-intro"><span className="dv-kicker">LANÇAMENTO / DOOMVAULT</span><h1>{album.title}</h1>
        <button className="dv-detail-artist" onClick={() => onOpenArtist?.({name:album.artist,id:details?.artist_id||album.artistId})}>{album.artist}</button>
        <p>{details?.year || album.year || "Ano desconhecido"} · {details?.tracks.length ?? "..."} faixas</p>
        <div className="dv-album-hero-actions"><button onClick={() => playable[0] && playTrack(playable[0], playable)} disabled={!playable.length}><Play size={18} /> Reproduzir álbum</button>
          <CatalogDownloadButton artist={album.artist} title={album.title} kind="release" />
          <AddToPlaylistButton artist={album.artist} title={album.title} kind="release" albumId={album.id} cover={album.cover} /></div>
      </div>
    </header>
    {loading && <p role="status">Carregando faixas do lançamento...</p>}
    {error && <p role="alert" className="dv-detail-error">{error}</p>}
    {details && !details.tracks.length && <p>Nenhuma faixa encontrada neste lançamento.</p>}
    {details && <div className="dv-album-tracks"><h2>Faixas</h2>{details.tracks.map((track, i) => {
      const playableTrack = fromWebTrack(track, album.artist, album.title, album.cover);
      return <div className="dv-album-track" key={`${track.video_id || track.title}-${i}`}>
        <span className="dv-album-number">{track.number || i + 1}</span>
        <button className="dv-album-track-name" onClick={() => { if (playableTrack) playTrack(playableTrack, playable) }} disabled={!playableTrack} aria-label={`Reproduzir ${track.title}`}>
          <Play size={16} /><span><strong>{track.title}</strong><small>{album.artist}</small></span></button>
        <small>{track.duration || ""}</small>
        <button className="dv-small-action" title="Adicionar à fila" aria-label={`Adicionar ${track.title} à fila`} disabled={!playableTrack} onClick={() => playableTrack && addToQueue(playableTrack)}><SkipForward size={16} /></button>
        <CatalogDownloadButton artist={album.artist} title={track.title} kind="track" />
        {playableTrack && <AddToPlaylistButton artist={album.artist} title={track.title} kind="track" videoId={track.video_id} cover={album.cover} album={album.title} />}
      </div>
    })}</div>}
  </section>;
}
