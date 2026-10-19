import { useEffect, useMemo, useState } from "react";
import {
  Disc3, Compass, LibraryBig, Heart,
  Headphones, ArrowUpRight, Plus, Check, Menu, X,
  RefreshCw, Home, Play, ShieldCheck, Wrench, Settings, Info, ArrowRight,
} from "lucide-react";
import { searchAlbums, type MusicAlbum } from "./services/api";
import UniversalSearch from "./pages/UniversalSearch";
import GenresExplorer from "./pages/GenresExplorer";
import ArtistPage from "./pages/ArtistPage";
import AlbumPage from "./pages/AlbumPage";
import HomePage from "./pages/HomePage";
import LocalLibrary from "./library/LocalLibrary";
import PlaylistsPage from "./playlists/PlaylistsPage";
import CatalogDownloadButton from "./library/CatalogDownloadButton";
import AddToPlaylistButton from "./playlists/AddToPlaylistButton";
import { PlayerProvider } from "./player/PlayerContext";
import MusicPlayer from "./player/MusicPlayer";
import BZtuneVersionLabel from "./BZtuneVersionLabel";
import { DiscoveryPage, ListeningStatsPage, DataToolsPage, ListeningTracker } from "./features";

type Tab = "home" | "search" | "recommendations" | "categories" | "collection" | "favorites" | "library" | "playlists" | "discovery" | "stats" | "maintenance" | "system";
type Area = "home" | "explore" | "library" | "tools" | "system";

// Preserva todas as rotas antigas e as chaves do usuário. Só muda a navegação.
const AREA_BY_TAB: Record<Tab, Area> = {
  home: "home",
  search: "explore", recommendations: "explore", categories: "explore", discovery: "explore",
  library: "library", playlists: "library", collection: "library", favorites: "library",
  stats: "tools", maintenance: "tools",
  system: "system",
};
const AREA_HOME: Record<Area, Tab> = {
  home: "home", explore: "search", library: "library", tools: "stats", system: "system",
};
const AREA_LABEL: Record<Area, string> = {
  home: "Início", explore: "Explorar", library: "Biblioteca", tools: "Ferramentas", system: "Sistema",
};
const AREA_TABS: Partial<Record<Area, { tab: Tab; label: string }[]>> = {
  explore: [
    { tab: "search", label: "Pesquisa" }, { tab: "categories", label: "Gêneros" },
    { tab: "discovery", label: "Descoberta" }, { tab: "recommendations", label: "Recomendações" },
  ],
  library: [
    { tab: "library", label: "Músicas offline" }, { tab: "collection", label: "Coleção" },
    { tab: "favorites", label: "Favoritos" }, { tab: "playlists", label: "Playlists" },
  ],
  tools: [
    { tab: "stats", label: "Estatísticas" }, { tab: "maintenance", label: "Backup e diagnóstico" },
  ],
};

type SortOrder = "default" | "title" | "artist" | "year";

const CATALOG_KEY = "doomvault-api-albums";
const FAVORITES_KEY = "doomvault-favorites";
const COLLECTION_KEY = "doomvault-collection";

function readIds(key: string): string[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(key) || "[]");
    return Array.isArray(value) ? value.filter((id): id is string => typeof id === "string") : [];
  } catch { return []; }
}
function readCatalog(): MusicAlbum[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(CATALOG_KEY) || "[]");
    return Array.isArray(value)
      ? value.filter((a): a is MusicAlbum =>
        !!a && typeof a === "object" && typeof a.id === "string" &&
        typeof a.title === "string" && typeof a.artist === "string")
      : [];
  } catch { return []; }
}
function normalize(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}
function albumKey(album: MusicAlbum): string {
  return `${normalize(album.artist)}|${normalize(album.title)}`;
}
function uniqueAlbums(list: MusicAlbum[]): MusicAlbum[] {
  const used = new Set<string>();
  return list.filter((album) => {
    if (!album.id || !album.title) return false;
    const key = albumKey(album);
    if (used.has(key)) return false;
    used.add(key);
    return true;
  });
}
function sortAlbums(list: MusicAlbum[], order: SortOrder): MusicAlbum[] {
  const result = [...list];
  if (order === "title") result.sort((a, b) => a.title.localeCompare(b.title));
  if (order === "artist") result.sort((a, b) => a.artist.localeCompare(b.artist));
  if (order === "year") result.sort((a, b) => Number(b.year || 0) - Number(a.year || 0));
  return result;
}

