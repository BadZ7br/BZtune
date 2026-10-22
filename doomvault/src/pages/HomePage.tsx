import { Disc3, LibraryBig, ListMusic, ListPlus, Play, Search, Sparkles, ArrowUpRight, SkipForward } from "lucide-react";
import { usePlayer } from "../player/PlayerContext";
import { API, fromLocal, fullUrl, type MusicAlbumLite } from "../utils/music-utils";
import { loadHomePlaylists, loadRecentTracks } from "../services/home";
import { useHomeResource } from "../hooks/useHomeResource";
type Props = { savedAlbums: MusicAlbumLite[]; onOpenAlbum: (album: MusicAlbumLite) => void; onNavigate: (tab: "search" | "recommendations" | "library" | "playlists") => void };
export default function HomePage({ savedAlbums, onOpenAlbum, onNavigate }: Props) {
  const library = useHomeResource(loadRecentTracks);
  const collections = useHomeResource(loadHomePlaylists);
  const recent = library.items;
  const playlists = collections.items;
  const { playTrack, addToQueue, playNext } = usePlayer();
  return <section className="dv-home">
    <header className="dv-home-hero"><span className="dv-home-eyebrow">BZtune / MUSIC ARCHIVE</span>
      <h1>Tua música.<br /><em>Teu universo.</em></h1>
      <p>Explora o catálogo, ouve música, volta às tuas playlists e continua a descobrir.</p>
      <div className="dv-home-actions"><button onClick={() => onNavigate("search")}><Search size={18} /> Procurar música</button><button onClick={() => onNavigate("recommendations")}><Sparkles size={18} /> Descobrir</button></div>
    </header>
    <div className="dv-home-section-heading"><h2><LibraryBig size={20} /> Biblioteca recente</h2><button onClick={() => onNavigate("library")}>Ver tudo <ArrowUpRight size={16} /></button></div>
    {library.status === "loading" ? <p className="dv-home-status" role="status">Carregando biblioteca…</p> : library.status === "error" ?
      <div className="dv-home-error"><p role="alert">Não foi possível carregar a biblioteca.</p><button type="button" onClick={library.retry} aria-label="Tentar carregar biblioteca novamente">Tentar novamente</button></div> : recent.length ? <div className="dv-home-tiles">{recent.map(t => <div className="bz-home-track" key={t.id}><button type="button" className="dv-home-tile" aria-label={`Reproduzir ${t.title}`} onClick={() => playTrack(fromLocal(t), recent.map(fromLocal))}>
      <div className="dv-home-tile-art">{t.coverUrl ? <img src={fullUrl(t.coverUrl)} alt="" onError={e => e.currentTarget.style.display = "none"} /> : <Disc3 size={30} />}</div>
      <span><strong title={t.title}>{t.title}</strong><small title={t.artist}>{t.artist}</small></span><Play size={18} aria-hidden="true" /></button>
      <div className="bz-home-track-actions" role="group" aria-label={`Ações de ${t.title}`}>
        <button type="button" className="bz-home-queue-action" onClick={() => playNext(fromLocal(t))} title={`Tocar ${t.title} a seguir`} aria-label={`Tocar ${t.title} a seguir`}><SkipForward size={16} aria-hidden="true" /><span>Tocar a seguir</span></button>
        <button type="button" className="bz-home-queue-action" onClick={() => addToQueue(fromLocal(t))} title={`Adicionar ${t.title} ao fim da fila`} aria-label={`Adicionar ${t.title} ao fim da fila`}><ListPlus size={16} aria-hidden="true" /><span>Adicionar à fila</span></button>
      </div></div>)}</div> : <p className="dv-home-muted">Teus MP3 e FLAC aparecerão aqui após a importação.</p>}
    <div className="dv-home-section-heading"><h2><ListMusic size={20} /> Tuas playlists</h2><button onClick={() => onNavigate("playlists")}>Abrir playlists <ArrowUpRight size={16} /></button></div>
    {collections.status === "loading" ? <p className="dv-home-status" role="status">Carregando playlists…</p> : collections.status === "error" ?
      <div className="dv-home-error"><p role="alert">Não foi possível carregar as playlists.</p><button type="button" onClick={collections.retry} aria-label="Tentar carregar playlists novamente">Tentar novamente</button></div> : playlists.length ? <div className="dv-home-playlists">{playlists.map(p => <button key={p.id} className="dv-home-playlist" onClick={() => onNavigate("playlists")}>
      {p.coverUrl ? <img src={fullUrl(p.coverUrl)} alt="" /> : <Disc3 size={26} />}<strong>{p.name}</strong><small>{p.count} faixas</small></button>)}</div> : <p className="dv-home-muted">Cria tua primeira playlist para começar uma coleção.</p>}
    {savedAlbums.length > 0 && <><div className="dv-home-section-heading"><h2><Disc3 size={20} /> Na tua coleção</h2></div>
      <div className="dv-home-albums">{savedAlbums.slice(0, 8).map(album => <button key={album.id} onClick={() => onOpenAlbum(album)}>
        {album.cover ? <img src={`${API}/api/cover?${new URLSearchParams({ title: album.title, artist: album.artist, url: album.cover })}`} alt="" /> : <Disc3 size={36} />}<strong>{album.title}</strong><span>{album.artist}</span></button>)}</div></>}
  </section>;
}
