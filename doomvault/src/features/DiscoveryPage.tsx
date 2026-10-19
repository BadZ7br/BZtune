import { useCallback, useEffect, useMemo, useState } from "react";
import { Heart, ListMusic, Play, Radio, RefreshCw, Search, Sparkles } from "lucide-react";
import { usePlayer } from "../player/PlayerContext";
import type { PlayerTrack } from "../player/PlayerContext";
import SafeArtwork from "./SafeArtwork";

const API = "http://127.0.0.1:5000";
type Song = { videoId: string; title: string; artist: string; recommended?: boolean; album?: string; cover?: string | null; duration?: string };
type Album = { id: string; title: string; artist: string; cover?: string | null; year?: string | number };
type Neighbor = { id: string; name: string; cover?: string | null };
type Result = { songs?: Song[]; tracks?: Song[]; albums?: Album[]; artists?: Neighbor[]; seedArtists?: string[]; note?: string };
type PageMode = "recs" | "radio" | "related" | "moods";

function playerSong(song: Song): PlayerTrack {
  return { videoId: song.videoId, title: song.title, artist: song.artist, cover: song.cover, album: song.album };
}
async function json<T>(path: string): Promise<T> {
  const res = await fetch(`${API}${path}`);
  const value = await res.json() as T & { error?: string };
  if (!res.ok) throw new Error(value.error || `Falha ${res.status}`);
  return value;
}

