import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Upload, Play, ListPlus, Trash2, RefreshCw, HardDrive, Disc3, ImagePlus, Search, FolderPlus, Pencil, RotateCcw, LayoutGrid, Users, ListMusic, ChevronDown, ChevronUp } from "lucide-react";
import { usePlayer } from "../player/PlayerContext";
import type { PlayerTrack } from "../player/PlayerContext";
import DownloadsManager from "./DownloadsManager";

const API = "http://127.0.0.1:5000";
type StoredTrack = {
  id: string; title: string; artist: string; filename: string;
  bytes: number; mime: string; audioUrl: string; coverUrl?: string | null;
  album?: string | null; albumId?: string | null;
  year?: number | null; trackNumber?: number | null;
};
type LocalAlbum = { id: string; title: string; artist: string; count: number; coverUrl: string; hasCover: boolean };
type IdentifyStatus = {
  running: boolean; done: number; total: number; assigned: number;
  ambiguous: number; foundCovers: number; error: string; finished: boolean
};
type CoverTarget = { type: "album"; id: string } | { type: "track"; id: string };
type MetadataForm = { title: string; artist: string; album: string; year: string; trackNumber: string };
function formForTrack(track: StoredTrack): MetadataForm {
  return { title: track.title, artist: track.artist, album: track.album || "",
    year: track.year?.toString() || "", trackNumber: track.trackNumber?.toString() || "" };
}
type LibraryView = "albums" | "artists" | "tracks";
type LibrarySort = "artist" | "title" | "count";
const sorter = new Intl.Collator("pt-BR", { numeric: true, sensitivity: "base" });
function normalizeSearch(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR").trim();
}

function playerTrack(track: StoredTrack, version = 0): PlayerTrack {
  return {
    videoId: `library:${track.id}`, title: track.title, artist: track.artist,
    album: track.album || undefined,
    audioUrl: `${API}${track.audioUrl}`,
    cover: track.coverUrl ? `${API}${track.coverUrl}?v=${version}` : null,
  };
}

function TrackArtwork({ track, version }: { track: StoredTrack; version: number }) {
  const [broken, setBroken] = useState(false);
  useEffect(() => setBroken(false), [track.id, track.albumId, version]);
  const url = track.coverUrl ? `${API}${track.coverUrl}?v=${version}` : null;
  return <div className="ll-art-v12">{url && !broken
    ? <img alt={`Capa de ${track.album || track.title}`} src={url} loading="lazy" onError={() => setBroken(true)} />
    : <Disc3 size={22} />}</div>;
}

function AlbumArtwork({ album, version }: { album: LocalAlbum; version: number }) {
  const [broken, setBroken] = useState(false);
  useEffect(() => setBroken(false), [album.id, album.hasCover, version]);
  return <div className="ll-album-art">{album.hasCover && !broken
    ? <img src={`${API}${album.coverUrl}?v=${version}`} alt={`Capa de ${album.title}`} onError={() => setBroken(true)} />
    : <Disc3 size={34} />}</div>;
}

