import { useEffect, useRef, useState } from "react";
import type { ChangeEvent, DragEvent } from "react";
import {
  ArrowDown, ArrowUp, GripVertical, History, ListMusic,
  Maximize2, Minimize2, Music2, Pause, Play, Repeat, Repeat1, ScrollText,
  Shuffle, SkipBack, SkipForward, SlidersHorizontal, Upload, Volume2, VolumeX, CheckCircle2, X,
} from "lucide-react";
import { usePlayer } from "./PlayerContext";
import type { PlayerTrack } from "./PlayerContext";
import AddToPlaylistButton from "../playlists/AddToPlaylistButton";
import CatalogDownloadButton from "../library/CatalogDownloadButton";
import LocalTrackPlaylistButton from "./LocalTrackPlaylistButton";
import OnlinePlaybackRecovery from "./OnlinePlaybackRecovery";
const API = "http://127.0.0.1:5000";
const POSITION_KEY = "doomvault-resume-position-v11";
const HISTORY_KEY = "doomvault-listening-history-v11";
const LYRIC_KEY = "doomvault-lrc-v11:";
const CROSSFADE_KEY = "bztune-crossfade-v13";
type StoredTrack = { id: string; title: string; artist: string; audioUrl: string; coverUrl?: string; sourceIds?: string[] };
type ResolvedTrack = { key: string; url: string | null; cover: string | null };
type ListenItem = { videoId: string; title: string; artist: string; playedAt: number };
type LyricLine = { time: number; text: string };
type CrossfadeSession = { from: number; to: number; nextIndex: number; started: number; duration: number; raf: number; fraction: number };
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
let ytPromise: Promise<YTApi> | null = null;
function loadYouTubeApi(): Promise<YTApi> {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (ytPromise) return ytPromise;
  ytPromise = new Promise<YTApi>((resolve, reject) => {
    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previous?.();
      if (window.YT?.Player) resolve(window.YT);
      else reject(new Error("API do YouTube não carregou"));
    };
    const existing = document.querySelector('script[src="https://www.youtube.com/iframe_api"]');
    if (!existing) {
      const tag = document.createElement("script");
      tag.src = "https://www.youtube.com/iframe_api";
      tag.onerror = () => reject(new Error("Não foi possível carregar o player do YouTube"));
      document.head.appendChild(tag);
    }
  }).catch((error: unknown) => { ytPromise = null; throw error; });
  return ytPromise;
}
function trackKey(track: PlayerTrack) { return `${track.videoId}|${track.audioUrl ?? ""}|${track.title}|${track.artist}|${track.preferredSource ?? "auto"}`; }
function normalize(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}
function formatTime(seconds: number) {
  if (!Number.isFinite(seconds)) return "0:00";
  const n = Math.max(0, Math.floor(seconds));
  return `${Math.floor(n / 60)}:${String(n % 60).padStart(2, "0")}`;
}
function readStored<T>(key: string, fallback: T): T {
  try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) as T : fallback; }
  catch { return fallback; }
}
function parseLrc(source: string): LyricLine[] {
  const lines: LyricLine[] = [];
  for (const row of source.split(/\r?\n/)) {
    const stamps = [...row.matchAll(/\[(\d{1,3}):(\d{2})(?:\.(\d{1,3}))?\]/g)];
    const value = row.replace(/\[\d{1,3}:\d{2}(?:\.\d{1,3})?\]/g, "").trim();
    for (const s of stamps) {
      const fraction = Number((s[3] || "0").padEnd(3, "0").slice(0, 3)) / 1000;
      lines.push({ time: Number(s[1]) * 60 + Number(s[2]) + fraction, text: value });
    }
  }
  return lines.sort((a, b) => a.time - b.time);
}
function ytError(code: number) {
  if (code === 101 || code === 150) return "Este vídeo não permite reprodução incorporada.";
  if (code === 100) return "Vídeo indisponível ou removido.";
  if (code === 153) return "O YouTube não conseguiu identificar o aplicativo.";
  if (code === 5) return "Falha do player HTML5 do YouTube.";
  return `Falha do YouTube (código ${code}).`;
}
function fullApiUrl(url: string) {
  return /^https?:\/\//i.test(url) ? url : `${API}${url.startsWith("/") ? "" : "/"}${url}`;
}

