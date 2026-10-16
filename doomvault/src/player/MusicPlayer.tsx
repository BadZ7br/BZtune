import { useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronUp, ListMusic, Pause, Play, SkipBack, SkipForward, Volume2, X, Shuffle, Repeat, Repeat1, Minimize2, Maximize2, SlidersHorizontal, History, ScrollText, Upload } from "lucide-react";
import { usePlayer } from "./PlayerContext";
import "./player.css";
import "./player-v11.css";

const API = "http://127.0.0.1:5000";
type StoredTrack = { id: string; title: string; artist: string; audioUrl: string; coverUrl?: string };
type YTPlayer = {
  playVideo: () => void; pauseVideo: () => void;
  seekTo: (seconds: number, allowSeekAhead: boolean) => void;
  getCurrentTime: () => number; getDuration: () => number;
  setVolume: (volume: number) => void; destroy: () => void;
};
type YTApi = { Player: new (element: HTMLElement, options: object) => YTPlayer };
declare global {
  interface Window { YT?: YTApi; onYouTubeIframeAPIReady?: () => void; }
}
let loadPromise: Promise<YTApi> | null = null;
function loadYouTubeApi(): Promise<YTApi> {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (loadPromise) return loadPromise;
  loadPromise = new Promise<YTApi>((resolve, reject) => {
    const prior = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prior?.();
      if (window.YT?.Player) resolve(window.YT);
      else reject(new Error("YouTube API indisponível"));
    };
    const script = document.createElement("script");
    script.src = "https://www.youtube.com/iframe_api";
    script.onerror = () => reject(new Error("Não foi possível carregar o YouTube"));
    document.head.appendChild(script);
  }).catch((error: unknown) => { loadPromise = null; throw error; });
  return loadPromise;
}
function normalize(text: string) {
  return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}
function formatTime(seconds: number) {
  if (!Number.isFinite(seconds)) return "0:00";
  const n = Math.max(0, Math.floor(seconds));
  return `${Math.floor(n / 60)}:${String(n % 60).padStart(2, "0")}`;
}
function errorMessage(code: number) {
  if (code === 5) return "Erro no player HTML5 do YouTube.";
  if (code === 101 || code === 150) return "Este vídeo não permite reprodução incorporada.";
  if (code === 100) return "Vídeo indisponível.";
  if (code === 153) return "O YouTube não conseguiu identificar o aplicativo.";
  return `Falha do YouTube (código ${code}).`;
}

