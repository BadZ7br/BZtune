import { apiFetch } from "../services/api-fetch";
import { useEffect, useRef } from "react";
import { usePlayer } from "../player/PlayerContext";

const API = "http://127.0.0.1:5000";
type Session = {
  sessionId: string;
  videoId: string;
  title: string;
  artist: string;
  album: string;
  source: "local" | "online";
  seconds: number;
  sent: number;
};

/** Conta apenas os segundos confirmados pelo motor de reprodução.
 *  Usa sessionId + progresso acumulado: um retry NÃO duplica escutas.
 */
export default function ListeningTracker() {
  const { current, isPlaying, playback } = usePlayer();
  const state = useRef<{ playing: boolean; session: Session | null }>({ playing: false, session: null });
  state.current.playing = isPlaying && playback.track === current && playback.playing;

  const key = current ? `${current.videoId}|${current.audioUrl || ""}|${current.title}|${current.artist}|${current.album || ""}|${playback.track === current ? playback.source : "pending"}` : "";

  useEffect(() => {
    const info = current;
    if (!info || playback.track !== info) { state.current.session = null; return; }
    const session: Session = {
      sessionId: `bztune_${crypto.randomUUID().replace(/-/g, "")}`,
      videoId: info.videoId,
      title: info.title,
      artist: info.artist,
      album: info.album || "",
      source: playback.source,
      seconds: 0, sent: 0,
    };
    state.current.session = session;
    let sending = false;
    let disposed = false;
    let retries = 0;
    let retryTimer: number | undefined;
    const transmit = () => {
      if (sending) return;
      if (session.seconds <= session.sent || session.seconds < 3) return;
      window.clearTimeout(retryTimer);
      retryTimer = undefined;
      const seconds = session.seconds;
      sending = true;
      const payload = JSON.stringify({ ...session, seconds });
      void apiFetch(`${API}/api/bztune/stats/progress`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: payload, keepalive: true,
      }).then(response => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        session.sent = Math.max(session.sent, seconds);
        retries = 0;
      }).catch(() => {
        // Retain the same session ID and total on retry, even after changing tracks.
        if (retries++ < 3) retryTimer = window.setTimeout(transmit, 2000 * retries);
      }).finally(() => {
        sending = false;
        if (disposed && session.sent < session.seconds && retryTimer === undefined && retries < 3) transmit();
      });
    };
    // setInterval é menos preciso em abas ocultas; só contabiliza ticks recentes.
    let last = performance.now();
    const timer = window.setInterval(() => {
      const now = performance.now();
      const delta = Math.min(1.5, Math.max(0, (now - last) / 1000));
      last = now;
      if (state.current.playing) session.seconds = Math.min(6 * 60 * 60, session.seconds + delta);
      if (session.seconds - session.sent >= 10) transmit();
    }, 1000);
    const saveOnHidden = () => { if (document.visibilityState === "hidden") transmit(); };
    document.addEventListener("visibilitychange", saveOnHidden);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", saveOnHidden);
      disposed = true;
      transmit();
      if (state.current.session === session) state.current.session = null;
    };
    // A sessão deve reiniciar somente ao trocar a faixa/fonte, não ao pausar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return null;
}
