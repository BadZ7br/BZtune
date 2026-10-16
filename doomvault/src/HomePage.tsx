import { useEffect, useState } from "react";
import { Disc3, LibraryBig, ListMusic, Play, Search, Sparkles, ArrowUpRight } from "lucide-react";
import { usePlayer } from "./player/PlayerContext";
import { API, fromLocal, fullUrl, type StoredTrack, type MusicAlbumLite } from "./music-utils";
import "./home-page.css";
type Playlist = { id: string; name: string; count: number; coverUrl?: string | null; tracks: { cover?: string | null }[] };
type Props = { savedAlbums: MusicAlbumLite[]; onOpenAlbum: (album: MusicAlbumLite) => void; onNavigate: (tab: "search" | "recommendations" | "library" | "playlists") => void };
export default function HomePage({ savedAlbums, onOpenAlbum, onNavigate }: Props) {
  const [recent, setRecent] = useState<StoredTrack[]>([]);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const { playTrack } = usePlayer();
  useEffect(() => {
    let active = true;
    void Promise.allSettled([
      fetch(`${API}/api/library/tracks`).then(r => r.json()) as Promise<{ tracks: StoredTrack[] }>,
      fetch(`${API}/api/playlists`).then(r => r.json()) as Promise<{ playlists: Playlist[] }>
    ]).then(values => {
      if (!active) return;
      if (values[0].status === "fulfilled") setRecent(values[0].value.tracks.slice(0, 8));
      if (values[1].status === "fulfilled") setPlaylists(values[1].value.playlists.slice(0, 6));
    }); return () => { active = false };
  }, []);
  return <section className="dv-home">
    <header className="dv-home-hero"><span className="dv-home-eyebrow">DOOMVAULT / MUSIC ARCHIVE</span>
      <h1>Tua música.<br /><em>Teu universo.</em></h1>
      <p>Explora o catálogo, ouve música, volta às tuas playlists e continua a descobrir.</p>
      <div className="dv-home-actions"><button onClick={() => onNavigate("search")}><Search size={18} /> Procurar música</button><button onClick={() => onNavigate("recommendations")}><Sparkles size={18} /> Descobrir</button></div>
    </header>
    <div className="dv-home-section-heading"><h2><LibraryBig size={20} /> Biblioteca recente</h2><button onClick={() => onNavigate("library")}>Ver tudo <ArrowUpRight size={16} /></button></div>
    {recent.length ? <div className="dv-home-tiles">{recent.map(t => <button className="dv-home-tile" key={t.id} onClick={() => playTrack(fromLocal(t), recent.map(fromLocal))}>
      <div className="dv-home-tile-art">{t.coverUrl ? <img src={fullUrl(t.coverUrl)} alt="" onError={e => e.currentTarget.style.display = "none"} /> : <Disc3 size={30} />}</div>
      <span><strong>{t.title}</strong><small>{t.artist}</small></span><Play size={18} /></button>)}</div> : <p className="dv-home-muted">Teus MP3 e FLAC aparecerão aqui após a importação.</p>}
    <div className="dv-home-section-heading"><h2><ListMusic size={20} /> Tuas playlists</h2><button onClick={() => onNavigate("playlists")}>Abrir playlists <ArrowUpRight size={16} /></button></div>
    {playlists.length ? <div className="dv-home-playlists">{playlists.map(p => <button key={p.id} className="dv-home-playlist" onClick={() => onNavigate("playlists")}>
      {p.coverUrl ? <img src={fullUrl(p.coverUrl)} alt="" /> : <Disc3 size={26} />}<strong>{p.name}</strong><small>{p.count} faixas</small></button>)}</div> : <p className="dv-home-muted">Cria tua primeira playlist para começar uma coleção.</p>}
    {savedAlbums.length > 0 && <><div className="dv-home-section-heading"><h2><Disc3 size={20} /> Na tua coleção</h2></div>
      <div className="dv-home-albums">{savedAlbums.slice(0, 8).map(album => <button key={album.id} onClick={() => onOpenAlbum(album)}>
        {album.cover ? <img src={`${API}/api/cover?${new URLSearchParams({ title: album.title, artist: album.artist, url: album.cover })}`} alt="" /> : <Disc3 size={36} />}<strong>{album.title}</strong><span>{album.artist}</span></button>)}</div></>}
  </section>;
}
