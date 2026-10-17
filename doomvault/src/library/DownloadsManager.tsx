import { useCallback, useEffect, useRef, useState } from "react";
import { Download, RefreshCw, ShieldCheck } from "lucide-react";
const API = "http://127.0.0.1:5000";
type Job = {
  id: string; status: "pending" | "downloading" | "complete" | "error";
  filename: string; downloaded: number; total: number | null;
  error: string | null; duplicate: boolean;
};
export default function DownloadsManager({ onFinished }: { onFinished: () => void }) {
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [artist, setArtist] = useState("");
  const [authorized, setAuthorized] = useState(false);
  const [jobs, setJobs] = useState<Job[]>([]);
  const completedIds = useRef<Set<string> | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    try {
      const response = await fetch(`${API}/api/library/downloads`);
      if (!response.ok) return;
      const data = await response.json() as { jobs: Job[] };
      const nowCompleted = new Set(data.jobs.filter(j => j.status === "complete").map(j => j.id));
      if (completedIds.current && [...nowCompleted].some(id => !completedIds.current?.has(id))) onFinished();
      completedIds.current = nowCompleted;
      setJobs(data.jobs);
    } catch { /* O estado da conexão é apresentado ao enviar o link. */ }
  }, [onFinished]);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => { void refresh(); }, 1200);
    return () => window.clearInterval(timer);
  }, [refresh]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!authorized || busy) return;
    setBusy(true); setError("");
    try {
      const response = await fetch(`${API}/api/library/downloads`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, title, artist, authorized }),
      });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || "Falha ao criar download.");
      setUrl(""); setTitle(""); setArtist(""); setAuthorized(false);
      await refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Flask indisponível."); }
    finally { setBusy(false); }
  }

  return <section className="dl-root">
    <div className="dl-heading"><ShieldCheck size={19} /><div><h3>Downloads autorizados</h3><p>Adiciona uma URL HTTPS direta de MP3 ou FLAC cuja distribuição seja permitida.</p></div></div>
    <form className="dl-form" onSubmit={e => void submit(e)}>
      <label>URL do áudio<input type="url" required placeholder="https://archive.org/download/.../faixa.mp3" value={url} onChange={e => setUrl(e.target.value)} /></label>
      <div className="dl-fields"><label>Título (opcional)<input value={title} maxLength={200} onChange={e => setTitle(e.target.value)} placeholder="Nome da faixa" /></label><label>Artista (opcional)<input value={artist} maxLength={200} onChange={e => setArtist(e.target.value)} placeholder="Nome do artista" /></label></div>
      <label className="dl-permission"><input type="checkbox" checked={authorized} onChange={e => setAuthorized(e.target.checked)} /> Confirmo que tenho permissão para baixar e armazenar este arquivo.</label>
      <button type="submit" disabled={!authorized || busy}><Download size={16} />{busy ? "Verificando..." : "Adicionar download"}</button>
    </form>
    <p className="dl-hint">Por segurança, a API aceita inicialmente links de <strong>archive.org</strong> e <strong>files.freemusicarchive.org</strong>. O arquivo precisa estar disponível diretamente nesses endereços, sem redirecionamentos. Nem todo conteúdo desses sites permite download: verifica a licença.</p>
    {error && <p role="alert" className="dl-error">{error}</p>}
    <div className="dl-jobs-head"><strong>Transferências desta sessão</strong><button type="button" onClick={() => void refresh()} title="Atualizar"><RefreshCw size={16} /></button></div>
    {!jobs.length && <p className="dl-empty">Nenhum download iniciado.</p>}
    {jobs.map(job => {
      const percent = job.total ? Math.min(100, Math.round(job.downloaded * 100 / job.total)) : null;
      return <div className="dl-job" key={job.id}><div className="dl-job-row"><strong title={job.filename}>{job.filename}</strong><span>{job.status === "complete" ? (job.duplicate ? "Já estava na biblioteca" : "Concluído") : job.status === "error" ? "Falhou" : job.status === "pending" ? "Na fila" : percent === null ? "Baixando..." : `${percent}%`}</span></div>
        <div className="dl-progress"><div style={{ width: `${job.status === "complete" ? 100 : percent ?? 0}%` }} /></div>
        <small>{(job.downloaded / 1048576).toFixed(1)} MB{job.total ? ` / ${(job.total / 1048576).toFixed(1)} MB` : ""}</small>
        {job.error && <p className="dl-error">{job.error}</p>}
      </div>;
    })}
  </section>;
}
