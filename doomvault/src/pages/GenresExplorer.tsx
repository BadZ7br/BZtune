import { apiFetch } from "../services/api-fetch";
import { useEffect, useMemo, useState } from "react";
import { Search, ChevronLeft, ChevronRight, Disc3, Heart, Plus, Check, Play } from "lucide-react";
import { searchAlbums, type MusicAlbum } from "../services/api";
const API = "http://127.0.0.1:5000";
type Genre = { id: string; name: string };
type Artist = { id: string; name: string; score?: number };
type GenreIndexResponse = { genres: string[]; count: number };
type ArtistsResponse = { genre: string; artists: Artist[]; count: number; offset: number };
type Props = {
  favorites: string[];
  collection: string[];
  toggleFavorite: (album: MusicAlbum) => void;
  toggleCollection: (album: MusicAlbum) => void;
  onOpenAlbum?: (album: MusicAlbum) => void;
  onOpenArtist?: (artist: { name: string; id?: string | null }) => void;
};
const PAGE_SIZE = 100;
const ARTIST_PAGE_SIZE = 12;
// Evita refazer a mesma página durante esta sessão.
let genreIndexCache: string[] | null = null;
const resolvedGenres = new Map<string, Genre>();
const artistsPageCache = new Map<string, ArtistsResponse>();

function Artwork({ album }: { album: MusicAlbum }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [album.id, album.cover]);
  const url = `${API}/api/cover?${new URLSearchParams({
    url: album.cover || "", title: album.title, artist: album.artist,
  })}`;
  return <div className="ge-cover">
    {failed ? <div className="ge-fallback"><Disc3 size={26} /><strong>{album.title}</strong></div>
      : <img loading="lazy" src={url} alt={`Capa de ${album.title}`} onError={() => setFailed(true)} />}
  </div>;
}

