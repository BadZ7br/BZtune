import { apiFetch } from "../services/api-fetch";
import { useEffect, useRef, useState } from "react";
import { ExternalLink, RefreshCw, X } from "lucide-react";
import type { PlayerTrack } from "./PlayerContext";
import { providerError, readAlternatives } from "../services/player-contracts";
import type { AlternativeTrack } from "../services/player-contracts";

const API = "http://127.0.0.1:5000";
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
  const [options, setOptions] = useState<AlternativeTrack[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState("");

  const request = useRef<AbortController | null>(null);
  useEffect(() => {
    request.current?.abort();
    setOptions([]);
    setSearched(false);
    setError("");
    setLoading(false);
    return () => request.current?.abort();
  }, [videoId, title, artist]);

  async function search() {
    setLoading(true);
    setError("");
    setOptions([]);
    setSearched(false);
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    // Busca iniciada somente por clique; nenhuma reprodução automática.
    try {
      const qs = new URLSearchParams({ title, artist, exclude: videoId });
      const response = await apiFetch(`${API}/api/bztune/discovery/alternatives?${qs}`, { signal: controller.signal });
      const body: unknown = await response.json();
      if (!response.ok) throw new Error(providerError(body, "Falha ao buscar versões alternativas."));
      const tracks = readAlternatives(body);
      if (controller.signal.aborted || request.current !== controller) return;
      setOptions(tracks);
      setSearched(true);
    } catch (problem) {
      if (controller.signal.aborted || request.current !== controller) return;
      setError(problem instanceof Error ? problem.message : "Não foi possível consultar alternativas.");
    } finally {
      if (request.current === controller && !controller.signal.aborted) setLoading(false);
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
    {options.length > 0 && <div className="bz-online-recovery-results" role="group" aria-label="Gravações alternativas">
      <p>Escolhe uma opção para substituir apenas a faixa atual. A disponibilidade de incorporação não é garantida.</p>
      {options.map(track => <button type="button" key={track.videoId} onClick={() => onChoose({ ...track, preferredSource: "online" })}>
        <strong>{track.title}</strong><small>{track.artist}{track.album ? ` · ${track.album}` : ""}</small>
      </button>)}
    </div>}
  </section>;
}