function Cover({ album }: { album: MusicAlbum }) {
  const [failed, setFailed] = useState(false);
  const coverUrl = `http://127.0.0.1:5000/api/cover?${new URLSearchParams({
    url: album.cover ?? "", title: album.title, artist: album.artist,
  })}`;
  // Reseta a falha quando outro álbum ocupa o mesmo card.
  useEffect(() => setFailed(false), [album.id, album.cover]);
  return (
    <div className="dv-cover">
      {album.cover && !failed ? (
        <img src={coverUrl} alt={`Capa de ${album.title}`} loading="lazy" onError={() => setFailed(true)} />
      ) : (
        <div className="dv-cover-fallback"><Disc3 size={32} /><span>BZtune</span><strong>{album.title}</strong></div>
      )}
    </div>
  );
}

function BZtuneApp() {
  const [tab, setTab] = useState<Tab>(() => {
    const value = localStorage.getItem("doomvault-last-tab");
    return value && ["home", "search", "recommendations", "categories", "collection", "favorites", "library", "playlists", "discovery", "stats", "maintenance", "system"].includes(value) ? value as Tab : "home";
  });
  useEffect(() => { localStorage.setItem("doomvault-last-tab", tab) }, [tab]);
  const [artistPage, setArtistPage] = useState<{ name: string; id?: string | null; image?: string | null } | null>(null);
  const [albumPage, setAlbumPage] = useState<MusicAlbum | null>(null);
  const [sortBy, setSortBy] = useState<SortOrder>("default");
  const [mobileMenu, setMobileMenu] = useState(false);
  const [catalog, setCatalog] = useState<MusicAlbum[]>(readCatalog);
  const [results, setResults] = useState<MusicAlbum[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [favorites, setFavorites] = useState<string[]>(() => readIds(FAVORITES_KEY));
  const [collection, setCollection] = useState<string[]>(() => readIds(COLLECTION_KEY));
  const [notice, setNotice] = useState("");
  const [refresh, setRefresh] = useState(0);
  const activeArea = AREA_BY_TAB[tab];


  // Recomendações apenas a partir dos artistas que o usuário salvou.
  useEffect(() => {
    // Mantém os resultados na memória enquanto o usuário navega.
    if (tab !== "recommendations") return;
    const artists = [...new Set(catalog
      .filter((album) => favorites.includes(album.id) || collection.includes(album.id))
      .map((album) => album.artist).filter(Boolean))];
    if (artists.length === 0) {
      setResults([]); setLoading(false); setError("");
      return;
    }
    let cancelled = false;
    setLoading(true); setError("");
    const ordered = artists.slice(refresh % artists.length)
      .concat(artists.slice(0, refresh % artists.length)).slice(0, 4);
    void Promise.allSettled(ordered.map((artist) => searchAlbums(artist)))
      .then((batches) => {
        if (cancelled) return;
        const albums = batches.flatMap((result, index) =>
          result.status === "fulfilled"
            ? result.value.results.filter((album) =>
              normalize(album.artist) === normalize(ordered[index])).slice(0, 12)
            : []);
        setResults(uniqueAlbums(albums));
      }).catch(() => {
        if (!cancelled) setError("Erro ao buscar recomendações.");
      }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [tab, refresh, catalog, favorites, collection]);

  function toggleId(id: string, key: string, ids: string[], setter: (value: string[]) => void) {
    const next = ids.includes(id) ? ids.filter((item) => item !== id) : [...ids, id];
    setter(next);
    try { localStorage.setItem(key, JSON.stringify(next)); } catch { /* dados seguem na sessão */ }
  }
  function saveAlbum(album: MusicAlbum) {
    setCatalog((previous) => {
      const merged = new Map(previous.map((item) => [item.id, item]));
      merged.set(album.id, album);
      const next = [...merged.values()];
      try { localStorage.setItem(CATALOG_KEY, JSON.stringify(next)); } catch { /* opcional */ }
      return next;
    });
  }
  function toggleFavorite(album: MusicAlbum) {
    saveAlbum(album);
    toggleId(album.id, FAVORITES_KEY, favorites, setFavorites);
  }
  function toggleCollection(album: MusicAlbum) {
    saveAlbum(album);
    const exists = collection.includes(album.id);
    toggleId(album.id, COLLECTION_KEY, collection, setCollection);
    setNotice(exists ? "Removido da coleção" : "Adicionado à coleção");
    window.setTimeout(() => setNotice(""), 1800);
  }
  function navigate(next: Tab) {
    setArtistPage(null); setAlbumPage(null); setTab(next); setMobileMenu(false);
    if (next === "playlists") window.dispatchEvent(new Event("doomvault-playlists-updated"));
  }
  function openArtist(artist: { name: string; id?: string | null; image?: string | null }) {
    setAlbumPage(null); setArtistPage(artist); setMobileMenu(false);
  }
  function openAlbum(album: MusicAlbum) { setAlbumPage(album); setMobileMenu(false); }

  const visible = useMemo(() => {
    let list: MusicAlbum[];
    if (tab === "collection") list = catalog.filter((a) => collection.includes(a.id));
    else if (tab === "favorites") list = catalog.filter((a) => favorites.includes(a.id));
    else if (tab === "search" || tab === "categories" || tab === "home" || tab === "library" || tab === "playlists" || tab === "system") list = [];
    else list = results;
    return sortAlbums(uniqueAlbums(list), sortBy);
  }, [tab, catalog, favorites, collection, results, sortBy]);

  const title: Record<Tab, string> = {
    home: "Início", library: "Biblioteca offline", playlists: "Playlists", discovery: "Descoberta", stats: "Estatísticas", maintenance: "Backup e Diagnóstico",
    search: "Pesquisar música", recommendations: "Recomendações",
    categories: "Busca por Gênero", collection: "Minha coleção", favorites: "Favoritos", system: "Sistema",
  };
  const subtitle: Record<Tab, string> = {
    home: "Teu arquivo musical.", library: "Músicas salvas neste dispositivo.", playlists: "Playlists online e offline juntas.", discovery: "Novas músicas e artistas para explorar.", stats: "Teus hábitos de escuta locais.", maintenance: "Backups e diagnóstico do BZtune.",
    search: "Pesquisa bandas, álbuns, EPs, singles, splits e músicas no YouTube Music.",
    recommendations: "Descobre mais lançamentos dos artistas que guardaste ou favoritaste.",
    categories: "Pesquisa gêneros reais do MusicBrainz e descobre artistas e lançamentos.",
    collection: "Os discos que decidiste guardar.",
    favorites: "Os álbuns que ganharam um coração.", system: "Atualizações, configurações e informações do BZtune.",
  };
  const heading: Record<Tab, string> = {
    home: "Início", library: "Biblioteca offline", playlists: "Playlists", discovery: "Descoberta", stats: "Estatísticas", maintenance: "Backup",
    search: "Resultados da pesquisa", recommendations: "Para descobrir",
    categories: "Explorar gêneros", collection: "Álbuns guardados", favorites: "Teus favoritos", system: "Sistema",
  };

  return (
    <div className="app-shell dv-app">
      <aside className={`sidebar ${mobileMenu ? "sidebar-open" : ""}`}>
        <div className="brand">
          <div className="brand-mark" aria-label="Logotipo BZtune"><span className="brand-monogram">BZ</span></div>
          <div><span className="brand-name">BZtune</span><span className="brand-subtitle">MUSIC ARCHIVE</span></div>
          <button className="mobile-close icon-button" onClick={() => setMobileMenu(false)} aria-label="Fechar menu"><X size={19} /></button>
        </div>
        <nav className="nav-list nav-list-primary" aria-label="Navegação principal">
          <button type="button" className={`nav-item nav-item-primary ${activeArea === "home" ? "active" : ""}`}
            aria-current={activeArea === "home" ? "page" : undefined} onClick={() => navigate(AREA_HOME.home)}>
            <Home size={20} /><span>Início</span>
          </button>
          <button type="button" className={`nav-item nav-item-primary ${activeArea === "explore" ? "active" : ""}`}
            aria-current={activeArea === "explore" ? "page" : undefined} onClick={() => navigate(AREA_HOME.explore)}>
            <Compass size={20} /><span>Explorar</span>
          </button>
          <button type="button" className={`nav-item nav-item-primary ${activeArea === "library" ? "active" : ""}`}
            aria-current={activeArea === "library" ? "page" : undefined} onClick={() => navigate(AREA_HOME.library)}>
            <LibraryBig size={20} /><span>Biblioteca</span>
          </button>
          <button type="button" className={`nav-item nav-item-primary ${activeArea === "tools" ? "active" : ""}`}
            aria-current={activeArea === "tools" ? "page" : undefined} onClick={() => navigate(AREA_HOME.tools)}>
            <Wrench size={20} /><span>Ferramentas</span>
          </button>
          <button type="button" className={`nav-item nav-item-primary ${activeArea === "system" ? "active" : ""}`}
            aria-current={activeArea === "system" ? "page" : undefined} onClick={() => navigate(AREA_HOME.system)}>
            <Settings size={20} /><span>Sistema</span>
          </button>
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-note"><div className="note-icon"><Headphones size={18} /></div><p>Música conecta mundos.</p></div>
          <div className="sidebar-footer"><span className="status-dot" /> BZtune <BZtuneVersionLabel /></div>
        </div>
      </aside>
      {mobileMenu && <button className="mobile-scrim" onClick={() => setMobileMenu(false)} aria-label="Fechar menu" />}
      <main className="main-content">
        <header className="topbar">
          <button className="mobile-menu-button icon-button" onClick={() => setMobileMenu(true)} aria-label="Abrir menu"><Menu size={21} /></button>
          <div className="breadcrumb"><span>ARQUIVO</span><span className="breadcrumb-slash">/</span><strong>{albumPage ? albumPage.title.toUpperCase() : artistPage ? artistPage.name.toUpperCase() : title[tab].toUpperCase()}</strong></div>
          <div className="topbar-right"><span className="topbar-caption">FEITO PARA OUVIR DIFERENTE</span><div className="avatar">BZ</div></div>
        </header>
        {/* Navegação preserva a pesquisa e os gêneros montados ao abrir outras páginas. */}
        {artistPage && <div style={{ display: albumPage ? "none" : "block" }}>
          <ArtistPage artist={artistPage} onBack={() => setArtistPage(null)}
            onOpenAlbum={openAlbum} favorites={favorites} collection={collection}
            toggleFavorite={toggleFavorite} toggleCollection={toggleCollection} />
        </div>}
        {albumPage && <AlbumPage album={albumPage} onBack={() => setAlbumPage(null)}
          onOpenArtist={openArtist} />}
        <div style={{ display: artistPage || albumPage ? "none" : "block" }}>
          {AREA_TABS[activeArea] && (
            <nav className="bz-area-tabs" aria-label={`Abas de ${AREA_LABEL[activeArea]}`}>
              <span className="bz-area-tabs-title">{AREA_LABEL[activeArea]}</span>
              <div className="bz-area-tabs-items">
                {AREA_TABS[activeArea]?.map((option) => (
                  <button key={option.tab} type="button" className={`bz-area-tab ${tab === option.tab ? "active" : ""}`}
                    aria-current={tab === option.tab ? "page" : undefined} onClick={() => navigate(option.tab)}>
                    {option.label}
                    {option.tab === "favorites" && <span className="bz-area-counter">{favorites.length}</span>}
                    {option.tab === "collection" && <span className="bz-area-counter">{collection.length}</span>}
                  </button>
                ))}
              </div>
            </nav>
          )}
          {tab === "home" && <HomePage savedAlbums={catalog.filter(a => collection.includes(a.id))}
            onOpenAlbum={openAlbum} onNavigate={navigate} />}
          {tab !== "home" && tab !== "library" && tab !== "playlists" && tab !== "discovery" && tab !== "stats" && tab !== "maintenance" && tab !== "system" && <section className="page-intro">
            <div className="eyebrow"><span className="eyebrow-line" /> ARQUIVO MUSICAL INDEPENDENTE</div>
            <div className="intro-row"><div><h1>{title[tab]}<span>.</span></h1><p className="intro-copy">{subtitle[tab]}</p></div>
              {tab !== "search" && tab !== "categories" && <div className="album-total"><strong>{tab === "collection" ? collection.length : tab === "favorites" ? favorites.length : visible.length}</strong><span>RESULTADOS</span></div>}
            </div>
          </section>}
          {/* Sempre montado: o script Tauri injeta o botão no slot uma única vez. */}
          <div style={{ display: tab === "system" ? "block" : "none" }} aria-hidden={tab !== "system"}>
            <section className="bz-system-landing" aria-label="Sistema do BZtune">
              <div className="bz-system-header">
                <span className="eyebrow">BZtune / Sistema</span>
                <h1>Sistema<span>.</span></h1>
                <p>Atualizações e preferências do aplicativo em um só lugar.</p>
              </div>
              <div className="bz-system-grid">
                <article className="bz-system-card">
                  <div className="bz-system-card-icon"><Settings size={21} /></div>
                  <h2>Configurações</h2>
                  <p>Aparência, reprodução, downloads e preferências.</p>
                  <span className="bz-system-pending">Próxima etapa</span>
                </article>
                <article className="bz-system-card bz-system-update-card">
                  <div className="bz-system-card-icon"><RefreshCw size={21} /></div>
                  <h2>Atualizações</h2>
                  <p>Confira a versão instalada e procure novos pacotes assinados.</p>
                  <div id="bztune-desktop-update-slot" className="sidebar-updates-slot" />
                  <p className="bz-system-hint">As atualizações continuam sendo instaladas pelo próprio BZtune.</p>
                </article>
                <article className="bz-system-card">
                  <div className="bz-system-card-icon"><ShieldCheck size={21} /></div>
                  <h2>Backup e diagnóstico</h2>
                  <p>Ferramentas para manter sua biblioteca protegida.</p>
                  <button type="button" className="bz-system-action" onClick={() => navigate("maintenance")}>
                    Abrir ferramentas <ArrowRight size={16} />
                  </button>
                </article>
                <article className="bz-system-card">
                  <div className="bz-system-card-icon"><Info size={21} /></div>
                  <h2>Sobre o BZtune</h2>
                  <p>Arquivo musical independente para Windows.</p>
                  <span className="bz-system-pending">Versão: <BZtuneVersionLabel /></span>
                </article>
              </div>
            </section>
          </div>
          <div style={{ display: tab === "search" ? "block" : "none" }} aria-hidden={tab !== "search"}>
            <UniversalSearch favorites={favorites} collection={collection} toggleFavorite={toggleFavorite} toggleCollection={toggleCollection}
              onOpenArtist={openArtist} onOpenAlbum={openAlbum} />
          </div>
          <div style={{ display: tab === "categories" ? "block" : "none" }} aria-hidden={tab !== "categories"}>
            <GenresExplorer favorites={favorites} collection={collection} toggleFavorite={toggleFavorite} toggleCollection={toggleCollection}
              onOpenAlbum={openAlbum} onOpenArtist={openArtist} />
          </div>
          <div style={{ display: tab === "discovery" ? "block" : "none" }} aria-hidden={tab !== "discovery"}><DiscoveryPage /></div>
          <div style={{ display: tab === "stats" ? "block" : "none" }} aria-hidden={tab !== "stats"}><ListeningStatsPage /></div>
          <div style={{ display: tab === "maintenance" ? "block" : "none" }} aria-hidden={tab !== "maintenance"}><DataToolsPage /></div>
          <div style={{ display: tab === "library" ? "block" : "none" }} aria-hidden={tab !== "library"}><LocalLibrary /></div>
          <div style={{ display: tab === "playlists" ? "block" : "none" }} aria-hidden={tab !== "playlists"}><PlaylistsPage /></div>
          {tab === "recommendations" && <div className="dv-intro-line"><Compass size={17} /><span>Baseadas nos artistas dos álbuns salvos. Usa atualizar para mudar a seleção.</span></div>}
          {(tab === "recommendations" || tab === "collection" || tab === "favorites") && <section className="catalog-section dv-catalog">
            <div className="section-heading"><div><div className="eyebrow small-eyebrow">{tab === "recommendations" ? "CATÁLOGO ONLINE" : "TUA BIBLIOTECA"}</div><h2>{heading[tab]}</h2></div>
              <div className="dv-heading-actions"><span className="results-count">{String(visible.length).padStart(2, "0")} RESULTADOS</span>
                {tab === "recommendations" && <button className="dv-refresh" onClick={() => setRefresh(v => v + 1)} title="Atualizar resultados"><RefreshCw size={16} /></button>}
                <select value={sortBy} onChange={e => setSortBy(e.target.value as SortOrder)} aria-label="Ordenar"><option value="default">Ordem padrão</option><option value="title">Álbum A–Z</option><option value="artist">Artista A–Z</option><option value="year">Mais recentes</option></select>
              </div></div>
            {loading && <p className="dv-status" role="status">Consultando catálogo...</p>}
            {error && <p className="dv-status dv-error" role="alert">{error}</p>}
            {visible.length ? <div className="album-grid dv-grid">{visible.map(album => <article className="album-card dv-card" key={album.id}>
              <div className="dv-art-wrap"><button className="dv-art-click" onClick={() => openAlbum(album)} title={`Abrir ${album.title}`}><Cover album={album} /></button>
                <button className={`dv-heart ${favorites.includes(album.id) ? "on" : ""}`} onClick={() => toggleFavorite(album)} aria-label="Favoritar"><Heart size={17} fill={favorites.includes(album.id) ? "currentColor" : "none"} /></button></div>
              <div className="dv-meta"><div className="dv-title-row"><div><h3><button className="dv-plain-link" onClick={() => openAlbum(album)}>{album.title}</button></h3><p>{album.artist}</p></div>
                <button className="dv-add" onClick={() => toggleCollection(album)} aria-label="Adicionar à coleção">{collection.includes(album.id) ? <Check size={17} /> : <Plus size={17} />}</button></div>
                <span className="dv-year">{album.year || "Ano desconhecido"}</span>
                <div className="dv-links"><button onClick={() => openAlbum(album)}><Play size={14} /> Ouvir</button>
                  <CatalogDownloadButton artist={album.artist} title={album.title} kind="release" />
                  <AddToPlaylistButton artist={album.artist} title={album.title} kind="release" albumId={album.id} cover={album.cover} /></div>
              </div>
            </article>)}</div> : !loading && <div className="empty-state"><div className="empty-icon"><LibraryBig size={27} /></div><h3>Nada por aqui ainda.</h3>
              <p>{tab === "collection" ? "Guarda álbuns usando o botão +." : tab === "favorites" ? "Marca um álbum com o coração." : "Guarda discos na coleção para gerar recomendações."}</p>
              {tab !== "recommendations" && <button className="text-link" onClick={() => navigate("search")}>Pesquisar álbuns <ArrowUpRight size={16} /></button>}</div>}
          </section>}
        </div>
        <footer className="page-footer"><div><Disc3 size={17} /><span>BZtune</span><span className="footer-divider">/</span><span>UM ARQUIVO EM CONSTRUÇÃO</span></div><span>DESCOBRIR TAMBÉM É OUVIR.</span></footer>
        {notice && <div className="toast" role="status">{notice}</div>}
      </main>
      <ListeningTracker />
      <MusicPlayer />
    </div>
  );
}
export default function App() {
  return (
    <PlayerProvider>
      <BZtuneApp />
    </PlayerProvider>
  );
}
