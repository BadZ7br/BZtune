import { useEffect, useMemo, useState } from "react";
import { ListPlus, Search, X } from "lucide-react";
import { usePlayer } from "./PlayerContext";
import type { PlayerTrack } from "./PlayerContext";

type Stored = { id: string; title: string; artist: string; coverUrl?: string | null; audioUrl?: string | null };
const API = "http://127.0.0.1:5000";
export default function QueuePicker() {
  const { addToQueue, tracks } = usePlayer();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Stored[]>([]);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    if (!open) return;
    const abort = new AbortController();
    void fetch(API + "/api/library/tracks", { signal: abort.signal, cache: "no-store" })
      .then(response => { if (!response.ok) throw Error("HTTP " + response.status); return response.json() as Promise<{ tracks?: Stored[] }>; })
      .then(data => { if (!abort.signal.aborted) { setItems(data.tracks ?? []); setError(""); } })
      .catch(() => { if (!abort.signal.aborted) setError("Não foi possível carregar a biblioteca offline."); });
    return () => abort.abort();
  }, [open]);
  const filtered = useMemo(() => items.filter(x => (x.title + " " + x.artist).toLocaleLowerCase().includes(query.toLocaleLowerCase())).slice(0, 80), [items, query]);
  function add(item: Stored) {
    const track: PlayerTrack = { videoId: item.id, title: item.title, artist: item.artist, audioUrl: API + "/api/library/tracks/" + encodeURIComponent(item.id) + "/audio", cover: item.coverUrl };
    addToQueue(track);
  }
  return <div className="bz-queue-picker">
    <button type="button" className="bz-queue-picker-open" aria-expanded={open} onClick={() => setOpen(v => !v)}>
      <ListPlus size={15} /> Adicionar músicas
    </button>
    {open && <div className="bz-queue-picker-panel">
      <div className="bz-queue-picker-top"><strong>Adicionar músicas da biblioteca</strong><button type="button" onClick={() => setOpen(false)} aria-label="Fechar seleção"><X size={16}/></button></div>
      <label className="bz-queue-picker-search"><Search size={15}/><input aria-label="Pesquisar na biblioteca para adicionar à fila" placeholder="Pesquisar por música ou artista" value={query} onChange={e => setQuery(e.target.value)}/></label>
      {error && <p role="status">{error}</p>}
      {!error && !items.length && <p>Importe músicas na Biblioteca para adicioná-las aqui.</p>}
      <div className="bz-queue-picker-results">
        {filtered.map(item => {
          const exists = tracks.some(t => t.videoId === item.id && (t.audioUrl || "").includes("/tracks/" + encodeURIComponent(item.id) + "/audio"));
          return <div className="bz-queue-picker-item" key={item.id}><span><strong>{item.title}</strong><small>{item.artist}</small></span>
            <button type="button" disabled={exists} onClick={() => add(item)} title={exists ? "Já está na fila" : "Adicionar à fila"}>{exists ? "Na fila" : <><ListPlus size={14}/> Adicionar</>}</button>
          </div>;
        })}
      </div>
    </div>}
  </div>;
}