export default function DiscoveryPage() {
  const { playTrack, addToQueue, playNext, repeat, cycleRepeat } = usePlayer();
  const [mode, setMode] = useState<PageMode>("recs");
  const [artist, setArtist] = useState("");
  const [artistId, setArtistId] = useState("");
  const [candidates, setCandidates] = useState<Neighbor[]>([]);
  const [genre, setGenre] = useState("doom metal");
  const [mood, setMood] = useState("melancolico");
  const [result, setResult] = useState<Result>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [seedArtists, setSeedArtists] = useState<string[]>([]);
  const [revision, setRevision] = useState(0);
  const [lastMode, setLastMode] = useState<PageMode | null>(null);

  const url = useMemo(() => {
    const query = new URLSearchParams();
    if (mode === "recs") {
      for (const name of seedArtists.slice(0, 4)) query.append("artist", name);
      return `/api/bztune/discovery/recommendations?${query}`;
    }
    if (mode === "radio") { query.set("artist", artist); if (artistId) query.set("id",artistId); return `/api/bztune/discovery/radio?${query}`; }
    if (mode === "related") { query.set("id", artistId); query.set("name", artist); return `/api/bztune/discovery/related?${query}`; }
    query.set("genre", genre); query.set("mood", mood);
    return `/api/bztune/discovery/explore?${query}`;
  }, [mode, seedArtists, artist, artistId, genre, mood]);

  useEffect(() => {
    try {
      const favorites = JSON.parse(localStorage.getItem("doomvault-favorites") || "[]") as string[];
      const catalog = JSON.parse(localStorage.getItem("doomvault-api-albums") || "[]") as Array<{ id: string; artist: string }>;
      const selected = catalog.filter(a => favorites.includes(a.id));
      setSeedArtists([...new Set(selected.map(x => x.artist).filter(Boolean))].slice(0, 4));
    } catch { setSeedArtists([]); }
  }, [revision]);

  const run = useCallback(async () => {
    if (mode === "related" && !artistId) {
      setError("Para artistas semelhantes, informe um ID de artista válido do catálogo."); return;
    }
    if (mode === "radio" && !artist.trim()) {
      setError("Digite o nome de um artista para iniciar a rádio."); return;
    }
    setLoading(true); setError(""); setLastMode(mode); setResult({});
    try { setResult(await json<Result>(url)); }
    catch (err) { setResult({}); setError(err instanceof Error ? err.message : "Erro na descoberta."); }
    finally { setLoading(false); }
  }, [mode, artist, artistId, url]);

  useEffect(() => { if (mode === "recs") void run(); }, [mode, run]);
  const songs = lastMode === mode ? (result.songs || result.tracks || []) : [];
  async function lookupArtists() {
    if (!artist.trim()) return;
    setError("");
    try {
      const data = await json<{results: Array<{id:string;name:string;image?:string|null}>}>(`/api/artists?q=${encodeURIComponent(artist)}`);
      setCandidates(data.results.filter(x=>x.id).map(x=>({id:x.id,name:x.name,cover:x.image})));
    } catch (err) {setError(err instanceof Error ? err.message : "Falha na pesquisa de artistas");}
  }
  async function playAlbum(album: Album) {
    try {
      setError("");
      const info = await json<{tracks?: Array<{ video_id?: string; videoId?: string; title: string; artists?: string[] }> }>(`/api/albums/${encodeURIComponent(album.id)}`);
      const songs = (info.tracks || []).map(track => ({
        videoId: track.video_id || track.videoId || "", title: track.title, artist: (track.artists || [album.artist]).join(", "),
        album: album.title, cover: album.cover,
      })).filter(track => track.videoId.length === 11);
      if (!songs.length) throw new Error("Não foi possível carregar as faixas deste álbum.");
      const queue = songs.map(playerSong);
      playTrack(queue[0],queue);
    } catch (err) {setError(err instanceof Error ? err.message : "Erro ao abrir álbum");}
  }
  const startRadio = () => {
    const list = songs.map(playerSong);
    if (list.length) {
      playTrack(list[0], list);
      // Rádio gera uma fila finita e a repete continuamente enquanto o modo rádio está ativo.
      if (repeat === "off") cycleRepeat();
      else if (repeat === "one") { cycleRepeat(); cycleRepeat(); }
    }
  };

  return <section className="bz-feat-root">
    <div className="bz-feat-header"><div><p className="bz-eyebrow">BZTUNE / DESCOBERTA</p><h2>Descoberta musical<span>.</span></h2><p>Encontra novos sons a partir do teu gosto e do catálogo musical.</p></div>
      <button onClick={() => { setRevision(n => n + 1); void run(); }} title="Atualizar"><RefreshCw size={18} /></button></div>
    <div className="bz-mode-tabs" role="tablist" aria-label="Modos de descoberta">
      <button className={mode === "recs" ? "active" : ""} onClick={() => setMode("recs")}><Sparkles size={15}/> Para você</button>
      <button className={mode === "radio" ? "active" : ""} onClick={() => setMode("radio")}><Radio size={15}/> Rádio</button>
      <button className={mode === "related" ? "active" : ""} onClick={() => setMode("related")}><Heart size={15}/> Semelhantes</button>
      <button className={mode === "moods" ? "active" : ""} onClick={() => setMode("moods")}><Search size={15}/> Gêneros e climas</button>
    </div>
    {mode === "radio" && <p className="bz-hint">A rádio gera uma fila de faixas do catálogo e ativa Repeat All para continuar tocando. Podes mudar esse modo no player a qualquer momento.</p>}
    {mode === "recs" && <p className="bz-hint">Recomendações baseadas nos favoritos e nos artistas mais ouvidos. Nenhum dado é enviado para uma conta externa.</p>}
    {mode === "radio" && <div className="bz-feat-form"><label>Artista<input value={artist} onChange={e => {setArtist(e.target.value);setArtistId("");}} placeholder="Ex.: Black Sabbath"/></label><button onClick={() => void run()}>Gerar rádio</button></div>}
    {mode === "related" && <div className="bz-feat-form"><label>Nome<input value={artist} onChange={e => setArtist(e.target.value)} placeholder="Artista"/></label><label>ID do artista selecionado<input value={artistId} onChange={e => setArtistId(e.target.value)} placeholder="Seleciona abaixo"/></label><button onClick={() => void lookupArtists()}>Encontrar perfis</button><button onClick={() => void run()}>Buscar semelhantes</button></div>}
    {mode === "related" && candidates.length > 0 && <div className="bz-artist-grid">{candidates.map(item => <button key={item.id} onClick={() => {setArtist(item.name);setArtistId(item.id);setCandidates([]);}}>{item.cover && <img src={item.cover} alt=""/>}<span>{item.name}</span></button>)}</div>}
    {mode === "moods" && <div className="bz-feat-form"><label>Gênero<input value={genre} onChange={e => setGenre(e.target.value)} placeholder="doom metal"/></label><label>Clima<select value={mood} onChange={e => setMood(e.target.value)}><option value="melancolico">Melancólico</option><option value="sombrio">Sombrio</option><option value="relaxante">Relaxante</option><option value="energetico">Energético</option><option value="psicodelico">Psicodélico</option><option value="instrumental">Instrumental</option></select></label><button onClick={() => void run()}>Explorar</button></div>}
    {loading && <p role="status" className="bz-hint">Consultando catálogo...</p>}
    {!loading && lastMode !== mode && <p className="bz-hint">Define os filtros e clica em {mode === "radio" ? "Gerar rádio" : mode === "related" ? "Buscar semelhantes" : mode === "moods" ? "Explorar" : "Atualizar"}.</p>}
    {error && <p role="alert" className="bz-error">{error}</p>}
    {!loading && !error && lastMode === mode && (mode === "radio" || mode === "moods") && songs.length === 0 &&
      <p className="bz-hint" role="status">Nenhuma gravação suficientemente identificada foi encontrada. Tenta outro artista, gênero ou clima.</p>}
    {result.note && <p className="bz-hint">{result.note}</p>}
    {songs.length > 0 && <div className="bz-feat-subheading"><h3>Faixas ({songs.length})</h3><button onClick={startRadio}><Radio size={16}/> Tocar sequência</button></div>}
    <div className="bz-song-list">{songs.map(song => <div className="bz-song" key={song.videoId}>
      <div className="bz-song-cover"><SafeArtwork src={song.cover} title={song.title} artist={song.artist} kind="song" /></div>
      <div className="bz-song-info"><strong>{song.title}</strong><span>{song.recommended ? "Sugestão · " : ""}{song.artist}{song.album ? ` · ${song.album}` : ""}</span></div>
      <button title="Tocar" onClick={() => playTrack(playerSong(song), songs.map(playerSong))}><Play size={17}/></button>
      <button title="Tocar a seguir" aria-label={`Tocar ${song.title} a seguir`} onClick={() => playNext(playerSong(song))}>▶</button>
      <button title="Adicionar à fila" onClick={() => addToQueue(playerSong(song))}><ListMusic size={17}/></button>
    </div>)}</div>
    {lastMode === mode && (result.artists?.length || 0) > 0 && <><h3>Artistas relacionados</h3><div className="bz-artist-grid">{result.artists?.map(row => <button key={row.id} onClick={() => {setArtist(row.name);setArtistId(row.id);setMode("radio");}}><SafeArtwork src={row.cover} title={row.name} kind="artist"/><span>{row.name}</span></button>)}</div></>}
    {lastMode === mode && (result.albums?.length || 0) > 0 && <><h3>Álbuns encontrados</h3><div className="bz-album-grid">{result.albums?.map(row => <article key={row.id}><div className="bz-album-cover"><SafeArtwork src={row.cover} title={row.title} artist={row.artist} kind="release"/></div><strong>{row.title}</strong><span>{row.artist} {row.year || ""}</span><button onClick={() => void playAlbum(row)}><Play size={15}/> Tocar álbum</button></article>)}</div></>}
  </section>;
}
