import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Disc3, Play, Search, SkipForward } from "lucide-react";
import type { MusicAlbum } from "../services/api";
import { usePlayer } from "../player/PlayerContext";
import CatalogDownloadButton from "../library/CatalogDownloadButton";
import AddToPlaylistButton from "../playlists/AddToPlaylistButton";
import LibrarySourceActions from "../library/LibrarySourceActions";
import { useLibraryAvailability, matchLocalTracks, confirmedLocalMatch } from "../library/library-availability";
import { API, coverProxy, fromWebTrack, type WebTrack } from "../utils/music-utils";
type Details = { title: string; artist_id?: string | null; year?: string | number | null; description?: string | null; tracks: WebTrack[] };
type Props = { album: MusicAlbum; onBack: () => void; onOpenArtist?: (artist: { name: string; id?: string | null }) => void };
export default function AlbumPage({ album, onBack, onOpenArtist }: Props) {
  const [details, setDetails] = useState<Details | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [artError, setArtError] = useState(false);
  const [coverRetry, setCoverRetry] = useState(0);
  const [repairBusy, setRepairBusy] = useState(false);
  const [repairNotice, setRepairNotice] = useState("");
  const { playTrack, addToQueue } = usePlayer();
  const library = useLibraryAvailability();
  useEffect(() => {
    const controller = new AbortController();
    setDetails(null); setError(""); setLoading(true); setArtError(false); setCoverRetry(0);
    fetch(`${API}/api/albums/${encodeURIComponent(album.id)}`, { signal: controller.signal })
      .then(async response => { if (!response.ok) throw new Error(`Erro HTTP ${response.status}`); return response.json() as Promise<Details> })
      .then(data => { if (!controller.signal.aborted) setDetails(data) })
      .catch(error => { if (!controller.signal.aborted) setError(error instanceof Error ? error.message : "Não foi possível carregar o álbum") })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) });
    return () => controller.abort();
  }, [album.id]);
  const playable = useMemo(() => details?.tracks.map(t => fromWebTrack(t, album.artist, album.title, album.cover)).filter((t): t is NonNullable<typeof t> => !!t) || [], [details, album]);
  const cover = `${coverProxy(album.title, album.artist, album.cover)}&retry=${coverRetry}`;
  const confirmedCount = details?.tracks.filter(t => {
    const playableTrack = fromWebTrack(t, album.artist, album.title, album.cover);
    return playableTrack && confirmedLocalMatch(matchLocalTracks(playableTrack, library.tracks));
  }).length || 0;
  function playChosen(track: NonNullable<ReturnType<typeof fromWebTrack>>) {
    // Ao trocar de fonte, apenas a faixa escolhida ganha a preferência; a ordem não muda.
    const chosenQueue = playable.map(item => item.videoId === track.videoId ? track : item);
    playTrack(track, chosenQueue);
  }
  async function repairAlbum() {
    setRepairBusy(true); setRepairNotice("");
    try {
      const response = await fetch(`${API}/api/library/albums/reconcile`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ albumId: album.id, title: album.title, artist: album.artist }),
      });
      const result = await response.json() as { matched?: number; assigned?: number; skipped?: number; coverFound?: boolean; error?: string };
      if (!response.ok) throw new Error(result.error || "Não foi possível organizar as faixas.");
      setRepairNotice(`${result.assigned || 0} faixa(s) vinculada(s) ao álbum; ${result.skipped || 0} preservada(s) em outros grupos.${result.coverFound ? " Capa compartilhada encontrada." : " Capa oficial indisponível: podes escolher manualmente."}`);
      window.dispatchEvent(new Event("doomvault-library-updated"));
    } catch (err) { setRepairNotice(err instanceof Error ? err.message : "Não foi possível identificar as faixas."); }
    finally { setRepairBusy(false); }
  }
  return <section className="dv-album-detail">
    <button className="dv-detail-back" onClick={onBack}><ArrowLeft size={18} /> Voltar</button>
    <header className="dv-album-hero">
      <div className="dv-album-cover">{artError ? <div className="dv-album-cover-missing"><Disc3 size={48} /><button onClick={() => { setArtError(false); setCoverRetry(value => value + 1); }}><Search size={15} /> Procurar capa</button></div> : <img src={cover} onError={() => setArtError(true)} alt={`Capa de ${album.title}`} />}</div>
      <div className="dv-album-intro"><span className="dv-kicker">LANÇAMENTO / DOOMVAULT</span><h1>{album.title}</h1>
        <button className="dv-detail-artist" onClick={() => onOpenArtist?.({ name: album.artist, id: details?.artist_id || album.artist_id })}>{album.artist}</button>
        <p>{details?.year || album.year || "Ano desconhecido"} · {details?.tracks.length ?? "..."} faixas
          {library.status === "ready" && details && <> · <strong className="bz-hybrid-album-count">{confirmedCount} offline identificada(s)</strong></>}
        </p>
        <div className="dv-album-hero-actions"><button onClick={() => playable[0] && playTrack(playable[0], playable)} disabled={!playable.length}><Play size={18} /> Reproduzir álbum</button>
          <CatalogDownloadButton artist={album.artist} title={album.title} kind="release" albumId={album.id} />
          <AddToPlaylistButton artist={album.artist} title={album.title} kind="release" albumId={album.id} cover={album.cover} /></div>
        {confirmedCount > 0 && <div style={{ marginTop: 12 }}>
          <button type="button" className="dv-action" onClick={() => void repairAlbum()} disabled={repairBusy}>
            {repairBusy ? "Verificando associação..." : "Organizar músicas baixadas deste álbum"}
          </button>
          {repairNotice && <p role="status">{repairNotice}</p>}
        </div>}
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
        <CatalogDownloadButton artist={album.artist} title={track.title} kind="track" albumId={album.id} videoId={track.video_id} />
        {playableTrack && <AddToPlaylistButton artist={album.artist} title={track.title} kind="track" videoId={track.video_id} cover={album.cover} album={album.title} />}
        {playableTrack && <LibrarySourceActions track={playableTrack} library={library.tracks} onPlay={playChosen} compact />}
      </div>
    })}</div>}
  </section>;
}