export default function GenresExplorer({ favorites, collection, toggleFavorite, toggleCollection, onOpenAlbum, onOpenArtist }: Props) {
  const [page, setPage] = useState(1);
  const [names, setNames] = useState<string[]>(genreIndexCache || []);
  const [initial, setInitial] = useState("all");
  const [opening, setOpening] = useState(false);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Genre | null>(null);
  const [artists, setArtists] = useState<Artist[]>([]);
  const [artistCount, setArtistCount] = useState(0);
  const [artistOffset, setArtistOffset] = useState(0);
  const [selectedArtist, setSelectedArtist] = useState<string | null>(null);
  const [albums, setAlbums] = useState<MusicAlbum[]>([]);
  const [loadingGenres, setLoadingGenres] = useState(false);
  const [loadingArtists, setLoadingArtists] = useState(false);
  const [loadingAlbums, setLoadingAlbums] = useState(false);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    if (genreIndexCache) {
      setNames(genreIndexCache);
      setLoadingGenres(false);
      return;
    }
    const controller = new AbortController();
    setLoadingGenres(true);
    apiFetch(`${API}/api/genres/index`, { signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw new Error("Falha ao obter gêneros");
        return response.json() as Promise<GenreIndexResponse>;
      })
      .then(data => {
        if (controller.signal.aborted) return;
        genreIndexCache = data.genres;
        setNames(data.genres);
        setError("");
      })
      .catch(() => {
        if (!controller.signal.aborted) setError("Não foi possível carregar o índice global de gêneros.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadingGenres(false);
      });
    return () => controller.abort();
  }, [retry]);

  async function openGenre(name: string, index: number) {
    setSelected(null);
    setArtists([]);
    setSelectedArtist(null);
    setAlbums([]);
    setArtistOffset(0);
    setError("");
    const cached = resolvedGenres.get(name);
    if (cached) { setSelected(cached); return; }
    setOpening(true);
    try {
      const response = await apiFetch(`${API}/api/genres/resolve?index=${index}`);
      if (!response.ok) throw new Error("Falha ao identificar gênero");
      const genre = await response.json() as Genre;
      resolvedGenres.set(name, genre);
      setSelected(genre);
    } catch {
      setError("Não foi possível abrir esse gênero. Tenta novamente.");
    } finally {
      setOpening(false);
    }
  }

  useEffect(() => {
    if (!selected) return;
    const controller = new AbortController();
    const cacheKey = `${selected.id}:${artistOffset}`;
    const cached = artistsPageCache.get(cacheKey);
    if (cached) {
      setArtists(cached.artists); setArtistCount(cached.count);
      setLoadingArtists(false); setError("");
      return () => controller.abort();
    }
    setArtists([]); setLoadingArtists(true); setError("");
    apiFetch(`${API}/api/genres/${encodeURIComponent(selected.id)}/artists?name=${encodeURIComponent(selected.name)}&offset=${artistOffset}&limit=${ARTIST_PAGE_SIZE}`, { signal: controller.signal })
      .then(async r => { if (!r.ok) throw new Error("Falha ao obter artistas"); return r.json() as Promise<ArtistsResponse>; })
      .then(d => { if (!controller.signal.aborted) { artistsPageCache.set(cacheKey, d); setArtists(d.artists); setArtistCount(d.count); } })
      .catch(() => { if (!controller.signal.aborted) setError("Não foi possível carregar artistas desse gênero."); })
      .finally(() => { if (!controller.signal.aborted) setLoadingArtists(false); });
    return () => controller.abort();
  }, [selected, artistOffset, retry]);

  useEffect(() => {
    if (!selectedArtist) return;
    let cancelled = false;
    setAlbums([]); setLoadingAlbums(true); setError("");
    searchAlbums(selectedArtist)
      .then(d => {
        if (cancelled) return;
        const normalized = (v: string) => v.toLowerCase().replace(/[^a-z0-9]/g, "");
        const exact = d.results.filter(a => normalized(a.artist) === normalized(selectedArtist));
        const seen = new Set<string>();
        setAlbums(exact.filter(a => {
          const key = a.id;
          if (seen.has(key)) return false;
          seen.add(key); return true;
        }));
      })
      .catch(() => { if (!cancelled) setError("Não foi possível carregar lançamentos desse artista."); })
      .finally(() => { if (!cancelled) setLoadingAlbums(false); });
    return () => { cancelled = true; };
  }, [selectedArtist]);

  const matched = useMemo(() => {
    const term = query.trim().toLocaleLowerCase();
    return names.map((name, index) => ({ name, index })).filter(item => {
      if (term) return item.name.toLocaleLowerCase().includes(term);
      if (initial === "all") return true;
      const first = item.name[0]?.toUpperCase() || "#";
      return initial === "#" ? !/^[A-Z]$/.test(first) : first === initial;
    });
  }, [names, query, initial]);
  const totalPages = Math.max(1, Math.ceil(matched.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const visibleGenres = matched.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const initials = ["all", "#", ..."ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("")];

  return <section className="ge-root">
    <div className="ge-search"><Search size={18} /><input value={query} onChange={e => { setQuery(e.target.value); setPage(1); setInitial("all"); }} placeholder="Pesquisar em todos os gêneros..." aria-label="Pesquisar gêneros globalmente" /></div>
    <p className="ge-caption">Busca global em {names.length.toLocaleString("pt-BR")} gêneros do MusicBrainz. Escolhe uma inicial ou vai diretamente à página desejada.</p>
    <div className="ge-initials" role="group" aria-label="Filtrar por inicial">
      {initials.map(letter => <button key={letter} type="button" className={!query && initial === letter ? "active" : ""} onClick={() => { setQuery(""); setInitial(letter); setPage(1); }}>{letter === "all" ? "Todas" : letter}</button>)}
    </div>
    {error && <p role="alert" className="ge-error">{error} <button type="button" onClick={() => { setError(""); setRetry(v => v + 1); }}>Tentar novamente</button></p>}
    <div className="ge-header"><h2>Explorar gêneros</h2><span>{matched.length.toLocaleString("pt-BR")} resultado(s)</span></div>
    {loadingGenres ? <p className="ge-caption">Carregando o catálogo global de gêneros...</p> : (
      <div className="ge-tags">{visibleGenres.map(g => <button type="button" key={g.index} className={selected?.name === g.name ? "active" : ""} disabled={opening} onClick={() => { void openGenre(g.name, g.index); }}>{g.name}</button>)}
        {!visibleGenres.length && <p className="ge-caption">Nenhum gênero corresponde à pesquisa.</p>}</div>
    )}
    {opening && <p className="ge-caption" role="status">Abrindo gênero...</p>}
    <div className="ge-pagination">
      <button disabled={currentPage === 1 || loadingGenres} onClick={() => setPage(currentPage - 1)}><ChevronLeft size={16} /> Anterior</button>
      <label className="ge-jump">Página <select aria-label="Escolher página" value={currentPage} onChange={event => setPage(Number(event.target.value))}>
        {Array.from({ length: totalPages }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1}</option>)}
      </select> de {totalPages}</label>
      <button disabled={currentPage >= totalPages || loadingGenres} onClick={() => setPage(currentPage + 1)}>Próxima <ChevronRight size={16} /></button>
    </div>
    {selected && <div className="ge-detail">
      <div className="ge-header"><div><small>GÊNERO SELECIONADO</small><h2>{selected.name}</h2></div><button onClick={() => { setSelected(null); setArtists([]); setAlbums([]); setSelectedArtist(null); }}>Fechar</button></div>
      <p className="ge-caption">Artistas associados a essa tag no MusicBrainz. A classificação é colaborativa e pode ser incompleta.</p>
      {loadingArtists ? <p className="ge-caption">Buscando artistas...</p> : <div className="ge-tags">{artists.map(a => <button key={a.id} className={selectedArtist === a.name ? "active" : ""} onClick={() => { if (onOpenArtist) onOpenArtist({ name: a.name }); else setSelectedArtist(a.name); }} title={`Artista MusicBrainz: ${a.id}`}>{a.name}{artists.filter(x => x.name === a.name).length > 1 && <small style={{ opacity: .58, marginLeft: 5 }}>#{a.id.slice(0, 6)}</small>}</button>)}{!artists.length && <p className="ge-caption">Não foram encontrados artistas vinculados a este gênero.</p>}</div>}
      {artistCount > ARTIST_PAGE_SIZE && <div className="ge-pagination"><button disabled={artistOffset === 0} onClick={() => { setSelectedArtist(null); setAlbums([]); setArtistOffset(Math.max(0, artistOffset - ARTIST_PAGE_SIZE)); }}>Artistas anteriores</button><span>{artistOffset + 1}–{Math.min(artistOffset + ARTIST_PAGE_SIZE, artistCount)} de {artistCount}</span><button disabled={artistOffset + ARTIST_PAGE_SIZE >= artistCount} onClick={() => { setSelectedArtist(null); setAlbums([]); setArtistOffset(artistOffset + ARTIST_PAGE_SIZE); }}>Mais artistas</button></div>}
      {selectedArtist && <div className="ge-albums"><h3>Lançamentos de {selectedArtist}</h3>{loadingAlbums && <p className="ge-caption">Consultando YouTube Music...</p>}{!loadingAlbums && albums.length === 0 && <p className="ge-caption">Nenhum lançamento confirmado para este artista nesta pesquisa.</p>}<div className="ge-grid">{albums.map(album => <article key={album.id} className="ge-album"><Artwork album={album} /><div className="ge-album-name"><div><strong><button className="dv-plain-link" onClick={() => onOpenAlbum?.(album)}>{album.title}</button></strong><p><button className="dv-plain-link" onClick={() => onOpenArtist?.({ name: album.artist })}>{album.artist}</button> · {album.year || "Ano desconhecido"}</p></div><button title="Favoritar" onClick={() => toggleFavorite(album)} aria-label="Favoritar álbum"><Heart size={16} fill={favorites.includes(album.id) ? "currentColor" : "none"} /></button><button title="Adicionar à coleção" onClick={() => toggleCollection(album)} aria-label="Adicionar álbum à coleção">{collection.includes(album.id) ? <Check size={16} /> : <Plus size={16} />}</button></div><div className="ge-links"><button className="dv-action" onClick={() => onOpenAlbum?.(album)}><Play size={14} /> Abrir e ouvir</button></div></article>)}</div></div>}
    </div>}
  </section>;
}
