import { useEffect, useRef, useState } from "react";
import { Download, LoaderCircle, Check, AlertCircle } from "lucide-react";
const API = "http://127.0.0.1:5000";
type Props = { artist: string; title: string; kind: "track" | "release"; albumId?: string | null; videoId?: string | null };
type Status = "searching" | "downloading" | "complete" | "partial" | "error";
type Batch = { id: string; status: Status; total: number; completed: number; errors: string[]; warnings?: string[]; linked?: number; skipped?: number; current_title?: string | null; current?: { downloaded?: number; total?: number | null; status?: string } };

/** Não expõe URLs de diagnóstico nem orientações para contornar verificações do provedor. */
function friendlyDownloadMessage(raw: string): string {
  const issue = raw.trim();
  if (/sign in to confirm you.re not a bot|cookies-from-browser|cookies\.txt/i.test(issue)) {
    return "Esta fonte exige verificação do YouTube e o download não pôde ser concluído. Você ainda pode tentar a reprodução integrada.";
  }
  if (/age.restricted|video unavailable|private video/i.test(issue)) {
    return "Esta gravação não está disponível para download nesta fonte.";
  }
  if (/^ERROR:|yt-dlp|traceback/i.test(issue)) {
    return "O provedor não permitiu concluir este download.";
  }
  return issue.length > 180 ? issue.slice(0, 177) + "..." : issue;
}

export default function CatalogDownloadButton({ artist, title, kind, albumId, videoId }: Props) {
  const notifiedBatch = useRef<string | null>(null);
  const [batchId, setBatchId] = useState<string | null>(null);
  const [batch, setBatch] = useState<Batch | null>(null);
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => { setBatchId(null); setBatch(null); setMessage(""); }, [artist, title, kind, albumId, videoId]);
  useEffect(() => {
    if (!batchId) return;

    const currentBatchId = batchId;
    let live = true;
    let running = false;
    async function poll() {
      if (running) return;
      running = true;
      try {
        const response = await fetch(`${API}/api/library/auto-download/${encodeURIComponent(currentBatchId)}`, { cache: "no-store" });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const result = await response.json() as Batch;
        if (!live) return;
        setBatch(result);
        if ((result.status === "complete" || result.status === "partial") && notifiedBatch.current !== currentBatchId) {
          notifiedBatch.current = currentBatchId;
          window.dispatchEvent(new Event("doomvault-library-updated"));
        }
      } catch { if (live) setMessage("Não foi possível consultar o andamento do download."); }
      finally { running = false; }
    }
    void poll();
    const timer = window.setInterval(() => void poll(), 1200);
    return () => { live = false; window.clearInterval(timer); };
  }, [batchId]);

  async function download() {
    setSubmitting(true); setMessage(""); setBatch(null);
    try {
      const response = await fetch(`${API}/api/library/auto-download`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ artist, title, kind, albumId, videoId }) });
      const payload = await response.json() as { id?: string; error?: string };
      if (!response.ok || !payload.id) throw new Error(payload.error || "Falha ao iniciar download.");
      setBatchId(payload.id);
    } catch (e) { setMessage(e instanceof Error ? friendlyDownloadMessage(e.message) : "Não foi possível iniciar o download."); }
    finally { setSubmitting(false); }
  }

  const working = submitting || batch?.status === "searching" || batch?.status === "downloading";
  const complete = batch?.status === "complete";
  const done = batch?.status === "complete" || batch?.status === "partial" || batch?.status === "error";
  const pct = batch?.current?.total ? Math.round(100 * (batch.current.downloaded ?? 0) / batch.current.total) : null;
  const label = working ? "Download em andamento" : complete ? "Download concluído" : `Baixar ${kind === "track" ? "música" : "lançamento"}`;
  return <span className="dv-catalog-download">
    <button type="button" disabled={Boolean(working || complete)} title={label} aria-label={`${label}: ${title}`} onClick={() => void download()}>
      {working ? <LoaderCircle size={16} className="dv-catalog-spin" /> : complete ? <Check size={16} /> : <Download size={16} />}
    </button>
    {(message || batch) && <span className="dv-catalog-download-message" role="status">
      {message || (batch?.status === "searching" ? "Localizando gravações..." :
        batch?.status === "downloading" ? `${batch.completed}/${batch.total} concluída(s) · ${batch.current_title || "Preparando"}${pct === null ? "" : ` · ${pct}%`}` :
          done ? `${batch?.completed ?? 0}/${batch?.total ?? 0} concluída(s)${batch?.linked ? ` · ${batch.linked} vinculada(s) ao álbum` : ""}${batch?.warnings?.length ? ` · ${friendlyDownloadMessage(batch.warnings[0])}` : ""}${batch?.errors?.length ? ` · ${friendlyDownloadMessage(batch.errors[0])}` : ""}` : "")}
      {batch?.status === "error" && <AlertCircle size={13} aria-hidden="true" />}
    </span>}
  </span>;
}
