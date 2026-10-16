import { useEffect, useMemo, useState } from "react";
import {
    Disc3, Search, Compass, LibraryBig, Heart, ExternalLink,
    Headphones, ArrowUpRight, SlidersHorizontal, Plus, Check,
    Music2, Menu, X,
} from "lucide-react";
import { albums, genres, moods, type Album } from "./data";
import { findAlbumCover } from "./coverArt";
import { searchAlbums, type MusicAlbum } from "./api";

type Tab = "discover" | "albums" | "collection" | "favorites";

const API_CATALOG_KEY = "doomvault-api-albums";

// Identifica o mesmo disco mesmo que as fontes usem IDs diferentes.
function normalizeText(value: string): string {
    return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        .toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function albumKey(album: Pick<Album, "title" | "artist">): string {
    return `${normalizeText(album.artist)}|${normalizeText(album.title)}`;
}

function editDistance(a: string, b: string): number {
    const previous = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
        let diagonal = previous[0];
        previous[0] = i;
        for (let j = 1; j <= b.length; j++) {
            const old = previous[j];
            previous[j] = Math.min(previous[j] + 1, previous[j - 1] + 1, diagonal + Number(a[i - 1] !== b[j - 1]));
            diagonal = old;
        }
    }
    return previous[b.length];
}

function textMatches(album: Album, query: string): boolean {
    const q = normalizeText(query);
    if (!q) return true;
    const text = normalizeText(`${album.artist} ${album.title} ${album.genre} ${album.mood}`);
    if (text.includes(q)) return true;
    const terms = text.split(" ").filter(Boolean);
    return q.split(" ").filter(Boolean).every((word) => {
        const tolerance = word.length >= 6 ? 2 : word.length >= 4 ? 1 : 0;
        return terms.some((term) => term.includes(word) ||
            (Math.abs(term.length - word.length) <= tolerance && editDistance(term, word) <= tolerance));
    });
}


function readApiCatalog(): MusicAlbum[] {
    try {
        const value: unknown = JSON.parse(localStorage.getItem(API_CATALOG_KEY) || "[]");
        return Array.isArray(value)
            ? value.filter((item): item is MusicAlbum =>
                typeof item === "object" && item !== null &&
                typeof item.id === "string" && typeof item.title === "string")
            : [];
    } catch {
        return [];
    }
}

function toArchiveAlbum(item: MusicAlbum): Album {
    return {
        id: item.id,
        title: item.title,
        artist: item.artist || "Artista desconhecido",
        year: Number(item.year) || 0,
        genre: "YouTube Music",
        mood: "Não classificado",
        description: "Álbum encontrado no catálogo do YouTube Music.",
        cover: "cover-grey",
        coverUrl: item.cover || undefined,
        accent: "#444444",
    };
}


const readSaved = (key: string): string[] => {
    try {
        const value = localStorage.getItem(key);
        return value ? (JSON.parse(value) as string[]) : [];
    } catch {
        return [];
    }
};