const POSITION_KEY = "doomvault-resume-position-v11";
const HISTORY_KEY = "doomvault-listening-history-v11";
const LYRIC_KEY = "doomvault-lrc-v11:";
type ListenItem = { videoId: string; title: string; artist: string; playedAt: number };
type LyricLine = { time: number; text: string };
function readStored<T>(key: string, fallback: T): T {
  try { const val = localStorage.getItem(key); return val ? JSON.parse(val) as T : fallback; }
  catch { return fallback; }
}
function parseLrc(source: string): LyricLine[] {
  const lines: LyricLine[] = [];
  for (const row of source.split(/\r?\n/)) {
    const stamps = [...row.matchAll(/\[(\d{1,3}):(\d{2})(?:\.(\d{1,3}))?\]/g)];
    const text = row.replace(/\[\d{1,3}:\d{2}(?:\.\d{1,3})?\]/g, "").trim();
    for (const match of stamps) {
      const fraction = Number((match[3] || "0").padEnd(3, "0").slice(0, 3)) / 1000;
      lines.push({ time: Number(match[1]) * 60 + Number(match[2]) + fraction, text });
    }
  }
  return lines.sort((a, b) => a.time - b.time);
}
export default function MusicPlayer() {
  const { current, tracks, index, isPlaying, setPlaying, next, previous, playTrack, clearQueue, shuffle, repeat, toggleShuffle, cycleRepeat, onTrackEnded, replayToken } = usePlayer();
  const mount = useRef<HTMLDivElement>(null);
  const audio = useRef<HTMLAudioElement>(null);
  const yt = useRef<YTPlayer | null>(null);
  const ended = useRef(onTrackEnded);
  const replaySeen = useRef(0);
  const [resolved, setResolved] = useState<{ key: string; url: string | null; cover: string | null } | null>(null);
  const [coverBroken, setCoverBroken] = useState(false);
  const [ready, setReady] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(80);
  const [showQueue, setShowQueue] = useState(false);
  const [message, setMessage] = useState("");
  const [compact, setCompact] = useState(() => readStored("doomvault-compact-v11", false));
  const [showExtras, setShowExtras] = useState<"none" | "eq" | "lyrics" | "history">("none");
  const [historyItems, setHistoryItems] = useState<ListenItem[]>(() => readStored(HISTORY_KEY, []));
  const [lyrics, setLyrics] = useState<LyricLine[]>([]);
  const [eq, setEq] = useState(() => readStored("doomvault-eq-v11", [0, 0, 0]));
  const audioContext = useRef<AudioContext | null>(null);
  const audioSource = useRef<MediaElementAudioSourceNode | null>(null);
  const filters = useRef<BiquadFilterNode[]>([]);
  const restoredKey = useRef<string | null>(null);
  const historyKey = useRef<string | null>(null);
  const lrcInput = useRef<HTMLInputElement>(null);
  ended.current = onTrackEnded;

  const key = current ? `${current.videoId}|${current.audioUrl ?? ""}|${current.title}|${current.artist}` : "";
  const resolvedCurrent = resolved?.key === key ? resolved : null;
  const localUrl = current?.audioUrl || resolvedCurrent?.url || null;
  const checking = !!current && !current.audioUrl && !resolvedCurrent;
  const coverUrl = current?.cover || resolvedCurrent?.cover || null;
  const activeLine = lyrics.reduce((prev, line, i) => line.time <= progress ? i : prev, -1);

  useEffect(() => { try { localStorage.setItem("doomvault-compact-v11", JSON.stringify(compact)); } catch { } }, [compact]);
  useEffect(() => { try { localStorage.setItem("doomvault-eq-v11", JSON.stringify(eq)); } catch { } }, [eq]);
  useEffect(() => {
    setLyrics(current ? parseLrc(localStorage.getItem(LYRIC_KEY + current.videoId) || "") : []);
  }, [key]);
  useEffect(() => {
    if (!current || !isPlaying || historyKey.current === key) return;
    historyKey.current = key;
    const entry: ListenItem = { videoId: current.videoId, title: current.title, artist: current.artist, playedAt: Date.now() };
    setHistoryItems(old => {
      const next = [entry, ...old.filter(x => x.videoId !== entry.videoId)].slice(0, 50);
      try { localStorage.setItem(HISTORY_KEY, JSON.stringify(next)); } catch { }
      return next;
    });
  }, [key, isPlaying, current]); // só registra quando a música começa

  // Retomar o tempo anterior no mesmo arquivo local; nunca iniciar automaticamente ao abrir o site.
  useEffect(() => {
    if (!localUrl || !current || !ready || !audio.current || restoredKey.current === key) return;
    restoredKey.current = key;
    const saved = readStored<{ videoId: string; seconds: number } | null>(POSITION_KEY, null);
    if (saved?.videoId === current.videoId && saved.seconds > 2 && saved.seconds < audio.current.duration - 2)
      audio.current.currentTime = saved.seconds;
  }, [localUrl, ready, key, current]);
  useEffect(() => {
    if (!localUrl || !current) return;
    const timer = window.setInterval(() => {
      const seconds = audio.current?.currentTime;
      if (typeof seconds === "number" && Number.isFinite(seconds))
        try { localStorage.setItem(POSITION_KEY, JSON.stringify({ videoId: current.videoId, seconds })); } catch { }
    }, 2000);
    return () => window.clearInterval(timer);
  }, [localUrl, current]);

  async function activateEqualizer() {
    const element = audio.current;
    if (!element) { setMessage("Equalizador disponível apenas no áudio offline."); return; }
    try {
      if (audioSource.current && audioSource.current.mediaElement !== element) {
        void audioContext.current?.close();
        audioContext.current = null;
        audioSource.current = null;
        filters.current = [];
      }
      if (!audioContext.current) {
        const context = new AudioContext();
        const source = context.createMediaElementSource(element);
        const bass = context.createBiquadFilter(); bass.type = "lowshelf"; bass.frequency.value = 200;
        const mid = context.createBiquadFilter(); mid.type = "peaking"; mid.frequency.value = 1000; mid.Q.value = 0.8;
        const treble = context.createBiquadFilter(); treble.type = "highshelf"; treble.frequency.value = 4500;
        source.connect(bass); bass.connect(mid); mid.connect(treble); treble.connect(context.destination);
        audioContext.current = context; audioSource.current = source; filters.current = [bass, mid, treble];
      }
      await audioContext.current.resume();
      filters.current.forEach((f, i) => { f.gain.value = eq[i]; });
    } catch { setMessage("Não foi possível ativar o equalizador. Confere as permissões de áudio do navegador."); }
  }
  function adjustEq(i: number, gain: number) {
    setEq(prev => prev.map((x, j) => i === j ? gain : x));
    if (filters.current[i]) filters.current[i].gain.value = gain;
  }
  async function loadLyrics(file: File | undefined) {
    if (!file || !current || file.size > 250_000 || !file.name.toLowerCase().endsWith(".lrc")) {
      setMessage("Seleciona um arquivo .lrc com até 250 KB."); return;
    }
    const lines = parseLrc(await file.text());
    try { localStorage.setItem(LYRIC_KEY + current.videoId, await file.text()); }
    catch { setMessage("Não foi possível salvar a letra neste navegador."); return; }
    setLyrics(lines);
    setMessage(`Letra importada: ${lines.length} linhas sincronizadas.`);
  }


  // Prioridade: arquivo local. Procurar correspondência exata de artista e título.
  useEffect(() => {
    if (!current) return;
    let active = true;
    setResolved(null);
    setCoverBroken(false);
    setReady(false);
    setProgress(0);
    setDuration(0);
    setMessage("");
    if (current.audioUrl) {
      setResolved({ key, url: current.audioUrl, cover: current.cover ?? null });
      return () => { active = false; };
    }
    async function findLocal() {
      try {
        const response = await fetch(`${API}/api/library/tracks`, { cache: "no-store" });
        if (!response.ok) throw new Error("Biblioteca indisponível");
        const data = await response.json() as { tracks: StoredTrack[] };
        const found = data.tracks.find(t => normalize(t.artist) === normalize(current!.artist)
          && normalize(t.title) === normalize(current!.title));
        if (active) setResolved({ key, url: found ? `${API}${found.audioUrl}` : null, cover: found?.coverUrl ? `${API}${found.coverUrl}` : null });
      } catch {
        if (active) setResolved({ key, url: null, cover: null });
      }
    }
    void findLocal();
    return () => { active = false; };
  }, [key]); // current is resolved by this key

  // Só inicializar o YouTube se NÃO existir arquivo local.
  useEffect(() => {
    if (!current || checking || localUrl || !mount.current) return;
    if (!/^[a-zA-Z0-9_-]{11}$/.test(current.videoId)) {
      setMessage("O arquivo local não está mais disponível nesta biblioteca.");
      setPlaying(false);
      return;
    }
    let cancelled = false;
    setReady(false);
    const target = document.createElement("div");
    mount.current.replaceChildren(target);
    loadYouTubeApi().then(YT => {
      if (cancelled) return;
      yt.current = new YT.Player(target, {
        width: "240", height: "200", videoId: current.videoId,
        playerVars: { autoplay: 1, controls: 1, playsinline: 1, origin: window.location.origin },
        events: {
          onReady: (event: { target: YTPlayer }) => {
            if (cancelled) return;
            yt.current = event.target;
            event.target.setVolume(volume);
            setReady(true);
          },
          onStateChange: (event: { data: number }) => {
            if (cancelled) return;
            if (event.data === 0) ended.current();
            if (event.data === 1) setPlaying(true);
            if (event.data === 2) setPlaying(false);
          },
          onError: (event: { data: number }) => {
            if (!cancelled) { setMessage(errorMessage(event.data)); setPlaying(false); }
          },
        },
      });
    }).catch(() => { if (!cancelled) setMessage("Falha ao carregar o player incorporado."); });
    return () => {
      cancelled = true;
      try { yt.current?.destroy(); } catch { /* encerrado */ }
      yt.current = null;
      mount.current?.replaceChildren();
    };
    // Instância do YouTube muda apenas quando muda faixa/fonte.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, checking, localUrl]);

  useEffect(() => {
    if (localUrl) {
      const node = audio.current;
      if (!node) return;
      if (isPlaying) void node.play().catch(() => setMessage("Não foi possível iniciar o áudio local."));
      else node.pause();
    } else if (ready && yt.current) {
      try { if (isPlaying) yt.current.playVideo(); else yt.current.pauseVideo(); } catch { /* iniciando */ }
    }
  }, [isPlaying, ready, localUrl]);

  useEffect(() => {
    if (audio.current) audio.current.volume = volume / 100;
    try { yt.current?.setVolume(volume); } catch { /* não iniciado */ }
  }, [volume, localUrl]);

  useEffect(() => {
    if (!current || localUrl || checking) return;
    const timer = window.setInterval(() => {
      try {
        setProgress(yt.current?.getCurrentTime() || 0);
        setDuration(yt.current?.getDuration() || 0);
      } catch { /* player online indisponível */ }
    }, 600);
    return () => window.clearInterval(timer);
  }, [key, localUrl, checking]);

  useEffect(() => {
    if (!replayToken || !current || replaySeen.current === replayToken) return;
    replaySeen.current = replayToken;
    if (localUrl && audio.current) {
      audio.current.currentTime = 0;
      void audio.current.play().catch(() => setMessage("Falha ao repetir áudio local."));
    } else if (yt.current && ready) {
      try { yt.current.seekTo(0, true); yt.current.playVideo(); } catch { /* ainda iniciando */ }
    }
  }, [replayToken, localUrl, ready, current]);

  function seek(seconds: number) {
    if (localUrl && audio.current) audio.current.currentTime = seconds;
    else try { yt.current?.seekTo(seconds, true); } catch { /* player online */ }
    setProgress(seconds);
  }

  if (!current) return null;
  return <section className={`dv-player ${compact && localUrl ? "dv-player-compact" : ""}`} aria-label="Reprodutor DoomVault">
    {localUrl ? (
      <div className="dv-player-video" style={{ display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
        {coverUrl && !coverBroken ? (
          <img
            key={coverUrl}
            src={coverUrl}
            alt={`Capa de ${current.title}`}
            style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
            onError={() => setCoverBroken(true)}
          />
        ) : (
          <div className="dv-player-offline-badge" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
            <ListMusic size={34} />
            <span>ÁUDIO OFFLINE</span>
          </div>
        )}
        <audio ref={audio} src={localUrl} crossOrigin="anonymous" preload="metadata" loop={repeat === "one"}
          onLoadedMetadata={e => { setReady(true); setDuration(e.currentTarget.duration || 0); }}
          onCanPlay={e => { setReady(true); if (isPlaying) void e.currentTarget.play().catch(() => setMessage("Falha ao reproduzir o arquivo local.")); }}
          onTimeUpdate={e => setProgress(e.currentTarget.currentTime)}
          onDurationChange={e => setDuration(Number.isFinite(e.currentTarget.duration) ? e.currentTarget.duration : 0)}
          onEnded={() => ended.current()}
          onError={() => { setReady(false); setMessage("Não foi possível carregar o arquivo local. Confere se o Flask está ligado."); }} />
      </div>
    ) : checking ? <div className="dv-player-video" style={{ display: "grid", placeItems: "center" }}>Verificando biblioteca...</div>
      : <div className="dv-player-video" ref={mount} aria-label="Reprodutor de vídeo do YouTube" />}
    <div className="dv-player-panel">
      <div className="dv-v11-toolbar">
        <button title={compact ? "Expandir player" : "Mini-player (apenas offline)"} disabled={!localUrl} onClick={() => setCompact(v => !v)}>{compact ? <Maximize2 size={16} /> : <Minimize2 size={16} />}</button>
        <button title="Equalizador" onClick={() => { setShowExtras(v => v === "eq" ? "none" : "eq"); if (localUrl) void activateEqualizer(); }}><SlidersHorizontal size={16} /></button>
        <button title="Letras LRC" onClick={() => setShowExtras(v => v === "lyrics" ? "none" : "lyrics")}><ScrollText size={16} /></button>
        <button title="Histórico" onClick={() => setShowExtras(v => v === "history" ? "none" : "history")}><History size={16} /></button>
      </div>
      <div className="dv-player-top"><div className="dv-player-song"><strong>{current.title}</strong><span>{current.artist}</span></div><button title="Fechar player" onClick={clearQueue}><X size={18} /></button></div>
      <div className="dv-player-controls">
        <button onClick={previous} disabled={index <= 0} aria-label="Anterior"><SkipBack size={19} /></button>
        <button className="dv-player-main" onClick={() => setPlaying(!isPlaying)} disabled={!ready} aria-label={isPlaying ? "Pausar" : "Reproduzir"}>{isPlaying ? <Pause size={19} /> : <Play size={19} />}</button>
        <button onClick={next} disabled={tracks.length <= 1 && repeat !== "all"} aria-label="Próxima"><SkipForward size={19} /></button>
        <button onClick={toggleShuffle} title={shuffle ? "Desativar aleatório" : "Ativar aleatório"} aria-label="Aleatório" aria-pressed={shuffle} style={{ color: shuffle ? "#c5f277" : undefined }}><Shuffle size={18} /></button>
        <button onClick={cycleRepeat} title={repeat === "off" ? "Repetição desligada" : repeat === "all" ? "Repetir fila" : "Repetir música"} aria-label="Modo de repetição" style={{ color: repeat === "off" ? undefined : "#c5f277" }}>{repeat === "one" ? <Repeat1 size={18} /> : <Repeat size={18} />}</button>
        <button onClick={() => setShowQueue(v => !v)} aria-label="Mostrar fila"><ListMusic size={19} />{showQueue ? <ChevronDown size={12} /> : <ChevronUp size={12} />}</button>
      </div>
      <div className="dv-player-progress"><span>{formatTime(progress)}</span><input type="range" aria-label="Posição da música" min={0} max={duration || 1} step={1} value={Math.min(progress, duration || 1)} onChange={e => seek(Number(e.target.value))} /><span>{formatTime(duration)}</span></div>
      <label className="dv-player-volume"><Volume2 size={15} /><input type="range" min={0} max={100} value={volume} onChange={e => setVolume(Number(e.target.value))} aria-label="Volume" /></label>
      {localUrl && <span style={{ fontSize: 12, opacity: 0.8 }}>Reproduzindo arquivo local (sem vídeo).</span>}
      {message && <p className="dv-player-error">{message} {!localUrl && /^[a-zA-Z0-9_-]{11}$/.test(current.videoId) && <a href={`https://www.youtube.com/watch?v=${encodeURIComponent(current.videoId)}`} target="_blank" rel="noopener noreferrer">Abrir no YouTube</a>}</p>}
      {showExtras === "eq" && <div className="dv-v11-extras"><strong>Equalizador · áudio offline</strong>
        {(["Graves", "Médios", "Agudos"] as const).map((label, i) => <label key={label}>{label} <input type="range" min={-12} max={12} step={1} value={eq[i]} onChange={e => adjustEq(i, Number(e.target.value))} disabled={!localUrl} /> {eq[i] > 0 ? "+" : ""}{eq[i]} dB</label>)}
        <button disabled={!localUrl} onClick={() => void activateEqualizer()}>Ativar áudio equalizado</button>
      </div>}
      {showExtras === "lyrics" && <div className="dv-v11-extras">
        <strong>Letras sincronizadas (.lrc)</strong>
        <input ref={lrcInput} type="file" accept=".lrc,text/plain" hidden onChange={e => { void loadLyrics(e.target.files?.[0]); e.target.value = ""; }} />
        <button onClick={() => lrcInput.current?.click()}><Upload size={14} /> Importar LRC desta música</button>
        {lyrics.length ? <div className="dv-v11-lyrics">{lyrics.map((line, i) => <p key={i} className={i === activeLine ? "active" : ""}>{line.text || "♪"}</p>)}</div> : <p>Importa uma letra .lrc que tens permissão de usar. O DoomVault sincroniza com o tempo da música.</p>}
      </div>}
      {showExtras === "history" && <div className="dv-v11-extras"><strong>Ouvidas recentemente</strong>
        {historyItems.length === 0 ? <p>Ainda sem histórico.</p> : historyItems.slice(0, 12).map(h => <div key={h.videoId} className="dv-v11-history">{h.title} <small>· {h.artist}</small></div>)}
        <button onClick={() => { setHistoryItems([]); localStorage.removeItem(HISTORY_KEY); }}>Limpar histórico</button>
      </div>}
      {showQueue && <div className="dv-player-queue"><strong>Fila de reprodução</strong>{tracks.map((item, i) => <button key={`${item.videoId}-${i}`} className={i === index ? "active" : ""} onClick={() => playTrack(item, tracks)}>{i + 1}. {item.title} <small>{item.artist}</small></button>)}</div>}
    </div>
  </section>;
}
