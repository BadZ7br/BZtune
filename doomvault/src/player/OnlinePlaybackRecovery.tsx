import { apiFetch } from "../services/api-fetch";
import { useEffect, useState } from "react";
import { ExternalLink, RefreshCw, X } from "lucide-react";
import type { PlayerTrack } from "./PlayerContext";

const API = "http://127.0.0.1:5000";
type Candidate = { videoId: string; title: string; artist: string; album?: string; cover?: string | null };
type Response = { tracks?: Candidate[]; error?: string };
type Props = {
  videoId: string;
  title: string;
  artist: string;
  reason: string;
  onClose: () => void;
  onRetry?: () => void;
  onChoose: (track: PlayerTrack) => void;
};

/** Opções transparentes quando o YouTube impede a incorporação.
 * Não tenta contornar bloqueios, reproduzir por proxies, ou abrir vídeos automaticamente.
 */
export default function OnlinePlaybackRecovery({ videoId, title, artist, reason, onClose, onChoose, onRetry }: Props) {
  const [options, setOptions] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setOptions([]);
    setSearched(false);
    setError("");
    setLoading(false);
  }, [videoId, title, artist]);

  async function search() {
    setLoading(true);
    setError("");
    setOptions([]);
    setSearched(false);
    const controller = new AbortController();
    // Busca iniciada somente por clique; nenhuma reprodução automática.
    try {
      const qs = new URLSearchParams({ title, artist, exclude: videoId });
      const response = await apiFetch(`${API}/api/bztune/discovery/alternatives?${qs}`, { signal: controller.signal });
      const body = await response.json() as Response;
      if (!response.ok) throw new Error(body.error || "Falha ao buscar versões alternativas.");
      setOptions(body.tracks || []);
      setSearched(true);
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : "Não foi possível consultar alternativas.");
    } finally {
      setLoading(false);
    }
  }

  const safeId = /^[a-zA-Z0-9_-]{11}$/.test(videoId) ? videoId : "";
  return <section className="bz-online-recovery" role="region" aria-label="Alternativas de reprodução">
    <div className="bz-online-recovery-header"><strong>Reprodução indisponível no BZtune</strong>
      <button type="button" onClick={onClose} aria-label="Fechar alternativas" title="Fechar alternativas"><X size={17}/></button>
    </div>
    <p>{reason || "O YouTube não permitiu reproduzir este vídeo incorporado."}</p>
    <p className="bz-online-recovery-note">Restrições de idade, região e incorporação são controladas pelo YouTube. O BZtune não as contorna.</p>
    <div className="bz-online-recovery-actions">
      {onRetry && <button type="button" onClick={onRetry}><RefreshCw size={15}/> Tentar reprodução novamente</button>}
      {safeId && <a href={`https://www.youtube.com/watch?v=${safeId}`} target="_blank" rel="noopener noreferrer"><ExternalLink size={15}/> Ver vídeo no YouTube</a>}
      <button type="button" disabled={loading} onClick={() => void search()}><RefreshCw size={15}/>{loading ? "Procurando…" : "Procurar outra gravação"}</button>
    </div>
    {error && <p role="alert" className="bz-online-recovery-error">{error}</p>}
    {searched && options.length === 0 && <p role="status">Nenhuma gravação correspondente foi encontrada. Podes escolher outra música da fila.</p>}
    {options.length > 0 && <div className="bz-online-recovery-results" aria-label="Gravações alternativas">
      <p>Escolhe uma opção para substituir apenas a faixa atual. A disponibilidade de incorporação não é garantida.</p>
      {options.map(track => <button type="button" key={track.videoId} onClick={() => onChoose({ ...track, preferredSource: "online" })}>
        <strong>{track.title}</strong><small>{track.artist}{track.album ? ` · ${track.album}` : ""}</small>
      </button>)}
    </div>}
  </section>;
}
