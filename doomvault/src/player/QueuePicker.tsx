import { withRequestDeadline } from "../services/request-deadline";
import { contracts, readResponse } from "../services/response-contracts";
import { useEffect, useMemo, useState } from "react";
import { ListPlus, Search, X } from "lucide-react";
import { usePlayer } from "./PlayerContext";
import type { PlayerTrack } from "./PlayerContext";

type StoredTrack = {
  id: string;
  title: string;
  artist: string;
  album?: string | null;
  coverUrl?: string | null;
  audioUrl: string;
};

const API = "http://127.0.0.1:5000";
function normalize(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");
}

export default function QueuePicker() {
  const { addToQueue, tracks } = usePlayer();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<StoredTrack[]>([]);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    setLoading(true);
    setError("");
    void withRequestDeadline(async signal => {
        const response = await fetch(API + "/api/library/tracks", { signal, cache: "no-store" });
        if (!response.ok) throw Error("Biblioteca indisponível");
        return readResponse<{ tracks: StoredTrack[] }>(await response.json(), contracts.tracks, "músicas da biblioteca");
      }, controller.signal)
      .then(data => {
        if (!controller.signal.aborted) setItems(Array.isArray(data.tracks) ? data.tracks : []);
      })
      .catch(() => {
        if (!controller.signal.aborted) setError("Não foi possível consultar a biblioteca offline.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [open, revision]);

  const filtered = useMemo(() => items.filter(item =>
    normalize(item.title + " " + item.artist).includes(normalize(query.trim()))
  ).slice(0, 80), [items, query]);

  function enqueue(item: StoredTrack) {
    if (!item.audioUrl || !item.id) return;
    // Mesmos IDs e URLs da Biblioteca: evita criar faixas incompatíveis.
    const track: PlayerTrack = {
      videoId: `library:${item.id}`,
      title: item.title,
      artist: item.artist,
      album: item.album ?? undefined,
      audioUrl: `${API}${item.audioUrl}`,
      cover: item.coverUrl ? `${API}${item.coverUrl}` : null,
    };
    addToQueue(track);
  }

  return <section className="bz-queue-picker" aria-label="Adicionar músicas à fila">
    <button className="bz-queue-picker-open" type="button" aria-expanded={open}
      onClick={() => setOpen(value => !value)}>
      <ListPlus size={15} /> Adicionar músicas da biblioteca
    </button>
    {open && <div className="bz-queue-picker-panel">
      <div className="bz-queue-picker-top">
        <strong>Adicionar à fila</strong>
        <button type="button" aria-label="Fechar seleção" onClick={() => setOpen(false)}><X size={16}/></button>
      </div>
      <label className="bz-queue-picker-search">
        <Search size={15}/>
        <input type="search" value={query} onChange={event => setQuery(event.target.value)}
          placeholder="Buscar música ou artista" aria-label="Pesquisar na biblioteca para adicionar à fila" />
      </label>
      {loading && <p role="status">Carregando músicas...</p>}
      {error && <div><p role="alert">{error}</p><button type="button" onClick={() => setRevision(value => value + 1)}>Tentar carregar biblioteca novamente</button></div>}
      {!loading && !error && items.length === 0 && <p>Não há músicas offline na biblioteca.</p>}
      {!loading && !error && items.length > 0 && filtered.length === 0 &&
        <p>Nenhuma música encontrada para essa pesquisa.</p>}
      {!loading && !error && <div className="bz-queue-picker-results">
        {filtered.map(item => {
          const exists = tracks.some(track => track.videoId === `library:${item.id}`);
          return <div className="bz-queue-picker-item" key={item.id}>
            <span><strong>{item.title}</strong><small>{item.artist}</small></span>
            <button type="button" disabled={exists || !item.audioUrl}
              onClick={() => enqueue(item)} aria-label={`Adicionar ${item.title} à fila`}>
              {exists ? "Na fila" : <><ListPlus size={14}/> Adicionar</>}
            </button>
          </div>;
        })}
      </div>}
      <p className="bz-queue-picker-hint">Para adicionar músicas online, use Explorar → Pesquisa.</p>
    </div>}
  </section>;
}