export default function LocalLibrary() {
  const { playTrack, addToQueue } = usePlayer();
  const input = useRef<HTMLInputElement>(null);
  const coverInput = useRef<HTMLInputElement>(null);
  const coverTarget = useRef<CoverTarget | null>(null);
  const identifyInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const [tracks, setTracks] = useState<StoredTrack[]>([]);
  const [albums, setAlbums] = useState<LocalAlbum[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [destination, setDestination] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [artVersion, setArtVersion] = useState(0);
  const [repairing, setRepairing] = useState(false);
  const [identifying, setIdentifying] = useState(false);
  const [identifyProgress, setIdentifyProgress] = useState<IdentifyStatus | null>(null);
  const [uploadingCover, setUploadingCover] = useState(false);
  const [editing, setEditing] = useState<StoredTrack | null>(null);
  const [metaForm, setMetaForm] = useState<MetadataForm>({title: "", artist: "", album: "", year: "", trackNumber: ""});
  const [metaBusy, setMetaBusy] = useState(false);
  const [metaError, setMetaError] = useState("");
  const [metaSuccess, setMetaSuccess] = useState("");
  const [canUndo, setCanUndo] = useState(false);
  const [editingAlbum, setEditingAlbum] = useState<LocalAlbum | null>(null);
  const [albumDraft, setAlbumDraft] = useState("");
  const [albumUndo, setAlbumUndo] = useState(false);
  const [albumMetaBusy, setAlbumMetaBusy] = useState(false);
  const [albumMetaError, setAlbumMetaError] = useState("");

  const [view,setView] = useState<LibraryView>(() => {
    try {
      const stored = localStorage.getItem("bztune-library-view");
      return stored === "artists" || stored === "tracks" ? stored : "albums";
    } catch { return "albums"; }
  });
  const [query,setQuery] = useState(() => {
    try { return localStorage.getItem("bztune-library-query") || ""; } catch { return ""; }
  });
  const [sort,setSort] = useState<LibrarySort>(() => {
    try {
      const saved = localStorage.getItem("bztune-library-sort");
      return saved === "title" || saved === "count" ? saved : "artist";
    } catch { return "artist"; }
  });
  const [collapsedAlbums,setCollapsedAlbums] = useState<string[]>([]);
  const [collapsedArtists,setCollapsedArtists] = useState<string[]>([]);
  useEffect(() => {
    try {
      localStorage.setItem("bztune-library-view", view);
      localStorage.setItem("bztune-library-query", query);
      localStorage.setItem("bztune-library-sort", sort);
    } catch { /* armazenamento bloqueado */ }
  }, [view,query,sort]);

  const load = useCallback(async () => {
    try {
      const [tracksResponse, albumsResponse] = await Promise.all([
        fetch(`${API}/api/library/tracks`), fetch(`${API}/api/library/albums`),
      ]);
      if (!tracksResponse.ok || !albumsResponse.ok) throw new Error("API da biblioteca indisponível.");
      const tracksResult: { tracks: StoredTrack[] } = await tracksResponse.json();
      const albumsResult: { albums: LocalAlbum[] } = await albumsResponse.json();
      setTracks(tracksResult.tracks);
      setAlbums(albumsResult.albums);
      setSelected(previous => previous.filter(id => tracksResult.tracks.some(t => t.id === id)));
      setError("");
    } catch {
      setError("Não foi possível carregar a biblioteca ou os álbuns. Confere se o Flask v1.2.2 está ligado.");
    }
  }, []);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => () => {
    if (identifyInterval.current) clearInterval(identifyInterval.current);
  }, []);

  const selectedTracks = useMemo(() => tracks.filter(track => selected.includes(track.id)), [tracks, selected]);
  const ungrouped = useMemo(() => tracks.filter(t => !t.albumId), [tracks]);
  const byAlbum = useMemo(() => {
    const groups: Record<string, StoredTrack[]> = {};
    for (const track of tracks) if (track.albumId) (groups[track.albumId] ||= []).push(track);
    return groups;
  }, [tracks]);

  const albumById = useMemo(() => new Map(albums.map(album => [album.id, album])), [albums]);
  const matchesTrack = useCallback((track: StoredTrack, search: string) => {
    if (!search) return true;
    const album = track.albumId ? albumById.get(track.albumId) : undefined;
    return normalizeSearch([track.title, track.artist, track.album, album?.title, track.filename]
      .filter(Boolean).join(" ")).includes(search);
  }, [albumById]);
  const filteredTracks = useMemo(() => {
    const q = normalizeSearch(query);
    return tracks.filter(track => matchesTrack(track, q));
  }, [tracks, query, matchesTrack]);
  const visibleTrackSet = useMemo(() => new Set(filteredTracks.map(t=>t.id)), [filteredTracks]);
  const visibleAlbums = useMemo(() => {
    const q = normalizeSearch(query);
    return albums.filter(a => {
      const members = byAlbum[a.id] || [];
      return members.length > 0 &&
        (!q || normalizeSearch(`${a.title} ${a.artist}`).includes(q) ||
          members.some(t=>visibleTrackSet.has(t.id)));
    }).sort((a,b) => {
      if (sort === "count") return b.count - a.count || sorter.compare(a.title,b.title);
      if (sort === "title") return sorter.compare(a.title,b.title) || sorter.compare(a.artist,b.artist);
      return sorter.compare(a.artist,b.artist) || sorter.compare(a.title,b.title);
    });
  }, [albums, byAlbum, query, sort, visibleTrackSet]);
  const displayedAlbumTracks = useCallback((album:LocalAlbum) => {
    const songs = byAlbum[album.id] || [];
    const q = normalizeSearch(query);
    return (!q || normalizeSearch(`${album.title} ${album.artist}`).includes(q))
      ? songs : songs.filter(t=>visibleTrackSet.has(t.id));
  }, [byAlbum, query, visibleTrackSet]);
  const visibleUngrouped = useMemo(() => ungrouped.filter(t=>visibleTrackSet.has(t.id)), [ungrouped,visibleTrackSet]);
  const sortedTracks = useMemo(() => [...filteredTracks].sort((a,b) => {
    if (sort === "artist") return sorter.compare(a.artist,b.artist) || sorter.compare(a.title,b.title);
    if (sort === "count") return sorter.compare(a.album || "",b.album || "") || sorter.compare(a.title,b.title);
    return sorter.compare(a.title,b.title);
  }), [filteredTracks,sort]);
  const artists = useMemo(() => {
    const byName = new Map<string, { key:string; name:string; tracks:StoredTrack[] }>();
    for(const t of filteredTracks) {
      const key = normalizeSearch(t.artist);
      if(!byName.has(key)) byName.set(key,{key,name:t.artist,tracks:[]});
      byName.get(key)!.tracks.push(t);
    }
    return [...byName.values()].sort((a,b) => sort === "count"
      ? b.tracks.length-a.tracks.length || sorter.compare(a.name,b.name)
      : sorter.compare(a.name,b.name));
  }, [filteredTracks,sort]);
  const artistCount = useMemo(() => new Set(tracks.map(t=>normalizeSearch(t.artist))).size, [tracks]);
  const toggleAlbumCollapse = (id:string) => setCollapsedAlbums(prev=>prev.includes(id)?prev.filter(x=>x!==id):[...prev,id]);
  const toggleArtistCollapse = (id:string) => setCollapsedArtists(prev=>prev.includes(id)?prev.filter(x=>x!==id):[...prev,id]);

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true); setError(""); setNotice("");
    let imported = 0, duplicates = 0, failures = 0;
    for (const file of Array.from(files)) {
      if (!/\.(mp3|flac)$/i.test(file.name)) { failures++; continue; }
      const form = new FormData(); form.append("file", file);
      try {
        const response = await fetch(`${API}/api/library/import`, { method: "POST", body: form });
        const data: { duplicate?: boolean; error?: string } = await response.json();
        if (!response.ok) { failures++; setError(data.error || "Falha ao importar arquivo."); }
        else if (data.duplicate) duplicates++;
        else imported++;
      } catch { failures++; setError("Conexão perdida durante a importação."); }
    }
    await load(); setBusy(false);
    setNotice(`${imported} importado(s), ${duplicates} repetido(s), ${failures} erro(s).`);
  }

  function toggleTrack(id: string) {
    setSelected(prev => prev.includes(id) ? prev.filter(value => value !== id) : [...prev, id]);
  }

  async function assignToAlbum(albumId: string, ids = selected) {
    if (!albumId || !ids.length) return;
    setBusy(true); setError("");
    try {
      const response = await fetch(`${API}/api/library/albums/${encodeURIComponent(albumId)}/tracks`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ track_ids: ids }),
      });
      const result: { assigned?: number; ignored?: number; error?: string } = await response.json();
      if (!response.ok) throw new Error(result.error || "Não foi possível vincular as músicas.");
      setNotice(`${result.assigned || 0} faixa(s) vinculada(s) ao álbum. ${result.ignored || 0} ignorada(s) por artista diferente.`);
      setSelected([]); setDestination(""); await load(); setArtVersion(v => v + 1);
    } catch (err) { setError(err instanceof Error ? err.message : "Falha ao associar álbum."); }
    finally { setBusy(false); }
  }

  async function createAlbum() {
    if (!selectedTracks.length) return;
    const artist = selectedTracks[0].artist;
    if (selectedTracks.some(track => track.artist.trim().toLowerCase() !== artist.trim().toLowerCase())) {
      setError("Seleciona apenas músicas de um mesmo artista para criar o álbum."); return;
    }
    const title = window.prompt(`Nome do álbum de ${artist}:`);
    if (!title?.trim()) return;
    setBusy(true); setError("");
    try {
      const response = await fetch(`${API}/api/library/albums`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ artist, title: title.trim() }),
      });
      const result: { id?: string; error?: string } = await response.json();
      if (!response.ok || !result.id) throw new Error(result.error || "Não foi possível criar o álbum.");
      await assignToAlbum(result.id);
    } catch (err) { setError(err instanceof Error ? err.message : "Falha ao criar álbum."); }
    finally { setBusy(false); }
  }

  function chooseCover(target: CoverTarget) { coverTarget.current = target; coverInput.current?.click(); }

  async function uploadArtwork(files: FileList | null) {
    const target = coverTarget.current; coverTarget.current = null;
    if (!target || !files?.length) return;
    const file = files[0];
    if (file.size > 4 * 1024 * 1024 || !/\.(jpg|jpeg|png|webp)$/i.test(file.name)) {
      setError("A imagem precisa ser JPG, PNG ou WebP, com até 4 MB."); return;
    }
    setUploadingCover(true); setError("");
    try {
      const endpoint = target.type === "album"
        ? `/api/library/albums/${encodeURIComponent(target.id)}/cover-upload`
        : `/api/library/tracks/${encodeURIComponent(target.id)}/cover-upload`;
      const form = new FormData(); form.append("file", file);
      const response = await fetch(`${API}${endpoint}`, { method: "POST", body: form });
      const result: { saved?: boolean; error?: string } = await response.json();
      if (!response.ok || !result.saved) throw new Error(result.error || "Falha ao salvar capa.");
      setArtVersion(v => v + 1); setNotice("Capa salva! Todas as faixas deste álbum mostrarão a mesma imagem.");
      await load();
    } catch (err) { setError(err instanceof Error ? err.message : "Falha ao salvar capa."); }
    finally { setUploadingCover(false); }
  }

  async function searchAlbumCover(album: LocalAlbum) {
    setBusy(true); setError(""); setNotice(`Procurando capa de ${album.title}...`);
    try {
      const response = await fetch(`${API}/api/library/albums/${encodeURIComponent(album.id)}/cover-search`, { method: "POST" });
      const result: { found?: boolean; error?: string } = await response.json();
      if (!response.ok) throw new Error(result.error || "Falha ao procurar capa.");
      setNotice(result.found ? `Capa do álbum ${album.title} encontrada!` : `Nenhuma capa confiável para ${album.title}. Usa o botão Escolher capa.`);
      setArtVersion(v => v + 1); await load();
    } catch (err) { setError(err instanceof Error ? err.message : "Falha na busca."); }
    finally { setBusy(false); }
  }

  async function repairCovers() {
    if (repairing) return;
    setRepairing(true); setError("");
    const tasks = [
      ...albums.map(album => ({ id: album.id, endpoint: `/api/library/albums/${album.id}/cover-search` })),
      ...ungrouped.map(track => ({ id: track.id, endpoint: `/api/library/tracks/${track.id}/refresh-cover` })),
    ];
    let found = 0, missing = 0;
    try {
      for (const [index, task] of tasks.entries()) {
        const response = await fetch(`${API}${task.endpoint}`, { method: "POST" });
        const result: { found?: boolean } = response.ok ? await response.json() : { found: false };
        if (result.found) found++; else missing++;
        setNotice(`Recuperando capas por álbum: ${index + 1}/${tasks.length}...`);
      }
      setArtVersion(v => v + 1); await load();
      setNotice(`${found} capas disponíveis, ${missing} sem correspondência. Álbuns compartilham uma única imagem.`);
    } catch { setError("Não foi possível terminar a recuperação de capas."); }
    finally { setRepairing(false); }
  }

  async function startIdentify() {
    setError(""); setNotice("Identificando lançamentos do catálogo. Isso pode demorar...");
    try {
      const response = await fetch(`${API}/api/library/albums/identify`, { method: "POST" });
      if (!response.ok) throw new Error("O backend não iniciou a identificação.");
      setIdentifying(true);
      if (identifyInterval.current) clearInterval(identifyInterval.current);
      identifyInterval.current = setInterval(async () => {
        try {
          const reply = await fetch(`${API}/api/library/albums/identify/status`);
          const data: { status: IdentifyStatus } = await reply.json();
          setIdentifyProgress(data.status);
          if (!data.status.running) {
            if (identifyInterval.current) clearInterval(identifyInterval.current);
            identifyInterval.current = null;
            setIdentifying(false);
            await load(); setArtVersion(v => v + 1);
            setNotice(data.status.error ? `Erro: ${data.status.error}` :
              `${data.status.assigned} música(s) identificada(s), ${data.status.foundCovers} capa(s) de álbum encontrada(s). ${data.status.ambiguous} correspondência(s) ambígua(s) para conferir manualmente.`);
          }
        } catch { setError("Não foi possível consultar o progresso da identificação."); }
      }, 1400);
    } catch (err) { setIdentifying(false); setError(err instanceof Error ? err.message : "Falha ao identificar álbuns."); }
  }

  async function remove(track: StoredTrack) {
    if (!window.confirm(`Excluir "${track.title}" da biblioteca?`)) return;
    try {
      const response = await fetch(`${API}/api/library/tracks/${encodeURIComponent(track.id)}`, { method: "DELETE" });
      if (!response.ok) throw new Error();
      await load();
    } catch { setError("Não foi possível excluir a faixa."); }
  }

  async function openMetadataEditor(track: StoredTrack) {
    setEditing(track); setMetaForm(formForTrack(track)); setMetaError(""); setMetaSuccess(""); setCanUndo(false);
    try {
      const response = await fetch(`${API}/api/library/tracks/${encodeURIComponent(track.id)}/metadata/history`);
      if (response.ok) {
        const data: {canUndo?: boolean} = await response.json();
        setCanUndo(Boolean(data.canUndo));
      }
    } catch { /* histórico indisponível, edição permanece disponível */ }
  }

  async function saveMetadata() {
    if (!editing || metaBusy) return;
    setMetaBusy(true); setMetaError(""); setMetaSuccess("");
    try {
      const response = await fetch(`${API}/api/library/tracks/${encodeURIComponent(editing.id)}/metadata`, {
        method: "PATCH", headers: {"Content-Type": "application/json"},
        body: JSON.stringify({
          title: metaForm.title.trim(), artist: metaForm.artist.trim(), album: metaForm.album.trim(),
          year: metaForm.year.trim() || null, trackNumber: metaForm.trackNumber.trim() || null,
        }),
      });
      const data: {error?: string; updated?: boolean; track?: StoredTrack; canUndo?: boolean} = await response.json();
      if (!response.ok) throw new Error(data.error || "Não foi possível salvar os metadados.");
      if (data.track) { setEditing(data.track); setMetaForm(formForTrack(data.track)); }
      setCanUndo(Boolean(data.canUndo));
      setMetaSuccess(data.updated ? "Alterações salvas! O áudio não foi modificado." : "Nenhuma alteração necessária.");
      setNotice(data.updated ? "Metadados atualizados. O arquivo de áudio não foi modificado." : "Nenhuma alteração necessária.");
      await load();
    } catch (error) {
      setMetaError(error instanceof Error ? error.message : "Erro ao editar metadados.");
    } finally { setMetaBusy(false); }
  }

  async function undoMetadata() {
    if (!editing || metaBusy) return;
    setMetaBusy(true); setMetaError(""); setMetaSuccess("");
    try {
      const response = await fetch(`${API}/api/library/tracks/${encodeURIComponent(editing.id)}/metadata/undo`, {method: "POST"});
      const data: {error?: string; track?: StoredTrack; canUndo?: boolean} = await response.json();
      if (!response.ok) throw new Error(data.error || "Não foi possível desfazer a edição.");
      if (data.track) { setEditing(data.track); setMetaForm(formForTrack(data.track)); }
      setCanUndo(Boolean(data.canUndo));
      setMetaSuccess("Edição anterior restaurada.");
      setNotice("Última edição de metadados desfeita.");
      await load();
    } catch (error) {
      setMetaError(error instanceof Error ? error.message : "Erro ao desfazer metadados.");
    } finally { setMetaBusy(false); }
  }

  async function openAlbumEditor(album: LocalAlbum) {
    setEditingAlbum(album); setAlbumDraft(album.title); setAlbumMetaError(""); setAlbumUndo(false);
    try {
      const response = await fetch(`${API}/api/library/albums/${encodeURIComponent(album.id)}/metadata/history`);
      if (response.ok) {
        const data: {canUndo?: boolean} = await response.json();
        setAlbumUndo(Boolean(data.canUndo));
      }
    } catch { /* edição não depende do histórico */ }
  }

  async function saveAlbumMetadata() {
    if (!editingAlbum || albumMetaBusy) return;
    setAlbumMetaBusy(true); setAlbumMetaError("");
    try {
      const response = await fetch(`${API}/api/library/albums/${encodeURIComponent(editingAlbum.id)}/metadata`, {
        method: "PATCH", headers: {"Content-Type":"application/json"}, body: JSON.stringify({title: albumDraft.trim()}),
      });
      const data: {error?: string; updated?: boolean; title?: string; canUndo?: boolean} = await response.json();
      if (!response.ok) throw new Error(data.error || "Falha ao renomear álbum.");
      setAlbumDraft(data.title || albumDraft);
      if (data.updated) setAlbumUndo(true);
      setNotice(data.updated ? "Nome do álbum atualizado para todas as faixas associadas, sem modificar os arquivos." : "O álbum já possui esse nome.");
      await load();
    } catch (error) {
      setAlbumMetaError(error instanceof Error ? error.message : "Erro ao editar álbum.");
    } finally {setAlbumMetaBusy(false);}
  }

  async function undoAlbumMetadata() {
    if (!editingAlbum || albumMetaBusy) return;
    setAlbumMetaBusy(true); setAlbumMetaError("");
    try {
      const response = await fetch(`${API}/api/library/albums/${encodeURIComponent(editingAlbum.id)}/metadata/undo`,{method:"POST"});
      const data: {error?: string; title?: string; canUndo?: boolean} = await response.json();
      if (!response.ok) throw new Error(data.error || "Falha ao desfazer.");
      setAlbumDraft(data.title || ""); setAlbumUndo(Boolean(data.canUndo));
      setNotice("Nome anterior do álbum restaurado."); await load();
    } catch(error) {setAlbumMetaError(error instanceof Error ? error.message : "Erro ao desfazer.");}
    finally {setAlbumMetaBusy(false);}
  }

  const renderTrack = (track: StoredTrack) => <div className="ll-track ll-album-track" key={track.id}>
    <input type="checkbox" aria-label={`Selecionar ${track.title}`} checked={selected.includes(track.id)} onChange={() => toggleTrack(track.id)} />
    <TrackArtwork track={track} version={artVersion} />
    <div className="ll-track-info"><strong>{track.title}</strong><span>{track.artist}{track.album ? ` · ${track.album}` : ""}{track.year ? ` · ${track.year}` : ""}{track.trackNumber ? ` · faixa ${track.trackNumber}` : ""} · {track.filename} · {(track.bytes / 1048576).toFixed(1)} MB</span></div>
    <button type="button" title="Editar metadados" aria-label={`Editar metadados de ${track.title}`} onClick={() => void openMetadataEditor(track)}><Pencil size={17} /></button>
    <button title={track.albumId ? "Alterar capa de todo o álbum" : "Escolher capa da música"} disabled={uploadingCover || repairing}
      onClick={() => chooseCover(track.albumId ? { type: "album", id: track.albumId } : { type: "track", id: track.id })}><ImagePlus size={17} /></button>
    <button title="Reproduzir" aria-label={`Reproduzir ${track.title}`}
      onClick={() => playTrack(playerTrack(track, artVersion), tracks.map(item => playerTrack(item, artVersion)))}><Play size={17} /></button>
    <button title="Adicionar à fila" aria-label={`Adicionar ${track.title} à fila`}
      onClick={() => addToQueue(playerTrack(track, artVersion))}><ListPlus size={18} /></button>
    <button title="Excluir música" aria-label={`Excluir ${track.title}`} onClick={() => void remove(track)}><Trash2 size={17} /></button>
  </div>;

  return <section className="ll-root">
    <div className="ll-header">
      <div><p className="ll-eyebrow">ARQUIVOS SALVOS NO COMPUTADOR</p><h2>Biblioteca offline<span>.</span></h2>
        <p>Álbuns com capas unificadas e músicas disponíveis mesmo sem internet.</p></div>
      <div className="ll-actions">
        <button type="button" onClick={() => void startIdentify()} disabled={identifying || busy || repairing} title="Identificar os álbuns pelo catálogo"><Search size={16} />{identifying ? " Identificando..." : " Identificar álbuns"}</button>
        <button type="button" onClick={() => void repairCovers()} disabled={repairing || busy || identifying} title="Recuperar uma capa por álbum"><Disc3 size={16} />{repairing ? " Recuperando..." : " Recuperar capas"}</button>
        <button type="button" title="Atualizar biblioteca" onClick={() => void load()}><RefreshCw size={16} /></button>
        <button type="button" className="ll-primary" disabled={busy} onClick={() => input.current?.click()}><Upload size={17} />{busy ? "Importando..." : "Importar MP3 / FLAC"}</button>
      </div>
    </div>
    <input ref={coverInput} type="file" accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp" hidden
      onChange={event => { void uploadArtwork(event.target.files); event.target.value = ""; }} />
    <input ref={input} type="file" multiple accept=".mp3,.flac,audio/mpeg,audio/flac" hidden
      onChange={event => { void upload(event.target.files); event.target.value = ""; }} />
    {identifying && identifyProgress && <p role="status" className="ll-notice">Analisando músicas: {identifyProgress.done}/{identifyProgress.total || "..."}. As correspondências incertas exigirão confirmação.</p>}
    {notice && <p role="status" className="ll-notice">{notice}</p>}
    {error && <p role="alert" className="ll-error">{error}</p>}
    <div className="ll-album-toolbar">
      <strong>{selected.length} música(s) selecionada(s)</strong>
      <select aria-label="Álbum de destino" value={destination} onChange={event => setDestination(event.target.value)} disabled={!selected.length}>
        <option value="">Escolher álbum existente...</option>
        {albums.map(album => <option key={album.id} value={album.id}>{album.artist} — {album.title}</option>)}
      </select>
      <button type="button" disabled={!selected.length || !destination || busy} onClick={() => void assignToAlbum(destination)}>Vincular ao álbum</button>
      <button type="button" disabled={!selected.length || busy} onClick={() => void createAlbum()}><FolderPlus size={15} /> Criar álbum com seleção</button>
      {selected.length > 0 && <button type="button" onClick={() => setSelected([])}>Limpar seleção</button>}
    </div>
    {!tracks.length && <div className="ll-empty"><HardDrive size={30} /><h3>Nenhuma música importada ainda.</h3></div>}
    <div className="ll-smart-toolbar" aria-label="Organização da biblioteca">
      <div className="ll-smart-stats" aria-label="Totais da biblioteca">
        <span><strong>{tracks.length}</strong> músicas</span>
        <span><strong>{albums.filter(a=>(byAlbum[a.id]||[]).length>0).length}</strong> álbuns</span>
        <span><strong>{artistCount}</strong> artistas</span>
      </div>
      <div className="ll-smart-controls">
        <div className="ll-smart-views" aria-label="Visualizar biblioteca">
          <button type="button" className={view==="albums"?"active":""} aria-pressed={view==="albums"} onClick={()=>setView("albums")}><LayoutGrid size={16}/> Álbuns</button>
          <button type="button" className={view==="artists"?"active":""} aria-pressed={view==="artists"} onClick={()=>setView("artists")}><Users size={16}/> Artistas</button>
          <button type="button" className={view==="tracks"?"active":""} aria-pressed={view==="tracks"} onClick={()=>setView("tracks")}><ListMusic size={16}/> Faixas</button>
        </div>
        <label className="ll-smart-search"><Search size={17}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Buscar música, artista ou álbum..." aria-label="Buscar na biblioteca"/></label>
        <label className="ll-smart-sort">Ordenar: <select value={sort} onChange={e=>setSort(e.target.value as LibrarySort)} aria-label="Ordenar biblioteca">
          <option value="artist">Artista</option><option value="title">Título</option><option value="count">Quantidade / Álbum</option>
        </select></label>
      </div>
    </div>
    {!!tracks.length && !filteredTracks.length && <div className="ll-empty" role="status">Nenhuma música encontrada. Tenta outro termo de busca.</div>}
    {view==="albums" && <div className="ll-album-groups">
      {visibleAlbums.map(album=><section className="ll-album-section" key={album.id}>
        <div className="ll-album-header">
          <AlbumArtwork album={album} version={artVersion}/>
          <div className="ll-album-title"><h3>{album.title}</h3><p>{album.artist} · {(byAlbum[album.id]||[]).length} música(s)</p></div>
          <div className="ll-album-buttons">
            <button type="button" disabled={busy} onClick={()=>void openAlbumEditor(album)} title="Editar nome deste álbum"><Pencil size={16}/> Editar álbum</button>
            <button type="button" disabled={busy||repairing} onClick={()=>void searchAlbumCover(album)}><Search size={16}/> Procurar capa</button>
            <button type="button" disabled={uploadingCover||repairing} onClick={()=>chooseCover({type:"album",id:album.id})}><ImagePlus size={16}/> Escolher capa</button>
            <button type="button" aria-expanded={!collapsedAlbums.includes(album.id)} onClick={()=>toggleAlbumCollapse(album.id)}>
              {collapsedAlbums.includes(album.id)?<ChevronDown size={16}/>:<ChevronUp size={16}/>} {collapsedAlbums.includes(album.id)?"Mostrar faixas":"Recolher"}</button>
          </div>
        </div>
        {!collapsedAlbums.includes(album.id) && <div className="ll-list">{displayedAlbumTracks(album).map(renderTrack)}</div>}
      </section>)}
      {visibleUngrouped.length>0&&<section className="ll-album-section">
        <div className="ll-album-header"><div className="ll-album-art"><Disc3 size={34}/></div>
          <div className="ll-album-title"><h3>Sem álbum identificado</h3>
            <p>Seleciona as músicas e cria ou escolhe um álbum. Não juntamos edições diferentes sem confirmação.</p></div></div>
        <div className="ll-list">{visibleUngrouped.map(renderTrack)}</div>
      </section>}
    </div>}
    {view==="artists" && <div className="ll-artist-groups">
      {artists.map(artist=><section className="ll-artist-section" key={artist.key}>
        <div className="ll-artist-header">
          <div><h3>{artist.name}</h3><p>{artist.tracks.length} música(s) · {new Set(artist.tracks.map(t=>t.albumId).filter(Boolean)).size} álbum(ns) vinculado(s)</p></div>
          <button type="button" onClick={()=>toggleArtistCollapse(artist.key)} aria-expanded={!collapsedArtists.includes(artist.key)}>
            {collapsedArtists.includes(artist.key)?<ChevronDown size={16}/>:<ChevronUp size={16}/>} {collapsedArtists.includes(artist.key)?"Mostrar músicas":"Recolher"}
          </button>
        </div>
        {!collapsedArtists.includes(artist.key) && <div className="ll-list">{artist.tracks.map(renderTrack)}</div>}
      </section>)}
    </div>}
    {view==="tracks" && <section className="ll-album-section ll-all-tracks"><div className="ll-album-header"><div className="ll-album-title"><h3>Todas as faixas</h3><p>{sortedTracks.length} música(s) na lista</p></div></div>
      <div className="ll-list">{sortedTracks.map(renderTrack)}</div>
    </section>}
    {editingAlbum && <div className="ll-meta-overlay" role="presentation" onMouseDown={event=>{if (event.target===event.currentTarget && !albumMetaBusy) setEditingAlbum(null);}}>
      <section className="ll-meta-dialog" role="dialog" aria-modal="true" aria-labelledby="ll-album-meta-title" onKeyDown={event=>{if(event.key==="Escape"&&!albumMetaBusy)setEditingAlbum(null);}}>
        <header className="ll-meta-header"><div><p className="ll-eyebrow">SMART LIBRARY · ÁLBUM</p><h3 id="ll-album-meta-title">Editar álbum</h3></div>
          <button type="button" aria-label="Fechar editor de álbum" disabled={albumMetaBusy} onClick={()=>setEditingAlbum(null)}>✕</button></header>
        <p className="ll-meta-file">{editingAlbum.artist} · {editingAlbum.count} faixa(s) · capa e ID preservados</p>
        <form onSubmit={event=>{event.preventDefault();void saveAlbumMetadata();}}>
          <label>Nome do álbum <input required maxLength={220} value={albumDraft} onChange={e=>setAlbumDraft(e.target.value)}/></label>
          <p className="ll-meta-hint">Esta alteração atualiza o nome para todas as músicas associadas ao álbum. Ela não move as faixas nem modifica os arquivos de áudio.</p>
          {albumMetaError && <p role="alert" className="ll-error">{albumMetaError}</p>}
          <div className="ll-meta-actions">
            <button type="button" disabled={!albumUndo||albumMetaBusy} onClick={()=>void undoAlbumMetadata()}><RotateCcw size={16}/> Desfazer nome</button>
            <button type="button" disabled={albumMetaBusy} onClick={()=>setEditingAlbum(null)}>Fechar</button>
            <button type="submit" className="ll-primary" disabled={albumMetaBusy||!albumDraft.trim()}>{albumMetaBusy?"Salvando...":"Salvar álbum"}</button>
          </div>
        </form>
      </section>
    </div>}
    {editing && <div className="ll-meta-overlay" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget && !metaBusy) setEditing(null); }}>
      <section className="ll-meta-dialog" role="dialog" aria-modal="true" aria-labelledby="ll-meta-title" onKeyDown={event => { if (event.key === "Escape" && !metaBusy) setEditing(null); }}>
        <header className="ll-meta-header">
          <div><p className="ll-eyebrow">SMART LIBRARY · V1.4.1</p><h3 id="ll-meta-title">Editar metadados</h3></div>
          <button type="button" aria-label="Fechar editor" disabled={metaBusy} onClick={() => setEditing(null)}>✕</button>
        </header>
        <p className="ll-meta-file" title={editing.filename}>{editing.filename}</p>
        <form onSubmit={event => { event.preventDefault(); void saveMetadata(); }}>
          <label>Título <input required maxLength={200} value={metaForm.title} onChange={e=>setMetaForm(v=>({...v,title:e.target.value}))} /></label>
          <label>Artista <input required maxLength={200} value={metaForm.artist} onChange={e=>setMetaForm(v=>({...v,artist:e.target.value}))} /></label>
          <label>Álbum <input maxLength={220} placeholder="Sem álbum" value={metaForm.album} onChange={e=>setMetaForm(v=>({...v,album:e.target.value}))} /></label>
          <div className="ll-meta-row">
            <label>Ano <input type="number" min="1800" max="2100" placeholder="—" value={metaForm.year} onChange={e=>setMetaForm(v=>({...v,year:e.target.value}))}/></label>
            <label>Nº da faixa <input type="number" min="1" max="999" placeholder="—" value={metaForm.trackNumber} onChange={e=>setMetaForm(v=>({...v,trackNumber:e.target.value}))}/></label>
          </div>
          <p className="ll-meta-hint">As mudanças ficam no SQLite. O MP3/FLAC e suas tags originais não serão regravados. Alterar o álbum desta faixa não renomeia os outros discos.</p>
          {metaError && <p role="alert" className="ll-error">{metaError}</p>}
          {metaSuccess && <p role="status" className="ll-meta-success">{metaSuccess}</p>}
          <div className="ll-meta-actions">
            <button type="button" disabled={metaBusy || !canUndo} title="Restaura a edição anterior" onClick={() => void undoMetadata()}><RotateCcw size={16}/> Desfazer última edição</button>
            <button type="button" disabled={metaBusy} onClick={()=>setEditing(null)}>Fechar</button>
            <button type="submit" className="ll-primary" disabled={metaBusy || !metaForm.title.trim() || !metaForm.artist.trim()}>{metaBusy ? "Salvando..." : "Salvar alterações"}</button>
          </div>
        </form>
      </section>
    </div>}
    <DownloadsManager onFinished={load} />
    <p className="ll-note">As capas compartilhadas ficam no computador; os MP3/FLAC permanecem intactos. Se uma faixa entrar no álbum errado, seleciona-a e escolhe o álbum correto.</p>
  </section>;
}