function App() {
    const [tab, setTab] = useState<Tab>("discover");
    const [query, setQuery] = useState("");
    const [genre, setGenre] = useState("Todos os gêneros");
    const [mood, setMood] = useState("Todos os climas");
    const [sortBy, setSortBy] = useState("default");
    const [favorites, setFavorites] = useState<string[]>(() => readSaved("doomvault-favorites"));
    const [collection, setCollection] = useState<string[]>(() => readSaved("doomvault-collection"));
    const [mobileMenu, setMobileMenu] = useState(false);
    const [notice, setNotice] = useState("");
    const [coverUrls, setCoverUrls] = useState<Record<string, string>>({});
    const [brokenCovers, setBrokenCovers] = useState<string[]>([]);
    const [apiCatalog, setApiCatalog] = useState<MusicAlbum[]>(readApiCatalog);
    const [apiResults, setApiResults] = useState<MusicAlbum[]>([]);
    const [apiLoading, setApiLoading] = useState(false);
    const [apiError, setApiError] = useState("");

    // Busca no YouTube Music apenas quando a pesquisa é alterada.
    useEffect(() => {
        if (tab === "collection" || tab === "favorites" || !query.trim()) {
            setApiResults([]);
            setApiLoading(false);
            setApiError("");
            return;
        }

        let cancelled = false;
        setApiLoading(true);
        setApiError("");

        const timeout = window.setTimeout(async () => {
            try {
                const response = await searchAlbums(query.trim());
                if (cancelled) return;
                const found = response.results.filter((album) => Boolean(album.id));
                setApiResults(found);
                setApiCatalog((previous) => {
                    const merged = new Map(previous.map((item) => [item.id, item]));
                    for (const album of found) merged.set(album.id, album);
                    const updated = [...merged.values()];
                    try {
                        localStorage.setItem(API_CATALOG_KEY, JSON.stringify(updated));
                    } catch {
                        // O catálogo ainda funciona sem persistência.
                    }
                    return updated;
                });
            } catch {
                if (!cancelled) setApiError("A API está indisponível. Exibindo álbuns já salvos.");
            } finally {
                if (!cancelled) setApiLoading(false);
            }
        }, 450);

        return () => {
            cancelled = true;
            window.clearTimeout(timeout);
        };
    }, [query, tab]);

    useEffect(() => {
        let cancelled = false;

        async function loadCovers() {
            const results = await Promise.all(
                albums.map(async (album) => {
                    if (album.coverUrl) {
                        return [album.id, album.coverUrl] as const;
                    }

                    const url = await findAlbumCover(album);

                    return url ? ([album.id, url] as const) : null;
                }),
            );

            if (cancelled) return;

            const foundCovers = Object.fromEntries(
                results.filter((item) => item !== null),
            );

            setCoverUrls(foundCovers);
        }

        void loadCovers();

        return () => {
            cancelled = true;
        };
    }, []);

    const saveFavorites = (next: string[]) => {
        setFavorites(next);
        localStorage.setItem("doomvault-favorites", JSON.stringify(next));
    };

    const saveCollection = (next: string[]) => {
        setCollection(next);
        localStorage.setItem("doomvault-collection", JSON.stringify(next));
    };

    // Os favoritos antigos continuam associados ao disco, mesmo quando seu ID
    // salvo veio do YouTube Music e o cartão exibido é o da curadoria.
    const albumGroups = useMemo(() => {
        const groups = new Map<string, Album[]>();
        for (const album of [...albums, ...apiCatalog.map(toArchiveAlbum), ...apiResults.map(toArchiveAlbum)]) {
            const key = albumKey(album);
            groups.set(key, [...(groups.get(key) ?? []), album]);
        }
        return groups;
    }, [apiCatalog, apiResults]);

    const archiveAlbums = useMemo(() => {
        const output: Album[] = [];
        for (const group of albumGroups.values()) {
            // Quando o disco está na curadoria, preserva descrição, gênero e capa originais.
            const curated = group.find((item) => albums.some((original) => original.id === item.id));
            output.push(curated ?? group[0]);
        }
        return output;
    }, [albumGroups]);

    const relatedIds = (album: Album): string[] =>
        (albumGroups.get(albumKey(album)) ?? [album]).map((item) => item.id);

    const isAlbumFavorite = (album: Album): boolean =>
        relatedIds(album).some((id) => favorites.includes(id));

    const isAlbumSaved = (album: Album): boolean =>
        relatedIds(album).some((id) => collection.includes(id));

    const toggleAlbumFavorite = (album: Album) => {
        const ids = relatedIds(album);
        const active = ids.some((id) => favorites.includes(id));
        saveFavorites(active
            ? favorites.filter((id) => !ids.includes(id))
            : [...favorites, album.id]);
    };

    const toggleAlbumCollection = (album: Album) => {
        const ids = relatedIds(album);
        const active = ids.some((id) => collection.includes(id));
        saveCollection(active
            ? collection.filter((id) => !ids.includes(id))
            : [...collection, album.id]);
        setNotice(active ? "Álbum removido da sua coleção." : "Álbum adicionado à sua coleção.");
        window.setTimeout(() => setNotice(""), 2200);
    };

    const filteredAlbums = useMemo(() => {
        const hasQuery = Boolean(query.trim());
        const candidates = !hasQuery && tab === "discover" ? albums : archiveAlbums;
        const results = candidates.filter((album) => {
            if (!textMatches(album, query)) return false;
            if (genre !== "Todos os gêneros" && album.genre !== genre) return false;
            if (mood !== "Todos os climas" && album.mood !== mood) return false;
            const ids = (albumGroups.get(albumKey(album)) ?? [album]).map((item) => item.id);
            if (tab === "collection" && !ids.some((id) => collection.includes(id))) return false;
            if (tab === "favorites" && !ids.some((id) => favorites.includes(id))) return false;
            return true;
        });
        if (sortBy === "title") results.sort((a, b) => a.title.localeCompare(b.title));
        if (sortBy === "artist") results.sort((a, b) => a.artist.localeCompare(b.artist));
        if (sortBy === "year") results.sort((a, b) => b.year - a.year);
        return results;
    }, [archiveAlbums, albumGroups, query, genre, mood, tab, collection, favorites, sortBy]);

    const navigate = (next: Tab) => {
        setTab(next);
        setMobileMenu(false);
    };

    const openMusicSearch = (album: Album, service: "spotify" | "youtube") => {
        const searchText = encodeURIComponent(`${album.artist} ${album.title}`);
        const url = service === "spotify"
            ? `https://open.spotify.com/search/${searchText}`
            : `https://www.youtube.com/results?search_query=${searchText}`;
        window.open(url, "_blank", "noopener,noreferrer");
    };

    const activeTitle = tab === "discover" ? "Descobrir música"
        : tab === "albums" ? "Explorar álbuns"
            : tab === "favorites" ? "Favoritos" : "Minha coleção";

    return (
        <div className="app-shell">
            <aside className={`sidebar ${mobileMenu ? "sidebar-open" : ""}`}>
                <div className="brand">
                    <div className="brand-mark"><Disc3 size={24} strokeWidth={1.8} /></div>
                    <div><span className="brand-name">DOOMVAULT</span><span className="brand-subtitle">MUSIC ARCHIVE</span></div>
                    <button className="mobile-close icon-button" onClick={() => setMobileMenu(false)} aria-label="Fechar menu"><X size={19} /></button>
                </div>

                <div className="side-label">BIBLIOTECA</div>
                <nav className="nav-list" aria-label="Navegação principal">
                    <button className={`nav-item ${tab === "discover" ? "active" : ""}`} onClick={() => navigate("discover")}><Compass size={18} /><span>Descobrir</span><ArrowUpRight className="nav-trailing" size={15} /></button>
                    <button className={`nav-item ${tab === "albums" ? "active" : ""}`} onClick={() => navigate("albums")}><Disc3 size={18} /><span>Álbuns</span></button>
                    <button className={`nav-item ${tab === "collection" ? "active" : ""}`} onClick={() => navigate("collection")}><LibraryBig size={18} /><span>Minha coleção</span><span className="nav-count">{collection.length}</span></button>
                    <button
                        className={`nav-item ${tab === "favorites" ? "active" : ""}`}
                        onClick={() => navigate("favorites")}
                    >
                        <Heart size={18} />
                        <span>Favoritos</span>
                        <span className="nav-count">{favorites.length}</span>
                    </button>
                </nav>

                <div className="sidebar-bottom">
                    <div className="sidebar-note">
                        <div className="note-icon"><Headphones size={18} /></div>
                        <p>Encontre o próximo som que vai morar na tua cabeça.</p>
                    </div>
                    <div className="sidebar-footer"><span className="status-dot" /> DOOMVAULT <span>v0.1</span></div>
                </div>
            </aside>

            {mobileMenu && <button className="mobile-scrim" aria-label="Fechar menu" onClick={() => setMobileMenu(false)} />}

            <main className="main-content">
                <header className="topbar">
                    <button className="mobile-menu-button icon-button" onClick={() => setMobileMenu(true)} aria-label="Abrir menu"><Menu size={21} /></button>
                    <div className="breadcrumb"><span>ARQUIVO</span><span className="breadcrumb-slash">/</span><strong>{tab === "discover"
                        ? "DESCOBRIR"
                        : tab === "albums"
                            ? "ÁLBUNS"
                            : tab === "favorites"
                                ? "FAVORITOS"
                                : "COLEÇÃO"}</strong></div>
                    <div className="topbar-right"><span className="topbar-caption">FEITO PARA OUVIR DIFERENTE</span><div className="avatar">DV</div></div>
                </header>

                <section className="page-intro">
                    <div className="eyebrow"><span className="eyebrow-line" /> ARQUIVO MUSICAL INDEPENDENTE</div>
                    <div className="intro-row">
                        <div>
                            <h1>{activeTitle}<span>.</span></h1>
                            <p className="intro-copy">{tab === "discover" ? "Explore sons pesados, atmosferas densas e bandas fora do óbvio." : tab === "albums" ? "Uma pequena biblioteca para começar tua próxima jornada sonora." : "Os álbuns que tu decidiu guardar por perto."}</p>
                        </div>
                        <div className="album-total"><strong>{tab === "collection" ? collection.length : tab === "favorites" ? favorites.length : archiveAlbums.length}</strong><span>{tab === "collection" ? "SALVOS" : "ÁLBUNS NO ARQUIVO"}</span></div>
                    </div>
                </section>

                {tab === "discover" && (
                    <section className="featured">
                        <div className="featured-art cover cover-feature">
                            <span className="art-kicker">DOOMVAULT SELECTS / 001</span>
                            <div className="feature-art-center"><Disc3 size={68} strokeWidth={0.8} /><span>HEAVY<br />OBSCURA</span></div>
                            <span className="art-bottom">SLOW · LOUD · HYPNOTIC</span>
                        </div>
                        <div className="featured-info">
                            <div className="featured-label"><span className="status-dot" /> SELEÇÃO DA SEMANA</div>
                            <h2>Entre o peso<br />e a psicodelia.</h2>
                            <p>Uma rota por riffs lentos, fuzz analógico e melodias que parecem vir de outro tempo.</p>
                            <button className="text-link" onClick={() => { setQuery("doom"); setTab("albums"); }}><span>Explorar seleção</span><ArrowUpRight size={17} /></button>
                            <div className="feature-index"><span>01</span><span className="index-rule" /><span>06</span></div>
                        </div>
                    </section>
                )}

                <section className="catalog-section">
                    <div className="section-heading">
                        <div><div className="eyebrow small-eyebrow">{tab === "collection" ? "TUA COLEÇÃO" : tab === "favorites" ? "TEUS FAVORITOS" : "CURADORIA DO ARQUIVO"}</div><h2>{tab === "collection" ? "Guardados" : tab === "favorites" ? "Favoritos" : tab === "albums" ? "Todos os álbuns" : "Pontos de partida"}</h2></div>
                        <span className="results-count">{filteredAlbums.length.toString().padStart(2, "0")} RESULTADOS</span>
                    </div>

                    <div className="filters">
                        <label className="search-box"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar banda, álbum ou clima..." aria-label="Buscar banda, álbum ou clima" />{query && <button className="clear-search" onClick={() => setQuery("")} aria-label="Limpar busca"><X size={14} /></button>}</label>
                        <label className="select-wrap"><SlidersHorizontal size={15} /><select value={genre} onChange={(event) => setGenre(event.target.value)} aria-label="Filtrar por gênero">{[...genres, "YouTube Music"].map((item) => <option key={item}>{item}</option>)}</select></label>
                        <label className="select-wrap mood-select"><select value={mood} onChange={(event) => setMood(event.target.value)} aria-label="Filtrar por clima">{moods.map((item) => <option key={item}>{item}</option>)}</select></label>
                        <label className="select-wrap">
                            <select
                                value={sortBy}
                                onChange={(event) => setSortBy(event.target.value)}
                                aria-label="Ordenar álbuns"
                            >
                                <option value="default">Ordem padrão</option>
                                <option value="title">Nome do álbum</option>
                                <option value="artist">Nome do artista</option>
                                <option value="year">Ano de lançamento</option>
                            </select>
                        </label>
                    </div>

                    {apiLoading && <p role="status" className="api-status">Pesquisando álbuns no YouTube Music...</p>}
                    {apiError && <p role="status" className="api-status">{apiError}</p>}

                    {filteredAlbums.length > 0 ? (
                        <div className="album-grid">
                            {filteredAlbums.map((album, index) => (
                                <article className="album-card" key={album.id} style={{ animationDelay: `${index * 45}ms` }}>
                                    <div className={`album-art ${album.cover} ${(coverUrls[album.id] || album.coverUrl) && !brokenCovers.includes(album.id)
                                        ? "has-real-cover" : ""
                                        }`}>
                                        {(coverUrls[album.id] || album.coverUrl) && !brokenCovers.includes(album.id) && (
                                            <img
                                                className="album-art-image"
                                                src={coverUrls[album.id] || album.coverUrl}
                                                alt={`Capa de ${album.title}`}
                                                loading="lazy"
                                                onError={() => setBrokenCovers((current) => [...new Set([...current, album.id])])}
                                            />
                                        )}
                                        <span className="art-label">{album.artist.toUpperCase()}</span>
                                        <span className="art-symbol"><Disc3 size={52} strokeWidth={0.8} /></span>
                                        <span className="art-title">{album.title}</span>
                                        <span className="art-year">{album.year}</span>
                                        <button className={`favorite-button ${isAlbumFavorite(album) ? "is-favorite" : ""}`} onClick={() => toggleAlbumFavorite(album)} aria-label={isAlbumFavorite(album) ? "Remover dos favoritos" : "Adicionar aos favoritos"}><Heart size={17} fill={isAlbumFavorite(album) ? "currentColor" : "none"} /></button>
                                    </div>
                                    <div className="album-meta">
                                        <div className="album-heading"><div><h3>{album.title}</h3><p>{album.artist}</p></div><button className={`add-button ${isAlbumSaved(album) ? "added" : ""}`} onClick={() => toggleAlbumCollection(album)} aria-label={isAlbumSaved(album) ? "Remover da coleção" : "Adicionar à coleção"}>{isAlbumSaved(album) ? <Check size={17} /> : <Plus size={17} />}</button></div>
                                        <div className="album-tags"><span>{album.genre}</span><span>{album.year}</span></div>
                                        <p className="album-description">{album.description}</p>
                                        <div className="album-actions"><button onClick={() => openMusicSearch(album, "spotify")}><span className="spotify-dot" /> Spotify <ExternalLink size={13} /></button><button onClick={() => openMusicSearch(album, "youtube")}><Music2 size={14} /> YouTube <ExternalLink size={13} /></button></div>
                                    </div>
                                </article>
                            ))}
                        </div>
                    ) : (
                        <div className="empty-state"><div className="empty-icon"><LibraryBig size={27} /></div><h3>Nada por aqui ainda.</h3><p>{tab === "collection" ? "Adiciona álbuns à tua coleção usando o botão +." : tab === "favorites" ? "Marca um álbum com o coração para encontrá-lo aqui." : "Tenta outra busca ou muda os filtros."}</p><button className="text-link" onClick={() => { setQuery(""); setGenre("Todos os gêneros"); setMood("Todos os climas"); if (tab === "collection" || tab === "favorites") setTab("discover"); }}>Voltar ao arquivo <ArrowUpRight size={16} /></button></div>
                    )}
                </section>

                <footer className="page-footer"><div><Disc3 size={17} /><span>DOOMVAULT</span><span className="footer-divider">/</span><span>UM ARQUIVO EM CONSTRUÇÃO</span></div><span>DESCOBRIR TAMBÉM É OUVIR.</span></footer>
                {notice && <div className="toast" role="status">{notice}</div>}
            </main>
        </div>
    );
}

export default App;