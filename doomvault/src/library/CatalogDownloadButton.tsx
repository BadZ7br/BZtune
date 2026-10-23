import { downloadIdentity, downloadSnapshot, startCatalogDownload, subscribeDownloads } from "../services/catalog-downloads";
import { useEffect, useState, useSyncExternalStore } from "react";
import { Download, LoaderCircle, Check, AlertCircle } from "lucide-react";
type Props = { artist: string; title: string; kind: "track" | "release"; albumId?: string | null; videoId?: string | null; showLabel?: boolean };
/** Não expõe URLs de diagnóstico nem orientações para contornar verificações do provedor. */
function friendlyDownloadMessage(raw: string): string {
  const issue = raw.trim();
  if (/sign in to confirm (?:you are|you're) not a bot|cookies-from-browser|cookies\.txt/i.test(issue)) {
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

export default function CatalogDownloadButton({ artist, title, kind, albumId, videoId, showLabel }: Props) {
  const request = { artist, title, kind, albumId, videoId };
  const identity = downloadIdentity(request);
  const { batchId, batch, message: rawMessage, submitting, noticeAt } = useSyncExternalStore(subscribeDownloads, () => downloadSnapshot(identity));
  const message = rawMessage ? friendlyDownloadMessage(rawMessage) : "";
  const [feedbackVisible, setFeedbackVisible] = useState(false);
  useEffect(() => {
    const remaining = noticeAt + 6000 - Date.now();
    setFeedbackVisible(remaining > 0);
    if (remaining <= 0) return;
    const timeout = window.setTimeout(() => setFeedbackVisible(false), remaining);
    return () => window.clearTimeout(timeout);
  }, [identity, noticeAt]);

  const working = submitting || Boolean(batchId);
  const complete = batch?.status === "complete";
  const done = batch?.status === "complete" || batch?.status === "partial" || batch?.status === "error";
  const pct = batch?.current?.total ? Math.round(100 * (batch.current.downloaded ?? 0) / batch.current.total) : null;
  const label = working ? "Download em andamento" : complete ? "Download concluído" : `Baixar ${kind === "track" ? "música" : "lançamento"}`;
  const showFeedback = Boolean(message || batch) && ((working && !message) || feedbackVisible);
  return <span className="dv-catalog-download">
    <button type="button" disabled={Boolean(working || complete)} title={label} aria-label={`${label}: ${title}`} onClick={() => void startCatalogDownload(request)}>
      {working ? <LoaderCircle size={16} className="dv-catalog-spin" /> : complete ? <Check size={16} /> : <Download size={16} />}{showLabel && <span>{label}</span>}
    </button>
    {showFeedback && <span className="dv-catalog-download-message" role="status">
      {message || (batch?.status === "searching" ? "Localizando gravações..." :
        batch?.status === "downloading" ? `${batch.completed}/${batch.total} concluída(s) · ${batch.current_title || "Preparando"}${pct === null ? "" : ` · ${pct}%`}` :
          done ? `${batch?.completed ?? 0}/${batch?.total ?? 0} concluída(s)${batch?.linked ? ` · ${batch.linked} vinculada(s) ao álbum` : ""}${batch?.warnings?.length ? ` · ${friendlyDownloadMessage(batch.warnings[0])}` : ""}${batch?.errors?.length ? ` · ${friendlyDownloadMessage(batch.errors[0])}` : ""}` : "")}
      {batch?.status === "error" && <AlertCircle size={13} aria-hidden="true" />}
      <button type="button" className="dv-catalog-dismiss" onClick={() => setFeedbackVisible(false)}
        aria-label="Fechar aviso de download" title="Fechar aviso">×</button>
    </span>}
  </span>;
}
