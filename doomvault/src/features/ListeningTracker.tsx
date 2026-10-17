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

/** Conta segundos enquanto o contexto de reprodução estiver em playing.
 *  Usa sessionId + progresso acumulado: um retry NÃO duplica escutas.
 */
export default function ListeningTracker() {
  const { current, isPlaying } = usePlayer();
  const state = useRef<{ playing: boolean; session: Session | null }>({ playing: false, session: null });
  state.current.playing = isPlaying;

  const key = current ? `${current.videoId}|${current.audioUrl || ""}|${current.title}|${current.artist}` : "";

  useEffect(() => {
    const info = current;
    if (!info) { state.current.session = null; return; }
    const session: Session = {
      sessionId: `bztune_${crypto.randomUUID().replace(/-/g, "")}`,
      videoId: info.videoId,
      title: info.title,
      artist: info.artist,
      album: info.album || "",
      source: info.audioUrl || info.videoId.startsWith("library:") ? "local" : "online",
      seconds: 0, sent: 0,
    };
    state.current.session = session;
    const transmit = () => {
      if (session.seconds <= session.sent || session.seconds < 3) return;
      session.sent = session.seconds;
      const payload = JSON.stringify(session);
      void fetch(`${API}/api/bztune/stats/progress`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: payload, keepalive: true,
      }).catch(() => { session.sent = Math.max(0, session.sent - 1); });
    };
    // setInterval é menos preciso em abas ocultas; só contabiliza ticks recentes.
    let last = performance.now();
    const timer = window.setInterval(() => {
      const now = performance.now();
      const delta = Math.min(1.5, Math.max(0, (now - last) / 1000));
      last = now;
      if (!state.current.playing) return;
      session.seconds = Math.min(6 * 60 * 60, session.seconds + delta);
      if (session.seconds - session.sent >= 10) transmit();
    }, 1000);
    const saveOnHidden = () => { if (document.visibilityState === "hidden") transmit(); };
    document.addEventListener("visibilitychange", saveOnHidden);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", saveOnHidden);
      transmit();
      if (state.current.session === session) state.current.session = null;
    };
    // A sessão deve reiniciar somente ao trocar a faixa/fonte, não ao pausar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return null;
}