export default function MusicPlayer() {
  const {
    current, tracks, index, isPlaying, setPlaying, playTrack, next, previous, jumpTo, reorderQueue, removeFromQueue,
    clearQueue, shuffle, repeat, toggleShuffle, cycleRepeat, onTrackEnded, replayToken,
    volume, muted, setVolume, toggleMute,
  } = usePlayer();
  const ytMount = useRef<HTMLDivElement>(null);
  const yt = useRef<YTPlayer | null>(null);
  const audioEls = useRef<(HTMLAudioElement | null)[]>([null, null]);
  const sourceUrls = useRef<[string, string]>(["", ""]);
  const activeDeck = useRef(0);
  const fade = useRef<CrossfadeSession | null>(null);
  const fadeStarting = useRef(false);
  const nextLocal = useRef<{ index: number; url: string } | null>(null);
  const resolvedCache = useRef<Map<string, ResolvedTrack>>(new Map());
  const ended = useRef(onTrackEnded);
  const nextRef = useRef(next);
  const playingRef = useRef(isPlaying);
  const volumeRef = useRef({ volume, muted });
  const queueListRef = useRef(tracks);
  const replaySeen = useRef(0);
  const restoredKey = useRef<string | null>(null);
  const historyKey = useRef<string | null>(null);
  const [resolved, setResolved] = useState<ResolvedTrack | null>(null);
  const [ready, setReady] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [message, setMessage] = useState("");
  const [onlineFailure, setOnlineFailure] = useState<{ key: string; detail: string } | null>(null);
  const [recoveryFor, setRecoveryFor] = useState<string | null>(null);
  const [coverBroken, setCoverBroken] = useState(false);
  const [mini, setMini] = useState(() => readStored("bztune-mini-v131", true));
  const [nowPlaying, setNowPlaying] = useState(false);
  const [showQueue, setShowQueue] = useState(false);
  const [dragged, setDragged] = useState<number | null>(null);
  const [showExtras, setShowExtras] = useState<"none" | "eq" | "lyrics" | "history" | "crossfade">("none");
  const [historyItems, setHistoryItems] = useState<ListenItem[]>(() => readStored(HISTORY_KEY, []));
  const [lyrics, setLyrics] = useState<LyricLine[]>([]);
  const [eq, setEq] = useState<number[]>(() => readStored("doomvault-eq-v11", [0, 0, 0]));
  const [crossfadeSeconds, setCrossfadeSeconds] = useState(() => {
    const stored = readStored(CROSSFADE_KEY, 0);
    return Number.isFinite(stored) ? Math.max(0, Math.min(10, Number(stored))) : 0;
  });
  const audioContext = useRef<AudioContext | null>(null);
  const audioSources = useRef<MediaElementAudioSourceNode[]>([]);
  const filters = useRef<BiquadFilterNode[]>([]);
  const lrcInput = useRef<HTMLInputElement>(null);

  ended.current = onTrackEnded;
  nextRef.current = next;
  playingRef.current = isPlaying;
  volumeRef.current = { volume, muted };
  const key = current ? trackKey(current) : "";
  const failedOnline = onlineFailure?.key === key ? onlineFailure.detail : "";
  const recoveryOpen = recoveryFor === key || !!failedOnline;
  const resolvedCurrent = resolved?.key === key ? resolved : resolvedCache.current.get(key);
  // BZTUNE_V144: escolha explicita pela web ignora o cache de arquivos locais.
  const forceOnline = current?.preferredSource === "online";
  const localUrl = forceOnline ? null : current?.audioUrl ? fullApiUrl(current.audioUrl) : resolvedCurrent?.url || null;
  const checking = !!current && !forceOnline && !current.audioUrl && !resolvedCurrent;
  const coverUrl = current?.cover || resolvedCurrent?.cover || null;
  const activeLine = lyrics.reduce((last, line, i) => line.time <= progress ? i : last, -1);
  const trackIsLocal = !!localUrl;

  function applyVolumes() {
    const level = volumeRef.current.muted ? 0 : volumeRef.current.volume / 100;
    const session = fade.current;
    audioEls.current.forEach((el, i) => {
      if (!el) return;
      const factor = session ? i === session.from ? 1 - session.fraction : i === session.to ? session.fraction : 0 : i === activeDeck.current ? 1 : 0;
      el.volume = Math.max(0, Math.min(1, level * factor));
    });
    try { yt.current?.setVolume(Math.round(level * 100)); } catch { /* YouTube indisponível */ }
  }
  function cancelFade(stopIncoming = true) {
    const session = fade.current;
    if (!session) return;
    window.cancelAnimationFrame(session.raf);
    if (stopIncoming) {
      audioEls.current[session.to]?.pause();
      try { if (audioEls.current[session.to]) audioEls.current[session.to]!.currentTime = 0; } catch { /* arquivo não pronto */ }
    }
    fade.current = null;
    fadeStarting.current = false;
    applyVolumes();
  }
  function ensureDeck(deck: number, url: string) {
    const el = audioEls.current[deck];
    if (!el) return;
    if (sourceUrls.current[deck] !== url) {
      el.pause();
      el.preload = "auto";
      el.src = url;
      sourceUrls.current[deck] = url;
      el.load();
    }
  }
  function finishFade() {
    const session = fade.current;
    if (!session) return;
    window.cancelAnimationFrame(session.raf);
    const outgoing = audioEls.current[session.from];
    const incoming = audioEls.current[session.to];
    outgoing?.pause();
    if (outgoing) outgoing.volume = 0;
    activeDeck.current = session.to;
    fade.current = null;
    fadeStarting.current = false;
    if (incoming) { setProgress(incoming.currentTime); setDuration(Number.isFinite(incoming.duration) ? incoming.duration : 0); }
    applyVolumes();
    nextRef.current(); // Avança no Context sem reiniciar o elemento que já está tocando.
  }
  function maybeCrossfade(el: HTMLAudioElement, deck: number) {
    if (deck !== activeDeck.current || fade.current || fadeStarting.current || !isPlaying || !localUrl ||
      crossfadeSeconds <= 0 || shuffle || repeat === "one" || !Number.isFinite(el.duration)) return;
    const upcoming = nextLocal.current;
    if (!upcoming) return;
    const remaining = el.duration - el.currentTime;
    if (remaining <= 0 || remaining > crossfadeSeconds) return;
    const otherDeck = 1 - deck;
    const incoming = audioEls.current[otherDeck];
    if (!incoming || sourceUrls.current[otherDeck] !== upcoming.url || incoming.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return;
    fadeStarting.current = true;
    incoming.currentTime = 0;
    incoming.volume = 0;
    void incoming.play().then(() => {
      if (!playingRef.current || activeDeck.current !== deck || nextLocal.current?.index !== upcoming.index || nextLocal.current.url !== upcoming.url) { incoming.pause(); fadeStarting.current = false; return; }
      const session: CrossfadeSession = { from: deck, to: otherDeck, nextIndex: upcoming.index, started: performance.now(), duration: crossfadeSeconds * 1000, raf: 0, fraction: 0 };
      fade.current = session;
      function tick(now: number) {
        if (fade.current !== session) return;
        const fraction = Math.min(1, (now - session.started) / session.duration);
        session.fraction = fraction;
        applyVolumes();
        if (fraction >= 1) finishFade();
        else session.raf = window.requestAnimationFrame(tick);
      }
      session.raf = window.requestAnimationFrame(tick);
    }).catch(() => { fadeStarting.current = false; incoming.pause(); /* Avanço normal continua disponível. */ });
  }

  useEffect(() => {
    if (queueListRef.current !== tracks && fade.current) cancelFade();
    queueListRef.current = tracks;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tracks]);
  useEffect(() => {
    if (fade.current && (crossfadeSeconds === 0 || shuffle || repeat === "one")) cancelFade();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [crossfadeSeconds, shuffle, repeat]);

  // Preservar funcionalidades já existentes: histórico, equalizador, mini-player e letras LRC.
  useEffect(() => { try { localStorage.setItem("bztune-mini-v131", JSON.stringify(mini)); } catch { } }, [mini]);
  useEffect(() => { try { localStorage.setItem("doomvault-eq-v11", JSON.stringify(eq)); } catch { } }, [eq]);
  useEffect(() => { try { localStorage.setItem(CROSSFADE_KEY, JSON.stringify(crossfadeSeconds)); } catch { } }, [crossfadeSeconds]);
  useEffect(() => { setLyrics(current ? parseLrc(localStorage.getItem(LYRIC_KEY + current.videoId) || "") : []); }, [key]);
  useEffect(() => {
    if (!current || !isPlaying || historyKey.current === key) return;
    historyKey.current = key;
    const entry: ListenItem = { videoId: current.videoId, title: current.title, artist: current.artist, playedAt: Date.now() };
    setHistoryItems(old => {
      const updated = [entry, ...old.filter(t => t.videoId !== entry.videoId)].slice(0, 50);
      try { localStorage.setItem(HISTORY_KEY, JSON.stringify(updated)); } catch { }
      return updated;
    });
  }, [key, isPlaying, current]);

  useEffect(() => {
    if (!current) return;
    let active = true;
    setCoverBroken(false);
    setProgress(0);
    setDuration(0);
    setMessage("");
    if (current.preferredSource === "online") {
      const info = { key, url: null, cover: current.cover ?? null };
      resolvedCache.current.set(key, info);
      setResolved(info);
      return () => { active = false; };
    }
    if (current.audioUrl) {
      const info = { key, url: fullApiUrl(current.audioUrl), cover: current.cover ?? null };
      resolvedCache.current.set(key, info);
      setResolved(info);
      return () => { active = false; };
    }
    const fromCache = resolvedCache.current.get(key);
    if (fromCache) { setResolved(fromCache); return () => { active = false; }; }
    setResolved(null);
    void fetch(`${API}/api/library/tracks`, { cache: "no-store" })
      .then(async response => {
        if (!response.ok) throw Error("Biblioteca indisponível");
        return response.json() as Promise<{ tracks: StoredTrack[] }>;
      })
      .then(data => {
        const found = data.tracks.find(t => t.sourceIds?.includes(current.videoId)) ||
          data.tracks.find(t => normalize(t.artist) === normalize(current.artist) && normalize(t.title) === normalize(current.title));
        const info = { key, url: found ? fullApiUrl(found.audioUrl) : null, cover: found?.coverUrl ? fullApiUrl(found.coverUrl) : null };
        resolvedCache.current.set(key, info);
        if (active) setResolved(info);
      })
      .catch(() => {
        const info = { key, url: null, cover: null };
        resolvedCache.current.set(key, info);
        if (active) setResolved(info);
      });
    return () => { active = false; };
  }, [key]); // A chave de identidade contém todos os campos necessários da música.

  // Gerir a troca local sem destruir dois elementos de áudio e sem cortar o crossfade.
  useEffect(() => {
    if (!current || !localUrl) {
      cancelFade();
      audioEls.current.forEach(el => el?.pause());
      return;
    }
    const oldDeck = activeDeck.current;
    const matched = sourceUrls.current.findIndex(url => url === localUrl);
    const target = matched >= 0 ? matched : 1 - oldDeck;
    if (fade.current) cancelFade(target !== fade.current.to);
    const outgoing = audioEls.current[oldDeck];
    const incoming = audioEls.current[target];
    if (!incoming) return;
    if (target !== oldDeck) outgoing?.pause();
    ensureDeck(target, localUrl);
    activeDeck.current = target;
    setReady(incoming.readyState >= HTMLMediaElement.HAVE_METADATA);
    setDuration(Number.isFinite(incoming.duration) ? incoming.duration : 0);
    setProgress(incoming.currentTime || 0);
    applyVolumes();
    if (playingRef.current && incoming.paused) void incoming.play().catch(() => setMessage("Não foi possível iniciar o áudio local."));
    // Dependências estáveis: a mudança de volume é tratada por efeito separado.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, localUrl]);

  // Pré-carrega a próxima música *local*, quando disponível. Nunca faz crossfade com YouTube.
  useEffect(() => {
    nextLocal.current = null;
    if (!current || !localUrl || crossfadeSeconds === 0 || shuffle || repeat === "one" || tracks.length < 2) return;
    const nextIndex = index + 1 < tracks.length ? index + 1 : repeat === "all" ? 0 : -1;
    if (nextIndex < 0 || nextIndex === index) return;
    const upcoming = tracks[nextIndex];
    if (upcoming.preferredSource === "online") return; // Crossfade apenas entre duas músicas locais.
    const nextKey = trackKey(upcoming);
    let active = true;
    async function preload() {
      let url = upcoming.audioUrl ? fullApiUrl(upcoming.audioUrl) : resolvedCache.current.get(nextKey)?.url || null;
      if (!url && !resolvedCache.current.has(nextKey)) {
        try {
          const response = await fetch(`${API}/api/library/tracks`, { cache: "no-store" });
          if (response.ok) {
            const data = await response.json() as { tracks: StoredTrack[] };
            const found = data.tracks.find(t => t.sourceIds?.includes(upcoming.videoId)) ||
              data.tracks.find(t => normalize(t.artist) === normalize(upcoming.artist) && normalize(t.title) === normalize(upcoming.title));
            url = found ? fullApiUrl(found.audioUrl) : null;
            resolvedCache.current.set(nextKey, { key: nextKey, url, cover: found?.coverUrl ? fullApiUrl(found.coverUrl) : null });
          }
        } catch { /* Offline sem API: aguardar avanço normal. */ }
      }
      if (!active || !url) return;
      const other = 1 - activeDeck.current;
      ensureDeck(other, url);
      nextLocal.current = { index: nextIndex, url };
    }
    void preload();
    return () => { active = false; nextLocal.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, localUrl, tracks, index, crossfadeSeconds, shuffle, repeat]);

  // Iniciar o YouTube somente para faixa online. Não remonta o iframe ao mudar a interface.
  useEffect(() => {
    if (!current || checking || localUrl || !ytMount.current) return;
    if (!/^[a-zA-Z0-9_-]{11}$/.test(current.videoId)) {
      setMessage("O arquivo local não está disponível nesta biblioteca.");
      setPlaying(false);
      return;
    }
    let cancelled = false;
    setReady(false);
    setOnlineFailure(null);
    setRecoveryFor(null);
    const mount = ytMount.current;
    const target = document.createElement("div");
    mount.replaceChildren(target);
    loadYouTubeApi().then(YT => {
      if (cancelled) return;
      yt.current = new YT.Player(target, {
        width: "100%", height: "100%", videoId: current.videoId,
        playerVars: { autoplay: 1, controls: 0, playsinline: 1, origin: window.location.origin },
        events: {
          onReady: (event: { target: YTPlayer }) => {
            if (cancelled) return;
            yt.current = event.target;
            event.target.setVolume(Math.round((muted ? 0 : volume)));
            setReady(true);
          },
          onStateChange: (event: { data: number }) => {
            if (cancelled) return;
            if (event.data === 0) ended.current();
            else if (event.data === 1) { setOnlineFailure(null); setPlaying(true); }
            else if (event.data === 2) setPlaying(false);
          },
          onError: (event: { data: number }) => {
            if (!cancelled) {
              const reason = ytError(event.data);
              setMessage(reason);
              setOnlineFailure({ key, detail: reason });
              setReady(false);
              setPlaying(false);
            }
          },
        },
      });
    }).catch(() => { if (!cancelled) {
      const reason = "Falha ao carregar o player do YouTube.";
      setMessage(reason);
      setOnlineFailure({ key, detail: reason });
      setPlaying(false);
      setReady(false);
    } });
    return () => {
      cancelled = true;
      try { yt.current?.destroy(); } catch { /* iframe encerrado */ }
      yt.current = null;
      mount.replaceChildren();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, checking, localUrl]);

  useEffect(() => {
    if (localUrl) {
      const active = audioEls.current[activeDeck.current];
      if (!active) return;
      if (!isPlaying) { cancelFade(); active.pause(); audioEls.current[1 - activeDeck.current]?.pause(); }
      else if (active.paused) void active.play().catch(() => setMessage("Não foi possível iniciar o áudio local."));
    } else if (ready && yt.current) {
      try { if (isPlaying) yt.current.playVideo(); else yt.current.pauseVideo(); } catch { /* iniciando */ }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying, ready, localUrl]);
  useEffect(() => { applyVolumes(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [volume, muted, localUrl]);
  useEffect(() => {
    if (!current || localUrl || checking) return;
    const timer = window.setInterval(() => {
      try { setProgress(yt.current?.getCurrentTime() || 0); setDuration(yt.current?.getDuration() || 0); }
      catch { /* não iniciado */ }
    }, 600);
    return () => window.clearInterval(timer);
  }, [key, localUrl, checking]);
  useEffect(() => {
    if (!replayToken || !current || replaySeen.current === replayToken) return;
    replaySeen.current = replayToken;
    if (localUrl) {
      const active = audioEls.current[activeDeck.current];
      if (active) { active.currentTime = 0; void active.play().catch(() => setMessage("Falha ao repetir áudio local.")); }
    } else if (yt.current && ready) {
      try { yt.current.seekTo(0, true); yt.current.playVideo(); } catch { /* iniciando */ }
    }
  }, [replayToken, key, localUrl, ready]);
  useEffect(() => {
    const active = audioEls.current[activeDeck.current];
    if (!localUrl || !current || !ready || !active || restoredKey.current !== null) return;
    restoredKey.current = key; // Só retomar a música inicial da sessão, nunca a próxima da fila.
    const saved = readStored<{ videoId: string; seconds: number } | null>(POSITION_KEY, null);
    if (saved?.videoId === current.videoId && saved.seconds > 2 && saved.seconds < active.duration - 2) active.currentTime = saved.seconds;
  }, [key, localUrl, current, ready]);
  useEffect(() => {
    if (!current || !localUrl) return;
    const timer = window.setInterval(() => {
      const seconds = audioEls.current[activeDeck.current]?.currentTime;
      if (typeof seconds === "number" && Number.isFinite(seconds)) {
        try { localStorage.setItem(POSITION_KEY, JSON.stringify({ videoId: current.videoId, seconds })); } catch { }
      }
    }, 2000);
    return () => window.clearInterval(timer);
  }, [current, key, localUrl]);
  useEffect(() => {
    function closeFullscreen(event: KeyboardEvent) {
      if (event.key === "Escape") setNowPlaying(false);
    }
    window.addEventListener("keydown", closeFullscreen);
    return () => window.removeEventListener("keydown", closeFullscreen);
  }, []);
  useEffect(() => () => {
    if (fade.current) window.cancelAnimationFrame(fade.current.raf);
    audioEls.current.forEach(el => el?.pause());
    void audioContext.current?.close();
  }, []);

  function onDeckMetadata(deck: number) {
    if (!localUrl || deck !== activeDeck.current) return;
    const active = audioEls.current[deck];
    if (!active) return;
    setReady(true);
    setDuration(Number.isFinite(active.duration) ? active.duration : 0);
  }
  function onDeckTimeUpdate(deck: number) {
    if (deck !== activeDeck.current) return;
    const active = audioEls.current[deck];
    if (!active) return;
    setProgress(active.currentTime);
    maybeCrossfade(active, deck);
  }
  function onDeckEnded(deck: number) {
    if (deck !== activeDeck.current) return;
    if (fade.current) finishFade();
    else ended.current();
  }
  function seek(seconds: number) {
    if (localUrl) {
      cancelFade();
      const active = audioEls.current[activeDeck.current];
      if (active) active.currentTime = seconds;
    } else try { yt.current?.seekTo(seconds, true); } catch { /* indisponível */ }
    setProgress(seconds);
  }
  async function activateEqualizer() {
    if (!localUrl) { setMessage("Equalizador disponível somente para arquivos offline."); return; }
    try {
      if (!audioContext.current) {
        const context = new AudioContext();
        const bass = context.createBiquadFilter(); bass.type = "lowshelf"; bass.frequency.value = 200;
        const mid = context.createBiquadFilter(); mid.type = "peaking"; mid.frequency.value = 1000; mid.Q.value = 0.8;
        const treble = context.createBiquadFilter(); treble.type = "highshelf"; treble.frequency.value = 4500;
        bass.connect(mid); mid.connect(treble); treble.connect(context.destination);
        audioSources.current = audioEls.current.filter((el): el is HTMLAudioElement => !!el).map(el => {
          const source = context.createMediaElementSource(el);
          source.connect(bass);
          return source;
        });
        audioContext.current = context;
        filters.current = [bass, mid, treble];
      }
      await audioContext.current.resume();
      filters.current.forEach((f, i) => { f.gain.value = eq[i] || 0; });
    } catch { setMessage("Falha no equalizador. Verifica se o backend permite áudio via CORS."); }
  }
  function adjustEq(i: number, gain: number) {
    setEq(old => old.map((value, j) => i === j ? gain : value));
    if (filters.current[i]) filters.current[i].gain.value = gain;
  }
  async function loadLyrics(file?: File) {
    if (!file || !current || file.size > 250_000 || !file.name.toLowerCase().endsWith(".lrc")) {
      setMessage("Escolhe um arquivo .lrc de até 250 KB."); return;
    }
    const text = await file.text();
    try { localStorage.setItem(LYRIC_KEY + current.videoId, text); }
    catch { setMessage("Não foi possível salvar a letra neste navegador."); return; }
    const lines = parseLrc(text);
    setLyrics(lines);
    setMessage(`Letra importada: ${lines.length} linhas sincronizadas.`);
  }
  if (!current) return null;

  const playableOnline = /^[a-zA-Z0-9_-]{11}$/.test(current.videoId);
  // BZTUNE_V1441: caminho para playlists de musicas locais.
  const localTrackId = current.videoId.startsWith("library:") ? current.videoId.slice("library:".length) : null;
  const previewStart = Math.max(0, Math.min(Math.max(0, index - 2), Math.max(0, tracks.length - 5)));
  const previewTracks = tracks.length > 1 ? tracks.slice(previewStart, previewStart + 5) : [];
  function previewCover(track: PlayerTrack) {
    if (track.cover) return track.cover;
    if (/^[a-zA-Z0-9_-]{11}$/.test(track.videoId)) return `https://i.ytimg.com/vi/${track.videoId}/mqdefault.jpg`;
    return null;
  }
  function chooseAlternative(replacement: PlayerTrack) {
    if (!current || !/^[a-zA-Z0-9_-]{11}$/.test(replacement.videoId)) return;
    const updated = tracks.map((song, i) => i === index ? replacement : song);
    setOnlineFailure(null);
    setRecoveryFor(null);
    setMessage("");
    // Não desloca a posição se a alternativa já estiver na fila.
    const alreadyInQueue = tracks.findIndex((song, i) => i !== index && song.videoId === replacement.videoId);
    if (alreadyInQueue >= 0) jumpTo(alreadyInQueue);
    else playTrack(replacement, updated);
  }
  function openFull() { setMini(true); setNowPlaying(true); setShowQueue(true); }
  function closeFull() { setNowPlaying(false); setMini(true); }
  function toggleExtra(name: "eq" | "lyrics" | "history" | "crossfade") {
    setShowExtras(old => old === name ? "none" : name);
    if (name === "eq" && trackIsLocal) void activateEqualizer();
  }
  const playingTitle = current.title;
  const sourceName = trackIsLocal ? "ÁUDIO OFFLINE" : "YOUTUBE · PLAYER INCORPORADO";

  return <section className={`dv-player dv-v13-player bz32-player ${nowPlaying ? "dv-v13-full bz32-full" : "dv-v131-mini bz32-mini"} ${!trackIsLocal && !checking ? "dv-v131-online bz32-online" : ""}`}
    aria-label="Reprodutor BZtune">
    <div className="dv-v13-backdrop bz32-backdrop" style={coverUrl ? { backgroundImage: `url(${coverUrl})` } : undefined} aria-hidden="true" />
    <div className={`bz32-shell ${showQueue ? "" : "bz32-no-queue"}`}>
      <div className="dv-v13-media bz32-media">
        <div className="bz32-media-surface">
          {trackIsLocal ? <div className="dv-player-video dv-v13-artwork bz32-artwork">
            {coverUrl && !coverBroken ? <img src={coverUrl} alt={`Capa de ${current.album || playingTitle}`} onError={() => setCoverBroken(true)} />
              : <div className="dv-v13-fallback"><Music2 size={56} /><span>ÁUDIO OFFLINE</span></div>}
          </div> : checking ? <div className="dv-player-video dv-v13-loading bz32-loading">Verificando biblioteca local...</div>
            : <div className="dv-player-video dv-v13-video bz32-video" ref={ytMount} aria-label="Vídeo do YouTube" />}
          {!trackIsLocal && !checking && recoveryOpen && <OnlinePlaybackRecovery key={key} videoId={current.videoId}
            title={current.title} artist={current.artist} reason={failedOnline || "O vídeo não está funcionando no player incorporado?"}
            onClose={() => { setOnlineFailure(null); setRecoveryFor(null); }} onChoose={chooseAlternative} />}
        </div>
        <div className="bz32-media-footer">
          <div className="bz32-media-label"><span className="bz32-signal" />{sourceName}</div>
          {previewTracks.length > 0 && <div className="bz32-previews" aria-label="Selecionar música da fila">
            {previewTracks.map((track, i) => <button type="button" key={`${track.videoId}-${previewStart + i}`} onClick={() => jumpTo(previewStart + i)}
              className={previewStart + i === index ? "bz32-preview-active" : ""} title={`${track.title} — ${track.artist}`} aria-label={`Tocar ${track.title}`}>
              {previewCover(track) ? <img src={previewCover(track)!} alt="" loading="lazy" /> : <Music2 size={22} />}
            </button>)}
          </div>}
          {current.album && <div className="bz32-album-card">
            {coverUrl && !coverBroken ? <img src={coverUrl} alt="" /> : <Music2 size={28} />}
            <div><strong>{current.album}</strong><span>{current.artist} · Álbum da faixa atual</span></div>
          </div>}
        </div>
      </div>
      <div className="dv-player-panel dv-v13-panel bz32-center">
        <div className="bz32-header">
          <span>AGORA TOCANDO</span>
          <div className="bz32-header-actions">
            <button type="button" onClick={closeFull} aria-label="Voltar ao mini-player" title="Voltar ao mini-player"><Minimize2 size={18} /></button>
            <button type="button" onClick={() => { setNowPlaying(false); clearQueue(); }} aria-label="Fechar player" title="Fechar player"><X size={18} /></button>
          </div>
        </div>
        <div className="bz32-track"><h2 title={playingTitle}>{playingTitle}</h2><p>{current.artist}{current.album ? ` · ${current.album}` : ""}</p></div>
        <div className="bz32-source"><span className="bz32-source-mark">{trackIsLocal ? "●" : "▶"}</span>{sourceName}</div>
        <div className="bz32-play-controls" aria-label="Controles de reprodução">
          <button type="button" className={shuffle ? "bz32-on" : ""} onClick={toggleShuffle} aria-pressed={shuffle} title="Aleatório" aria-label="Aleatório"><Shuffle size={20} /></button>
          <button type="button" onClick={previous} title="Anterior" aria-label="Anterior"><SkipBack size={24} /></button>
          <button type="button" className="bz32-main-play" onClick={() => setPlaying(!isPlaying)} disabled={!ready} aria-label={isPlaying ? "Pausar" : "Reproduzir"}>
            {isPlaying ? <Pause size={29} /> : <Play size={29} />}
          </button>
          <button type="button" onClick={next} disabled={tracks.length <= 1 && repeat !== "all"} title="Próxima" aria-label="Próxima"><SkipForward size={24} /></button>
          <button type="button" onClick={cycleRepeat} className={repeat === "off" ? "" : "bz32-on"}
            title={repeat === "off" ? "Repetição desligada" : repeat === "all" ? "Repetir fila" : "Repetir uma faixa"} aria-label="Modo de repetição">
            {repeat === "one" ? <Repeat1 size={20} /> : <Repeat size={20} />}
          </button>
        </div>
        <div className="bz32-progress" aria-label="Progresso da música">
          <span>{formatTime(progress)}</span>
          <input type="range" min={0} max={duration || 1} step={1} value={Math.min(progress, duration || 1)} aria-label="Posição da música" onChange={(e: ChangeEvent<HTMLInputElement>) => seek(Number(e.target.value))} />
          <span>{formatTime(duration)}</span>
        </div>
        <div className="bz32-volume" aria-label="Volume global">
          <button type="button" onClick={toggleMute} title="Silenciar ou ativar o som (M)" aria-label={muted ? "Ativar som" : "Silenciar"}>{muted || volume === 0 ? <VolumeX size={19} /> : <Volume2 size={19} />}</button>
          <input type="range" min={0} max={100} step={1} value={volume} aria-label="Volume" onChange={(e: ChangeEvent<HTMLInputElement>) => setVolume(Number(e.target.value))} />
          <span>{muted ? "Mudo" : `${volume}%`}</span>
        </div>
        <div className="bz32-shortcuts" aria-label="Ferramentas da música">
          <button type="button" className={showExtras === "lyrics" ? "bz32-on" : ""} onClick={() => toggleExtra("lyrics")}><ScrollText size={18} /><span>Letra</span></button>
          <button type="button" className={showQueue ? "bz32-on" : ""} onClick={() => setShowQueue(v => !v)} aria-expanded={showQueue}><ListMusic size={18} /><span>Fila</span></button>
          <div className="bz32-integrated-button">
            {playableOnline
              ? <AddToPlaylistButton artist={current.artist} title={current.title} kind="track" videoId={current.videoId} album={current.album ?? ""} cover={coverUrl} />
              : localTrackId
                ? <LocalTrackPlaylistButton trackId={localTrackId} title={current.title} artist={current.artist} />
                : <span className="dv-pl-add"><button type="button" className="dv-pl-add-trigger" disabled title="Arquivo sem ID na biblioteca" aria-label="Playlist indisponivel: arquivo sem ID"><ListMusic size={17} /></button></span>}
            <span>Playlist</span>
          </div>
          <div className="bz32-integrated-button">
            {trackIsLocal || !!localTrackId
              ? <span className="dv-catalog-download"><button type="button" disabled title="Esta musica ja esta salva na biblioteca offline" aria-label="Musica ja baixada"><CheckCircle2 size={17} /></button></span>
              : playableOnline
                ? <CatalogDownloadButton artist={current.artist} title={current.title} kind="track" />
                : <span className="dv-catalog-download"><button type="button" disabled title="Esta faixa nao tem origem online para baixar" aria-label="Download indisponivel"><CheckCircle2 size={17} /></button></span>}
            <span>{trackIsLocal || !!localTrackId ? "Baixada" : "Baixar"}</span>
          </div>
          <button type="button" className={showExtras === "eq" ? "bz32-on" : ""} onClick={() => toggleExtra("eq")}><SlidersHorizontal size={18} /><span>Equalizador</span></button>
          <button type="button" className={showExtras === "history" ? "bz32-on" : ""} onClick={() => toggleExtra("history")}><History size={18} /><span>Histórico</span></button>
          <button type="button" className={showExtras === "crossfade" ? "bz32-on" : ""} onClick={() => toggleExtra("crossfade")}><Music2 size={18} /><span>Crossfade</span></button>
        </div>
        {showExtras !== "none" && <div className="bz32-extras">
          {showExtras === "crossfade" && <div className="bz32-extra-inner">
            <strong>Crossfade entre músicas locais</strong>
            <div className="bz32-setting"><label htmlFor="bz32-crossfade">Duração: {crossfadeSeconds ? `${crossfadeSeconds}s` : "desativado"}</label>
              <input id="bz32-crossfade" type="range" min={0} max={10} step={1} value={crossfadeSeconds} onChange={(e: ChangeEvent<HTMLInputElement>) => { cancelFade(); setCrossfadeSeconds(Number(e.target.value)); }} /></div>
            <small>Somente entre arquivos locais consecutivos. Desativado com Shuffle ou Repeat One.</small>
          </div>}
          {showExtras === "eq" && <div className="bz32-extra-inner"><strong>Equalizador · áudio offline</strong>
            {(["Graves", "Médios", "Agudos"] as const).map((title, i) => <label className="bz32-eq-line" key={title}>{title}<input type="range" min={-12} max={12} step={1} value={eq[i]} onChange={(e: ChangeEvent<HTMLInputElement>) => adjustEq(i, Number(e.target.value))} disabled={!trackIsLocal} /><span>{eq[i] > 0 ? "+" : ""}{eq[i]} dB</span></label>)}
            <button type="button" onClick={() => void activateEqualizer()} disabled={!trackIsLocal}>Ativar equalizador</button>
          </div>}
          {showExtras === "lyrics" && <div className="bz32-extra-inner"><strong>Letras sincronizadas (.lrc)</strong>
            <input ref={lrcInput} type="file" accept=".lrc,text/plain" hidden onChange={(e: ChangeEvent<HTMLInputElement>) => { void loadLyrics(e.target.files?.[0]); e.target.value = ""; }} />
            <button type="button" onClick={() => lrcInput.current?.click()}><Upload size={14} /> Importar LRC</button>
            {lyrics.length ? <div className="bz32-lyrics">{lyrics.map((line, i) => <p key={i} className={i === activeLine ? "active" : ""}>{line.text || "♪"}</p>)}</div> : <p>Importa um arquivo .lrc que tenhas permissão de usar.</p>}
          </div>}
          {showExtras === "history" && <div className="bz32-extra-inner"><strong>Ouvidas recentemente</strong>
            {historyItems.length ? historyItems.slice(0, 12).map(h => <div className="bz32-history" key={h.videoId}>{h.title}<small> · {h.artist}</small></div>) : <p>Ainda sem histórico.</p>}
            <button type="button" onClick={() => { setHistoryItems([]); localStorage.removeItem(HISTORY_KEY); }}>Limpar histórico</button>
          </div>}
        </div>}
        {!trackIsLocal && !checking && playableOnline && <button type="button" className="bz-online-help" onClick={() => { setNowPlaying(true); setMini(true); setRecoveryFor(key); }}>
          Vídeo não reproduz? Ver alternativas
        </button>}
        {message && <p className="dv-player-error bz32-error" role="status">{message} {!trackIsLocal && playableOnline && <a href={`https://www.youtube.com/watch?v=${encodeURIComponent(current.videoId)}`} target="_blank" rel="noopener noreferrer">Abrir no YouTube</a>}</p>}
        <p className="bz32-key-help">Espaço: Play/Pause · Ctrl + ←/→: anterior/próxima · M: mute · Esc: minimizar</p>
      </div>
      {showQueue && <aside className="bz32-queue" aria-label="Fila de reprodução">
        <div className="bz32-queue-heading"><div><strong>Fila de reprodução</strong><span>{tracks.length} música(s)</span></div>
          <button type="button" title="Ocultar fila" aria-label="Ocultar fila" onClick={() => setShowQueue(false)}><X size={18} /></button></div>
        <p className="bz32-queue-hint">Arrasta para mudar a ordem. As setas também funcionam.</p>
        <div className="bz32-queue-scroll">
          {tracks.map((track, i) => <div key={`${track.videoId}-${track.audioUrl || ""}-${i}`}
            className={`bz32-queue-track ${i === index ? "bz32-queue-current" : ""} ${dragged === i ? "bz32-dragging" : ""}`}
            draggable onDragStart={(e: DragEvent<HTMLDivElement>) => { setDragged(i); e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", String(i)); }}
            onDragOver={(e: DragEvent<HTMLDivElement>) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; }}
            onDrop={(e: DragEvent<HTMLDivElement>) => { e.preventDefault(); const raw = e.dataTransfer.getData("text/plain"); if (raw !== "") reorderQueue(Number(raw), i); setDragged(null); }}
            onDragEnd={() => setDragged(null)}>
            <GripVertical size={15} aria-hidden="true" className="bz32-grip" />
            <span className="bz32-queue-number">{i + 1}</span>
            {previewCover(track) ? <img src={previewCover(track)!} alt="" loading="lazy" /> : <span className="bz32-queue-no-cover"><Music2 size={18} /></span>}
            <button type="button" className="bz32-queue-name" onClick={() => jumpTo(i)} aria-current={i === index ? "true" : undefined} title={`Tocar ${track.title}`}>
              <strong>{track.title}</strong><span>{track.artist}</span>
            </button>
            <div className="bz32-queue-actions">
              <button type="button" title="Subir" aria-label={`Subir ${track.title}`} disabled={i === 0} onClick={() => reorderQueue(i, i - 1)}><ArrowUp size={14} /></button>
              <button type="button" title="Descer" aria-label={`Descer ${track.title}`} disabled={i === tracks.length - 1} onClick={() => reorderQueue(i, i + 1)}><ArrowDown size={14} /></button>
              <button type="button" title="Remover da fila" aria-label={`Remover ${track.title}`} onClick={() => removeFromQueue(i)}><X size={14} /></button>
            </div>
          </div>)}
        </div>
      </aside>}
    </div>
    <div className="dv-v13-hidden-audio" aria-hidden="true">
      {[0, 1].map(deck => <audio key={deck} ref={(el: HTMLAudioElement | null) => { audioEls.current[deck] = el; }} crossOrigin="anonymous" preload="metadata" loop={repeat === "one"}
        onLoadedMetadata={() => onDeckMetadata(deck)}
        onCanPlay={() => { if (deck === activeDeck.current && playingRef.current && audioEls.current[deck]?.paused) void audioEls.current[deck]?.play().catch(() => setMessage("Falha no arquivo local.")); }}
        onTimeUpdate={() => onDeckTimeUpdate(deck)}
        onEnded={() => onDeckEnded(deck)}
        onError={() => { if (deck === activeDeck.current && trackIsLocal) { setReady(false); setMessage("Falha ao carregar áudio local. Confere se o Flask está aberto."); } }} />)}
    </div>
    {!nowPlaying && <div className="dv-v131-minibar bz32-minibar" aria-label="Mini-player do BZtune">
      <div className="bz32-mini-song">
        <button type="button" onClick={openFull} title="Abrir Agora tocando" aria-label="Abrir Agora tocando">
          {coverUrl && !coverBroken ? <img src={coverUrl} alt="" onError={() => setCoverBroken(true)} /> : <Music2 size={21} />}</button>
        <div><strong title={playingTitle}>{playingTitle}</strong><span title={current.artist}>{current.artist}{current.album ? ` · ${current.album}` : ""}</span></div>
      </div>
      <div className="bz32-mini-middle">
        <div className="bz32-mini-buttons">
          <button type="button" onClick={previous} aria-label="Anterior" title="Anterior"><SkipBack size={20} /></button>
          <button type="button" className="bz32-mini-play" onClick={() => setPlaying(!isPlaying)} disabled={!ready} aria-label={isPlaying ? "Pausar" : "Reproduzir"}>{isPlaying ? <Pause size={21} /> : <Play size={21} />}</button>
          <button type="button" onClick={next} disabled={tracks.length <= 1 && repeat !== "all"} aria-label="Próxima"><SkipForward size={20} /></button>
        </div>
        <div className="bz32-mini-progress"><span>{formatTime(progress)}</span>
          <input type="range" min={0} max={duration || 1} step={1} value={Math.min(progress, duration || 1)} aria-label="Posição da música" onChange={(e: ChangeEvent<HTMLInputElement>) => seek(Number(e.target.value))} />
          <span>{formatTime(duration)}</span>
        </div>
      </div>
      <div className="bz32-mini-tools">
        <button type="button" onClick={toggleShuffle} aria-pressed={shuffle} className={shuffle ? "bz32-on" : ""} aria-label="Aleatório" title="Aleatório"><Shuffle size={18} /></button>
        <button type="button" onClick={cycleRepeat} className={repeat === "off" ? "" : "bz32-on"} aria-label="Modo de repetição" title={repeat === "off" ? "Repetição desligada" : repeat === "one" ? "Repetir faixa" : "Repetir fila"}>{repeat === "one" ? <Repeat1 size={18} /> : <Repeat size={18} />}</button>
        <button type="button" onClick={toggleMute} aria-label={muted ? "Ativar som" : "Silenciar"}>{muted || volume === 0 ? <VolumeX size={18} /> : <Volume2 size={18} />}</button>
        <input type="range" min={0} max={100} value={volume} aria-label="Volume" onChange={(e: ChangeEvent<HTMLInputElement>) => setVolume(Number(e.target.value))} />
        <span className="bz32-mini-volume-label">{muted ? "Mudo" : `${volume}%`}</span>
        <button type="button" onClick={() => { openFull(); setShowQueue(true); }} aria-label="Abrir fila" title="Fila"><ListMusic size={19} /></button>
        <button type="button" onClick={openFull} aria-label="Expandir player" title="Expandir"><Maximize2 size={19} /></button>
        <button type="button" onClick={() => { setNowPlaying(false); clearQueue(); }} aria-label="Fechar player" title="Fechar"><X size={18} /></button>
      </div>
      {!trackIsLocal && playableOnline && <button type="button" className="bz-online-mini-help" onClick={() => { setNowPlaying(true); setMini(true); setRecoveryFor(key); }}>Vídeo não funciona? Alternativas</button>}
      {message && <span className="bz32-mini-error" role="status">{message}</span>}
    </div>}
  </section>;
}
