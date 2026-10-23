import { Disc3, LibraryBig, ListMusic, Search, Sparkles, ArrowUpRight } from "lucide-react";
import { usePlayer } from "../player/PlayerContext";
import { API, fromLocal, fullUrl, type MusicAlbumLite } from "../utils/music-utils";
import { loadHomePlaylists, loadRecentTracks } from "../services/home";
import { useHomeResource } from "../hooks/useHomeResource";
import RecentTrackCard from "./RecentTrackCard";
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
      <div className="dv-home-error"><p role="alert">Não foi possível carregar a biblioteca.</p><button type="button" onClick={library.retry} aria-label="Tentar carregar biblioteca novamente">Tentar novamente</button></div> : recent.length ? <div className="dv-home-tiles">{recent.map(t => <RecentTrackCard key={t.id} track={t}
      onPlay={() => playTrack(fromLocal(t), recent.map(fromLocal))}
      onNext={() => playNext(fromLocal(t))} onQueue={() => addToQueue(fromLocal(t))} />)}</div> : <p className="dv-home-muted">Teus MP3 e FLAC aparecerão aqui após a importação.</p>}
    <div className="dv-home-section-heading"><h2><ListMusic size={20} /> Tuas playlists</h2><button onClick={() => onNavigate("playlists")}>Abrir playlists <ArrowUpRight size={16} /></button></div>
    {collections.status === "loading" ? <p className="dv-home-status" role="status">Carregando playlists…</p> : collections.status === "error" ?
      <div className="dv-home-error"><p role="alert">Não foi possível carregar as playlists.</p><button type="button" onClick={collections.retry} aria-label="Tentar carregar playlists novamente">Tentar novamente</button></div> : playlists.length ? <div className="dv-home-playlists">{playlists.map(p => <button key={p.id} className="dv-home-playlist" onClick={() => onNavigate("playlists")}>
      {p.coverUrl ? <img src={fullUrl(p.coverUrl)} alt="" /> : <Disc3 size={26} />}<strong>{p.name}</strong><small>{p.count} faixas</small></button>)}</div> : <p className="dv-home-muted">Cria tua primeira playlist para começar uma coleção.</p>}
    {savedAlbums.length > 0 && <><div className="dv-home-section-heading"><h2><Disc3 size={20} /> Na tua coleção</h2></div>
      <div className="dv-home-albums">{savedAlbums.slice(0, 8).map(album => <button key={album.id} onClick={() => onOpenAlbum(album)}>
        {album.cover ? <img src={`${API}/api/cover?${new URLSearchParams({ title: album.title, artist: album.artist, url: album.cover })}`} alt="" /> : <Disc3 size={36} />}<strong>{album.title}</strong><span>{album.artist}</span></button>)}</div></>}
  </section>;
}
