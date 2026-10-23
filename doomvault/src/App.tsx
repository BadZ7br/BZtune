import { normalizeAlbumName as normalize, uniqueAlbums } from "./utils/album-identity";
import RetainedArea from "./components/RetainedArea";
import { useFocusScope } from "./hooks/useFocusScope";
import AreaErrorBoundary from "./AreaErrorBoundary";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Disc3, Compass, LibraryBig, Heart,
  ArrowUpRight, Plus, Check, Menu, X,
  RefreshCw, Home, Play, Wrench, Settings,
} from "lucide-react";
import { readStorage, writeStorage } from "./services/storage";
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
import PlayerAlbumActions from "./player/PlayerAlbumActions";
import BZtuneVersionLabel from "./BZtuneVersionLabel";
import SettingsPage from "./settings/SettingsPage";
import StorageSaveNotice from "./StorageSaveNotice";
import PreferenceSaveNotice from "./settings/PreferenceSaveNotice";
import { AppearanceProvider, loadPreferences } from "./settings/AppearanceContext";
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
    const value: unknown = JSON.parse(readStorage(key) || "[]");
    return Array.isArray(value) ? [...new Set(value.filter((id): id is string => typeof id === "string"))] : [];
  } catch { return []; }
}
function readCatalog(): MusicAlbum[] {
  try {
    const value: unknown = JSON.parse(readStorage(CATALOG_KEY) || "[]");
    return Array.isArray(value)
      ? value.filter((a): a is MusicAlbum =>
        !!a && typeof a === "object" && typeof a.id === "string" &&
        typeof a.title === "string" && typeof a.artist === "string")
      : [];
  } catch { return []; }
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
    const desired = loadPreferences().startPage;
    if (desired !== "last") return AREA_HOME[desired];
    const value = readStorage("doomvault-last-tab");
    return value && ["home", "search", "recommendations", "categories", "collection", "favorites", "library", "playlists", "discovery", "stats", "maintenance", "system"].includes(value) ? value as Tab : "home";
  });
  useEffect(() => { writeStorage("doomvault-last-tab", tab); }, [tab]);
  const [artistPage, setArtistPage] = useState<{ name: string; id?: string | null; image?: string | null } | null>(null);
  const [albumPage, setAlbumPage] = useState<MusicAlbum | null>(null);
  const [sortBy, setSortBy] = useState<SortOrder>("default");
  const [mobileMenu, setMobileMenu] = useState(false);
  const sidebarRef = useRef<HTMLElement>(null);
  useFocusScope(sidebarRef, mobileMenu, { initialFocus: ".mobile-close", onEscape: () => setMobileMenu(false) });
  const [catalog, setCatalog] = useState<MusicAlbum[]>(readCatalog);
  const [results, setResults] = useState<MusicAlbum[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [favorites, setFavorites] = useState<string[]>(() => readIds(FAVORITES_KEY));
  const [collection, setCollection] = useState<string[]>(() => readIds(COLLECTION_KEY));
  const [notice, setNotice] = useState("");
  const [refresh, setRefresh] = useState(0);
  const activeArea = AREA_BY_TAB[tab];
  const contentVisible = !artistPage && !albumPage;


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
    const controller = new AbortController();
    setLoading(true); setError("");
    const ordered = artists.slice(refresh % artists.length)
      .concat(artists.slice(0, refresh % artists.length)).slice(0, 4);
    void Promise.allSettled(ordered.map((artist) => searchAlbums(artist, controller.signal)))
      .then((batches) => {
        if (cancelled) return;
        const failures = batches.filter(batch => batch.status === "rejected").length;
        if (failures === batches.length) {
          setError("Não foi possível carregar recomendações. Verifique a conexão e use Atualizar resultados para tentar novamente.");
          return;
        }
        if (failures) setError("Parte das recomendações não pôde ser carregada. Mostramos os resultados disponíveis; use Atualizar resultados para tentar novamente.");
        const albums = batches.flatMap((result, index) =>
          result.status === "fulfilled"
            ? result.value.results.filter((album) =>
              normalize(album.artist) === normalize(ordered[index])).slice(0, 12)
            : []);
        setResults(uniqueAlbums(albums));
      }).catch(() => {
        if (!cancelled) setError("Erro ao buscar recomendações.");
      }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; controller.abort(); };
  }, [tab, refresh, catalog, favorites, collection]);

  function toggleId(id: string, key: string, ids: string[], setter: (value: string[]) => void) {
    const next = ids.includes(id) ? ids.filter((item) => item !== id) : [...ids, id];
    setter(next);
    writeStorage(key, JSON.stringify(next));
  }
  function saveAlbum(album: MusicAlbum) {
    const merged = new Map(catalog.map((item) => [item.id, item]));
    merged.set(album.id, album);
    const next = [...merged.values()];
    writeStorage(CATALOG_KEY, JSON.stringify(next));
    setCatalog(next);
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
  function scrollToTop() { document.querySelector(".main-content")?.scrollTo({ top: 0 }); window.scrollTo({ top: 0 }); }
  function openArtist(artist: { name: string; id?: string | null; image?: string | null }) {
    setAlbumPage(null); setArtistPage(artist); setMobileMenu(false); scrollToTop();
  }
  function openAlbum(album: MusicAlbum) { setAlbumPage(album); setMobileMenu(false); scrollToTop(); }

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
      <aside ref={sidebarRef} role={mobileMenu ? "dialog" : undefined} aria-modal={mobileMenu || undefined} aria-label={mobileMenu ? "Menu principal" : undefined} tabIndex={-1} className={`sidebar ${mobileMenu ? "sidebar-open" : ""}`}>
        <div className="brand">
          <div className="brand-mark" role="img" aria-label="Logotipo BZtune"><span className="brand-monogram">BZ</span></div>
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
          <button type="button" data-bztune-system-nav className={`nav-item nav-item-primary ${activeArea === "system" ? "active" : ""}`}
            aria-current={activeArea === "system" ? "page" : undefined} onClick={() => navigate(AREA_HOME.system)}>
            <Settings size={20} /><span>Sistema</span>
          </button>
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-footer"><span className="status-dot" /> BZtune <BZtuneVersionLabel /></div>
        </div>
      </aside>
      {mobileMenu && <button data-focus-scope-keep tabIndex={-1} className="mobile-scrim" onClick={() => setMobileMenu(false)} aria-label="Fechar menu" />}
      <main className="main-content">
        <header className="topbar">
          <button className="mobile-menu-button icon-button" onClick={() => setMobileMenu(true)} aria-label="Abrir menu"><Menu size={21} /></button>
          <div className="breadcrumb"><span>ARQUIVO</span><span className="breadcrumb-slash">/</span><strong>{albumPage ? albumPage.title.toUpperCase() : artistPage ? artistPage.name.toUpperCase() : title[tab].toUpperCase()}</strong></div>
          <div className="topbar-right"><span className="topbar-caption">FEITO PARA OUVIR DIFERENTE</span><div className="avatar">BZ</div></div>
        </header>
        <PreferenceSaveNotice />
        <StorageSaveNotice />
        {/* Navegação preserva a pesquisa e os gêneros montados ao abrir outras páginas. */}
        {artistPage && <div style={{ display: albumPage ? "none" : "block" }}>
          <AreaErrorBoundary name="Artista" key={`${artistPage.id || ""}:${artistPage.name}`} onBack={() => setArtistPage(null)}><ArtistPage artist={artistPage} onBack={() => setArtistPage(null)}
            onOpenAlbum={openAlbum} favorites={favorites} collection={collection}
            toggleFavorite={toggleFavorite} toggleCollection={toggleCollection} /></AreaErrorBoundary>
        </div>}
        {albumPage && <AreaErrorBoundary name="Álbum" key={albumPage.id} onBack={() => setAlbumPage(null)}><AlbumPage album={albumPage} onBack={() => setAlbumPage(null)}
          onOpenArtist={openArtist} /></AreaErrorBoundary>}
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
          {tab === "home" && <AreaErrorBoundary name="Início"><HomePage savedAlbums={catalog.filter(a => collection.includes(a.id))}
            onOpenAlbum={openAlbum} onNavigate={navigate} /></AreaErrorBoundary>}
          {tab !== "home" && tab !== "library" && tab !== "playlists" && tab !== "discovery" && tab !== "stats" && tab !== "maintenance" && tab !== "system" && <section className="page-intro">
            <div className="eyebrow"><span className="eyebrow-line" /> ARQUIVO MUSICAL INDEPENDENTE</div>
            <div className="intro-row"><div><h1>{title[tab]}<span>.</span></h1><p className="intro-copy">{subtitle[tab]}</p></div>
              {tab !== "search" && tab !== "categories" && <div className="album-total"><strong>{tab === "collection" ? collection.length : tab === "favorites" ? favorites.length : visible.length}</strong><span>RESULTADOS</span></div>}
            </div>
          </section>}
          {/* Sempre montado: o script Tauri injeta o botão no slot uma única vez. */}
          <div style={{ display: tab === "system" ? "block" : "none" }} aria-hidden={tab !== "system"}>
            <SettingsPage onOpenBackup={() => navigate("maintenance")} onOpenDownloads={() => navigate("library")}
              updater={<div id="bztune-desktop-update-slot" className="sidebar-updates-slot" />} />
          </div>
          <RetainedArea active={tab === "search" && contentVisible}>
            <AreaErrorBoundary name="Pesquisa"><UniversalSearch active={tab === "search" && contentVisible} favorites={favorites} collection={collection} toggleFavorite={toggleFavorite} toggleCollection={toggleCollection}
              onOpenArtist={openArtist} onOpenAlbum={openAlbum} /></AreaErrorBoundary>
          </RetainedArea>
          <RetainedArea active={tab === "categories" && contentVisible}>
            <AreaErrorBoundary name="Gêneros"><GenresExplorer active={tab === "categories" && contentVisible} favorites={favorites} collection={collection} toggleFavorite={toggleFavorite} toggleCollection={toggleCollection}
              onOpenAlbum={openAlbum} onOpenArtist={openArtist} /></AreaErrorBoundary>
          </RetainedArea>
          <RetainedArea active={tab === "discovery" && contentVisible}> <AreaErrorBoundary name="Descoberta"><DiscoveryPage active={tab === "discovery" && contentVisible} /></AreaErrorBoundary></RetainedArea>
          <RetainedArea active={tab === "stats" && contentVisible}> <AreaErrorBoundary name="Estatísticas"><ListeningStatsPage active={tab === "stats" && contentVisible} /></AreaErrorBoundary></RetainedArea>
          <RetainedArea active={tab === "maintenance" && contentVisible}> <AreaErrorBoundary name="Backup e diagnóstico"><DataToolsPage active={tab === "maintenance" && contentVisible} /></AreaErrorBoundary></RetainedArea>
          <RetainedArea active={tab === "library" && contentVisible}> <AreaErrorBoundary name="Biblioteca"><LocalLibrary active={tab === "library" && !albumPage && !artistPage} /></AreaErrorBoundary></RetainedArea>
          <RetainedArea active={tab === "playlists" && contentVisible}> <AreaErrorBoundary name="Playlists"><PlaylistsPage /></AreaErrorBoundary></RetainedArea>
          {tab === "recommendations" && <div className="dv-intro-line"><Compass size={17} /><span>Baseadas nos artistas dos álbuns salvos. Usa atualizar para mudar a seleção.</span></div>}
          {(tab === "recommendations" || tab === "collection" || tab === "favorites") && <AreaErrorBoundary name="Catálogo"><section className="catalog-section dv-catalog">
            <div className="section-heading"><div><div className="eyebrow small-eyebrow">{tab === "recommendations" ? "CATÁLOGO ONLINE" : "TUA BIBLIOTECA"}</div><h2>{heading[tab]}</h2></div>
              <div className="dv-heading-actions"><span className="results-count">{loading ? "CONSULTANDO..." : `${String(visible.length).padStart(2, "0")} RESULTADOS`}</span>
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
            </article>)}</div> : !loading && !error && <div className="empty-state"><div className="empty-icon"><LibraryBig size={27} /></div><h3>Nada por aqui ainda.</h3>
              <p>{tab === "collection" ? "Guarda álbuns usando o botão +." : tab === "favorites" ? "Marca um álbum com o coração." : "Guarda discos na coleção para gerar recomendações."}</p>
              {tab !== "recommendations" && <button className="text-link" onClick={() => navigate("search")}>Pesquisar álbuns <ArrowUpRight size={16} /></button>}</div>}
          </section></AreaErrorBoundary>}
        </div>
        <footer className="page-footer"><div><Disc3 size={17} /><span>BZtune</span><span className="footer-divider">/</span><span>UM ARQUIVO EM CONSTRUÇÃO</span></div><span>DESCOBRIR TAMBÉM É OUVIR.</span></footer>
        {notice && <div className="toast" role="status">{notice}</div>}
      </main>
      <AreaErrorBoundary name="Registro de reprodução"><ListeningTracker /></AreaErrorBoundary>
      <AreaErrorBoundary name="Player"><MusicPlayer albumActions={<PlayerAlbumActions albums={[...(albumPage ? [albumPage] : []), ...catalog, ...results]} favorites={favorites} collection={collection} onFavorite={toggleFavorite} onCollect={toggleCollection} />} /></AreaErrorBoundary>
    </div>
  );
}
export default function App() {
  return (
    <AppearanceProvider>
      <PlayerProvider>
        <BZtuneApp />
      </PlayerProvider>
    </AppearanceProvider>
  );
}
