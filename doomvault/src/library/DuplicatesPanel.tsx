import { useState } from "react";
import { AlertCircle, ChevronUp, CopyCheck, ListFilter, Play, RefreshCcw } from "lucide-react";
import { usePlayer } from "../player/PlayerContext";

const API = "http://127.0.0.1:5000";
type DuplicateKind = "identical" | "possible" | "versions";
type DuplicateTrack = {
  id: string; title: string; artist: string; album: string;
  year: number | null; trackNumber: number | null; filename: string;
  bytes: number; mime: string; coverUrl: string; audioUrl: string;
  signals: string[];
};
type DuplicateGroup = { id: string; kind: DuplicateKind; confidence: string; reason: string; tracks: DuplicateTrack[] };
type DuplicateReport = { count: number; summary: Record<DuplicateKind, number>; groups: DuplicateGroup[]; warning: string };
type Filter = "all" | DuplicateKind;
const filters: { value: Filter; label: string }[] = [
  { value: "all", label: "Todos" },
  { value: "identical", label: "Idênticos" },
  { value: "possible", label: "Possíveis repetidos" },
  { value: "versions", label: "Versões diferentes" },
];
const labelForKind: Record<DuplicateKind, string> = {
  identical: "Hash idêntico", possible: "Revisar", versions: "Outra edição",
};

export default function DuplicatesPanel() {
  const { playTrack } = usePlayer();
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const [report, setReport] = useState<DuplicateReport | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function analyze() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`${API}/api/library/duplicates`, { cache: "no-store" });
      if (!response.ok) throw new Error(`API respondeu ${response.status}. Reinicia o Flask após instalar.`);
      const data = await response.json() as DuplicateReport;
      if (!data || !Array.isArray(data.groups)) throw new Error("Resposta inesperada da API.");
      setReport(data);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível analisar a biblioteca.");
    } finally {
      setBusy(false);
    }
  }

  function toggle() {
    if (!open && !report) void analyze();
    setOpen(previous => !previous);
  }

  const visible = report?.groups.filter(group => filter === "all" || group.kind === filter) ?? [];
  return <section className="ll-dupes" aria-label="Detector de duplicatas">
    <div className="ll-dupes-heading">
      <div>
        <h3><CopyCheck size={19} aria-hidden="true" /> Detector de duplicatas</h3>
        <p>Identifica possíveis repetições sem apagar ou alterar nenhuma música.</p>
      </div>
      <div className="ll-dupes-buttons">
        {open && <button type="button" disabled={busy} onClick={() => void analyze()}><RefreshCcw size={15} /> {busy ? "Analisando..." : "Analisar novamente"}</button>}
        <button type="button" aria-expanded={open} onClick={toggle}>
          {open ? <ChevronUp size={16} /> : <ListFilter size={16} />} {open ? "Recolher análise" : "Analisar duplicatas"}
        </button>
      </div>
    </div>
    {open && <div className="ll-dupes-body">
      {busy && <p role="status" className="ll-dupes-note">Comparando hashes, nomes e informações de lançamentos...</p>}
      {error && <p className="ll-error" role="alert">{error}</p>}
      {report && <>
        <p className="ll-dupes-note"><AlertCircle size={15} /> {report.warning}</p>
        <div className="ll-dupes-filters" aria-label="Filtrar resultados">
          {filters.map(item => <button type="button" key={item.value} aria-pressed={filter === item.value}
            className={filter === item.value ? "active" : ""} onClick={() => setFilter(item.value)}>
            {item.label} <span>{item.value === "all" ? report.groups.length : report.summary[item.value]}</span>
          </button>)}
        </div>
        {!visible.length && <p className="ll-dupes-empty" role="status">Nenhuma ocorrência neste filtro.</p>}
        <div className="ll-dupes-results">
          {visible.map(group => <article className="ll-dupes-group" key={group.id}>
            <header className="ll-dupes-group-header"><span className={`ll-dupes-status ll-dupes-status-${group.kind}`}>{labelForKind[group.kind]}</span>
              <strong>{group.tracks[0]?.artist} — {group.tracks[0]?.title}</strong>
              <span>{group.tracks.length} arquivos</span></header>
            <p className="ll-dupes-reason">{group.reason}</p>
            <div className="ll-dupes-tracks">
              {group.tracks.map(track => <div className="ll-dupes-track" key={track.id}>
                <div className="ll-dupes-track-meta"><strong>{track.title}</strong>
                  <span>{track.artist}{track.album ? ` · ${track.album}` : ""}{track.year ? ` · ${track.year}` : ""}</span>
                  <small title={track.filename}>{track.filename} · {(track.bytes / 1048576).toFixed(1)} MB{track.signals.length ? ` · ${track.signals.join(", ")}` : ""}</small>
                </div>
                <button type="button" title={`Reproduzir ${track.title}`} aria-label={`Reproduzir ${track.title}`} onClick={() => playTrack({
                  videoId: `library:${track.id}`, title: track.title, artist: track.artist,
                  album: track.album || undefined,
                  audioUrl: `${API}${track.audioUrl}`, cover: `${API}${track.coverUrl}`,
                })}><Play size={16} /></button>
              </div>)}
            </div>
          </article>)}
        </div>
      </>}
    </div>}
  </section>;
}
