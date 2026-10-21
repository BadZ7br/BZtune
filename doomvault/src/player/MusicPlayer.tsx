import { activeLyricLine, isLyricDelay, lyricDelayKey, LYRIC_DELAY_STEP_MS, MAX_LYRIC_DELAY_MS, fetchLyrics, isLyricsResult, LYRICS_CACHE_KEY, parseLrc } from "../services/lyrics";
import type { LyricLine } from "../services/lyrics";
import QueuePicker from "./QueuePicker";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent, DragEvent } from "react";
import {
  ArrowDown, ArrowUp, GripVertical, History, ListMusic,
  Maximize2, Minimize2, Music2, Pause, Play, Repeat, Repeat1, ScrollText, MoreHorizontal, RefreshCw, LoaderCircle,
  Shuffle, SkipBack, SkipForward, SlidersHorizontal, Upload, Volume2, VolumeX, CheckCircle2, X,
} from "lucide-react";
import { usePlayer } from "./PlayerContext";
import type { PlayerTrack } from "./PlayerContext";
import AddToPlaylistButton from "../playlists/AddToPlaylistButton";
import CatalogDownloadButton from "../library/CatalogDownloadButton";
import LocalTrackPlaylistButton from "./LocalTrackPlaylistButton";
import OnlinePlaybackRecovery from "./OnlinePlaybackRecovery";
import { useLibraryAvailability, matchLocalTracks, confirmedLocalMatch } from "../library/library-availability";
import { readStorage, removeStorage, writeStorage } from "../services/storage";
const API = "http://127.0.0.1:5000";
const POSITION_KEY = "doomvault-resume-position-v11";
const HISTORY_KEY = "doomvault-listening-history-v11";
const LYRICS_SOURCE_KEY = "bztune-lyrics-source-v1:";
const LYRIC_KEY = "doomvault-lrc-v11:";
const CROSSFADE_KEY = "bztune-crossfade-v13";
type ListenItem = { videoId: string; title: string; artist: string; playedAt: number };
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
    const src = "https://www.youtube.com/iframe_api";
    let tag = document.querySelector<HTMLScriptElement>(`script[src="${src}"]`);
    const finish = (error?: Error) => {
      window.clearTimeout(timer);
      if (window.onYouTubeIframeAPIReady === onReady) window.onYouTubeIframeAPIReady = previous;
      tag?.removeEventListener("error", onError);
      if (error) { tag?.remove(); reject(error); }
      else resolve(window.YT!);
    };
    const onReady = () => {
      try { previous?.(); } finally {
        finish(window.YT?.Player ? undefined : new Error("API do YouTube não carregou"));
      }
    };
    const onError = () => finish(new Error("Não foi possível carregar o player do YouTube"));
    const timer = window.setTimeout(() => finish(new Error("O YouTube não respondeu em 15 segundos")), 15000);
    window.onYouTubeIframeAPIReady = onReady;
    if (!tag) { tag = document.createElement("script"); tag.src = src; document.head.appendChild(tag); }
    tag.addEventListener("error", onError, { once: true });
  }).catch((error: unknown) => { ytPromise = null; throw error; });
  return ytPromise;
}
function trackKey(track: PlayerTrack) { return `${track.videoId}|${track.audioUrl ?? ""}|${track.title}|${track.artist}|${track.album ?? ""}|${track.preferredSource ?? "auto"}`; }
function formatTime(seconds: number) {
  if (!Number.isFinite(seconds)) return "0:00";
  const n = Math.max(0, Math.floor(seconds));
  return `${Math.floor(n / 60)}:${String(n % 60).padStart(2, "0")}`;
}
function readStored<T>(key: string, fallback: T): T {
  try { const raw = readStorage(key); return raw ? JSON.parse(raw) as T : fallback; }
  catch { return fallback; }
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
    current, tracks, index, isPlaying, playback, reportPlayback, setPlaying, playTrack, next, previous, jumpTo, reorderQueue, removeFromQueue,
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
  const library = useLibraryAvailability();
  const ended = useRef(onTrackEnded);
  const nextRef = useRef(next);
  const playingRef = useRef(isPlaying);
  const volumeRef = useRef({ volume, muted });
  const queueListRef = useRef(tracks);
  const replaySeen = useRef(0);
  const restoredKey = useRef<string | null>(null);
  const historyKey = useRef<string | null>(null);
  const [reload, setReload] = useState(0);
  const [loadingAudio, setLoadingAudio] = useState(false);
  const [audioFailure, setAudioFailure] = useState("");
  const playbackIdentity = useRef("");
  const [ready, setReady] = useState(false);
  const [positionSample, setPositionSample] = useState<{ token: number; seconds: number } | null>(null);
  const [durationSample, setDurationSample] = useState<{ token: number; seconds: number } | null>(null);
  const clockSession = useRef({ identity: "", token: 0 });
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
  const [lyricsStatus, setLyricsStatus] = useState("");
  const [lyricsBusy, setLyricsBusy] = useState(false);
  const [plainLyrics, setPlainLyrics] = useState("");
  const [lyricsInstrumental, setLyricsInstrumental] = useState(false);
  const [lyricsSource, setLyricsSource] = useState<"manual" | "lrclib">("manual");
  const [timingOverrides, setTimingOverrides] = useState<Record<string, number>>({});
  const [timingFailureKey, setTimingFailureKey] = useState<string | null>(null);
  const [followLyrics, setFollowLyrics] = useState(true);
  const lyricsViewport = useRef<HTMLDivElement>(null);
  const autoLyricsAttempt = useRef<string | null>(null);
  const lyricsRequest = useRef<AbortController | null>(null);
  const lyricsIdentity = useRef("");
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
  lyricsIdentity.current = key;
  const failedOnline = onlineFailure?.key === key ? onlineFailure.detail : "";
  const recoveryOpen = recoveryFor === key || !!failedOnline;
  const forceOnline = current?.preferredSource === "online";
  const match = current && !forceOnline && !current.audioUrl && library.status === "ready"
    ? confirmedLocalMatch(matchLocalTracks(current, library.tracks)) : null;
  const localUrl = forceOnline ? null : current?.audioUrl ? fullApiUrl(current.audioUrl)
    : match ? fullApiUrl(match.track.audioUrl) : null;
  const checking = !!current && !forceOnline && !current.audioUrl && library.status === "loading";
  const coverUrl = current?.cover || (match?.track.coverUrl ? fullApiUrl(match.track.coverUrl) : null);
  playbackIdentity.current = key + "|" + (localUrl || "online") + "|" + reload;
  // Each activation gets a new clock, including A → B → A and source/retry changes.
  if (clockSession.current.identity !== playbackIdentity.current) {
    clockSession.current = { identity: playbackIdentity.current, token: clockSession.current.token + 1 };
  }
  const clockToken = clockSession.current.token;
  const progress = positionSample?.token === clockToken ? positionSample.seconds : 0;
  const duration = durationSample?.token === clockToken ? durationSample.seconds : 0;
  const durationTrack = durationSample?.token === clockToken ? key : "";
  function setProgress(seconds: number) {
    if (clockSession.current.token !== clockToken || !Number.isFinite(seconds) || seconds < 0) return;
    setPositionSample(previous => previous?.token === clockToken && previous.seconds === seconds ? previous : { token: clockToken, seconds });
  }
  function updateDuration(seconds: number) {
    if (clockSession.current.token !== clockToken || !Number.isFinite(seconds) || seconds < 0) return;
    setDurationSample(previous => previous?.token === clockToken && previous.seconds === seconds ? previous : { token: clockToken, seconds });
  }
  const timingKey = current ? lyricDelayKey(current.videoId, localUrl ? "local" : "online", lyricsSource) : "";
  const savedDelay = useMemo(() => {
    const value: unknown = readStored<unknown>(timingKey, 0);
    return isLyricDelay(value) ? value : 0;
  }, [timingKey]);
  const lyricsDelayMs = timingOverrides[timingKey] ?? savedDelay;
  const activeLine = activeLyricLine(lyrics, progress, lyricsDelayMs);
  function adjustLyricsDelay(delayMs: number) {
    if (!timingKey || !lyrics.length || !isLyricDelay(delayMs)) return;
    setTimingOverrides(previous => ({ ...previous, [timingKey]: delayMs }));
    const saved = writeStorage(timingKey, JSON.stringify(delayMs));
    setTimingFailureKey(saved ? null : timingKey);
  }
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
    if (sourceUrls.current[deck] !== url || el.getAttribute("src") !== url) {
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
    if (incoming) { setProgress(incoming.currentTime); updateDuration(Number.isFinite(incoming.duration) ? incoming.duration : 0); }
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

  useEffect(() => {
    function syncCrossfade(event: Event) {
      const seconds = (event as CustomEvent<number>).detail;
      if (Number.isFinite(seconds) && seconds >= 0 && seconds <= 10) {
        cancelFade();
        setCrossfadeSeconds(seconds);
      }
    }
    window.addEventListener("bztune-crossfade-change", syncCrossfade);
    return () => window.removeEventListener("bztune-crossfade-change", syncCrossfade);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Preservar funcionalidades já existentes: histórico, equalizador, mini-player e letras LRC.
  useEffect(() => { try { localStorage.setItem("bztune-mini-v131", JSON.stringify(mini)); } catch { } }, [mini]);
  useEffect(() => { try { localStorage.setItem("doomvault-eq-v11", JSON.stringify(eq)); } catch { } }, [eq]);
  useEffect(() => { try { localStorage.setItem(CROSSFADE_KEY, JSON.stringify(crossfadeSeconds)); } catch { } }, [crossfadeSeconds]);
  function displaySavedLyrics(source?: "manual" | "lrclib") {
    if (!current) { setLyrics([]); setPlainLyrics(""); return; }
    const manual = readStorage(LYRIC_KEY + current.videoId);
    const manualLines = parseLrc(manual || "");
    let cached: unknown = null;
    try { cached = JSON.parse(readStorage(LYRICS_CACHE_KEY + current.videoId) || "null"); } catch { /* cache inválido */ }
    const selected = source || readStorage(LYRICS_SOURCE_KEY + current.videoId);
    setLyricsInstrumental(false);
    if (isLyricsResult(cached) && (selected === "lrclib" || !manualLines.length)) {
      setLyrics(parseLrc(cached.syncedLyrics)); setPlainLyrics(cached.plainLyrics); setLyricsInstrumental(cached.instrumental); setLyricsSource("lrclib");
      setLyricsStatus(cached.instrumental ? "Faixa instrumental segundo o LRCLIB." : "Letra do LRCLIB · salva neste aparelho.");
    } else {
      setLyrics(manualLines); setPlainLyrics(""); setLyricsSource("manual");
      setLyricsStatus(manualLines.length ? "Letra importada de arquivo LRC." : "Nenhuma letra salva para esta faixa.");
    }
  }
  function chooseLyricsSource(source: "manual" | "lrclib") {
    if (!current) return;
    lyricsRequest.current?.abort(); setLyricsBusy(false);
    displaySavedLyrics(source);
    try { localStorage.setItem(LYRICS_SOURCE_KEY + current.videoId, source); }
    catch { setLyricsStatus("Fonte selecionada nesta sessão; não foi possível salvar a preferência."); }
  }
  useEffect(() => {
    lyricsRequest.current?.abort(); setLyricsBusy(false);
    displaySavedLyrics(); setFollowLyrics(true);
    return () => { lyricsRequest.current?.abort(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  useEffect(() => {
    if (!nowPlaying) { autoLyricsAttempt.current = null; return; }
    if (!current || autoLyricsAttempt.current === key) return;
    autoLyricsAttempt.current = key;
    if (parseLrc(readStorage(LYRIC_KEY + current.videoId) || "").length) return;
    try {
      const cached: unknown = JSON.parse(readStorage(LYRICS_CACHE_KEY + current.videoId) || "null");
      if (isLyricsResult(cached)) return;
    } catch { /* buscar novamente se o cache estiver inválido */ }
    void searchLyrics();
    // A abertura e a identidade da faixa iniciam a busca, nunca cada atualização do relógio.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nowPlaying, key]);
  useEffect(() => {
    const viewport = lyricsViewport.current;
    if (!nowPlaying || showExtras !== "lyrics" || !followLyrics || !viewport) return;
    const line = viewport.querySelector<HTMLElement>(".bz-lyric-active");
    if (!line) return;
    const top = line.getBoundingClientRect().top - viewport.getBoundingClientRect().top + viewport.scrollTop - viewport.clientHeight * .4;
    viewport.scrollTo({ top: Math.max(0, top), behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
  }, [activeLine, followLyrics, nowPlaying, showExtras, lyrics]);
  useEffect(() => {
    if (!current || playback.track !== current || !playback.playing || historyKey.current === key) return;
    historyKey.current = key;
    const entry: ListenItem = { videoId: current.videoId, title: current.title, artist: current.artist, playedAt: Date.now() };
    setHistoryItems(old => {
      const updated = [entry, ...old.filter(t => t.videoId !== entry.videoId)].slice(0, 50);
      try { localStorage.setItem(HISTORY_KEY, JSON.stringify(updated)); } catch { }
      return updated;
    });
  }, [key, playback, current]);

  useEffect(() => {
    reportPlayback(current, false, localUrl ? "local" : "online");
    setCoverBroken(false);
    setMessage("");
    setAudioFailure("");
  }, [key, localUrl, reload]);

  function failLocal(reason: string) {
    cancelFade();
    audioEls.current.forEach(element => element?.pause());
    reportPlayback(current, false, "local");
    setReady(false);
    setLoadingAudio(false);
    setPlaying(false);
    setAudioFailure(reason);
  }
  function failOnline(reason: string) {
    try { yt.current?.pauseVideo(); } catch { /* player encerrado */ }
    reportPlayback(current, false, "online");
    setLoadingAudio(false);
    setMessage(reason);
    setOnlineFailure({ key, detail: reason });
    setReady(false);
    setPlaying(false);
  }
  function playLocal(element: HTMLAudioElement) {
    const identity = playbackIdentity.current;
    void element.play().catch(error => {
      if (identity !== playbackIdentity.current || element !== audioEls.current[activeDeck.current]) return;
      if (error instanceof DOMException && error.name === "AbortError") return;
      failLocal("Não foi possível iniciar este áudio. Tente carregar a faixa novamente.");
    });
  }
  function retryPlayback() {
    cancelFade();
    audioEls.current.forEach(element => { if (element) { element.pause(); element.removeAttribute("src"); element.load(); } });
    sourceUrls.current = ["", ""];
    setOnlineFailure(null);
    setAudioFailure("");
    setMessage("");
    setReady(false);
    setReload(value => value + 1);
    void library.refresh(true);
    setPlaying(true);
  }

  // Gerir a troca local sem destruir dois elementos de áudio e sem cortar o crossfade.
  useEffect(() => {
    if (!current || !localUrl) {
      cancelFade();
      audioEls.current.forEach(el => el?.pause());
      setReady(false);
      setLoadingAudio(false);
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
    activeDeck.current = target;
    ensureDeck(target, localUrl);
    setReady(incoming.readyState >= HTMLMediaElement.HAVE_METADATA);
    updateDuration(Number.isFinite(incoming.duration) ? incoming.duration : 0);
    setProgress(incoming.currentTime || 0);
    applyVolumes();
    reportPlayback(current, !incoming.paused && incoming.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA, "local");
    setAudioFailure("");
    setLoadingAudio(incoming.readyState < HTMLMediaElement.HAVE_FUTURE_DATA);
    if (playingRef.current && incoming.paused) playLocal(incoming);
    // Dependências estáveis: a mudança de volume é tratada por efeito separado.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, localUrl, reload]);

  useEffect(() => {
    if (!current || !loadingAudio || audioFailure) return;
    const timer = window.setTimeout(() => localUrl
      ? failLocal("O áudio não ficou pronto em 15 segundos. Tente carregar a faixa novamente.")
      : failOnline("O player online não respondeu em 15 segundos. Tente novamente."), 15000);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, localUrl, loadingAudio, audioFailure, reload]);

  // Pré-carrega a próxima música *local*, quando disponível. Nunca faz crossfade com YouTube.
  useEffect(() => {
    nextLocal.current = null;
    if (!current || !localUrl || crossfadeSeconds === 0 || shuffle || repeat === "one" || tracks.length < 2) return;
    const nextIndex = index + 1 < tracks.length ? index + 1 : repeat === "all" ? 0 : -1;
    if (nextIndex < 0 || nextIndex === index) return;
    const upcoming = tracks[nextIndex];
    if (upcoming.preferredSource === "online") return; // Crossfade apenas entre duas músicas locais.
    const match = confirmedLocalMatch(matchLocalTracks(upcoming, library.tracks));
    const url = upcoming.audioUrl ? fullApiUrl(upcoming.audioUrl) : match ? fullApiUrl(match.track.audioUrl) : null;
    if (!url) return;
    const other = 1 - activeDeck.current;
    ensureDeck(other, url);
    nextLocal.current = { index: nextIndex, url };
    return () => { nextLocal.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, localUrl, tracks, index, crossfadeSeconds, shuffle, repeat, library.tracks, reload]);

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
    setLoadingAudio(true);
    setRecoveryFor(null);
    const mount = ytMount.current;
    const target = document.createElement("div");
    mount.replaceChildren(target);
    loadYouTubeApi().then(YT => {
      if (cancelled) return;
      yt.current = new YT.Player(target, {
        width: "100%", height: "100%", videoId: current.videoId,
        playerVars: { autoplay: playingRef.current ? 1 : 0, controls: 0, playsinline: 1, origin: window.location.origin },
        events: {
          onReady: (event: { target: YTPlayer }) => {
            if (cancelled) return;
            yt.current = event.target;
            event.target.setVolume(Math.round((muted ? 0 : volume)));
            setReady(true);
            setLoadingAudio(false);
            if (playingRef.current) event.target.playVideo();
            else event.target.pauseVideo();
          },
          onStateChange: (event: { data: number }) => {
            if (cancelled) return;
            reportPlayback(current, event.data === 1, "online");
            setLoadingAudio(event.data === 3);
            if (event.data === 0) ended.current();
            else if (event.data === 1) { setOnlineFailure(null); setPlaying(true); }
            else if (event.data === 2) setPlaying(false);
          },
          onError: (event: { data: number }) => {
            if (!cancelled) {
              failOnline(ytError(event.data));
            }
          },
        },
      });
    }).catch(() => { if (!cancelled) {
      failOnline("Falha ao carregar o player do YouTube.");
    } });
    return () => {
      cancelled = true;
      try { yt.current?.destroy(); } catch { /* iframe encerrado */ }
      yt.current = null;
      mount.replaceChildren();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, checking, localUrl, reload]);

  useEffect(() => {
    if (localUrl) {
      const active = audioEls.current[activeDeck.current];
      if (!active) return;
      if (!isPlaying) { cancelFade(); active.pause(); audioEls.current[1 - activeDeck.current]?.pause(); }
      else if (active.paused && !audioFailure) playLocal(active);
    } else if (ready && yt.current) {
      try { if (isPlaying) yt.current.playVideo(); else yt.current.pauseVideo(); } catch { /* iniciando */ }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying, ready, localUrl, audioFailure]);
  useEffect(() => { applyVolumes(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [volume, muted, localUrl]);
  useEffect(() => {
    if (!current || checking || !ready) return;
    let timer: number | undefined;
    function sampleClock() {
      if (clockSession.current.token !== clockToken) return;
      try {
        if (localUrl) {
          const active = audioEls.current[activeDeck.current];
          if (!active || active.getAttribute("src") !== localUrl || active.readyState < HTMLMediaElement.HAVE_METADATA) return;
          setProgress(active.currentTime);
          updateDuration(Number.isFinite(active.duration) ? active.duration : 0);
        } else if (yt.current) {
          setProgress(yt.current.getCurrentTime());
          updateDuration(yt.current.getDuration());
        }
      } catch { /* o player pode estar iniciando ou sendo encerrado */ }
    }
    function scheduleClock() {
      window.clearInterval(timer);
      sampleClock();
      // Sample actual media time, without extrapolating across pauses or buffering.
      const reading = nowPlaying && showExtras === "lyrics" && document.visibilityState === "visible";
      timer = window.setInterval(sampleClock, reading ? 100 : 600);
    }
    scheduleClock();
    document.addEventListener("visibilitychange", scheduleClock);
    return () => { window.clearInterval(timer); document.removeEventListener("visibilitychange", scheduleClock); };
    // Clock setters are scoped to this activation, not to a specific render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clockToken, checking, ready, nowPlaying, showExtras]);
  useEffect(() => {
    if (!replayToken || !current || replaySeen.current === replayToken) return;
    replaySeen.current = replayToken;
    if (localUrl) {
      const active = audioEls.current[activeDeck.current];
      if (active) { active.currentTime = 0; playLocal(active); }
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
    if (!active || active.getAttribute("src") !== localUrl) return;
    setReady(true);
    updateDuration(Number.isFinite(active.duration) ? active.duration : 0);
  }
  function onDeckTimeUpdate(deck: number) {
    if (deck !== activeDeck.current) return;
    const active = audioEls.current[deck];
    if (!active || active.getAttribute("src") !== localUrl) return;
    setProgress(active.currentTime);
    maybeCrossfade(active, deck);
  }
  function onDeckEnded(deck: number) {
    if (deck !== activeDeck.current) return;
    reportPlayback(current, false, "local");
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
    } catch { setMessage("Não foi possível iniciar o equalizador para este áudio. Tente carregar a faixa novamente."); }
  }
  function adjustEq(i: number, gain: number) {
    setEq(old => old.map((value, j) => i === j ? gain : value));
    if (filters.current[i]) filters.current[i].gain.value = gain;
  }
  async function searchLyrics() {
    if (!current) return;
    lyricsRequest.current?.abort();
    const controller = new AbortController(); lyricsRequest.current = controller;
    const identity = key; const id = current.videoId;
    setLyricsBusy(true); setLyricsStatus("Buscando no LRCLIB...");
    try {
      const result = await fetchLyrics(current, ready && durationTrack === key ? duration : 0, controller.signal);
      if (controller.signal.aborted || lyricsIdentity.current !== identity) return;
      const lines = parseLrc(result.syncedLyrics);
      if (!result.instrumental && !lines.length && !result.plainLyrics.trim()) throw new Error("A letra recebida não possui conteúdo válido.");
      setLyrics(lines); setPlainLyrics(result.plainLyrics); setLyricsInstrumental(result.instrumental); setLyricsSource("lrclib"); setFollowLyrics(true);
      let saved = true;
      try { localStorage.setItem(LYRICS_CACHE_KEY + id, JSON.stringify(result)); localStorage.setItem(LYRICS_SOURCE_KEY + id, "lrclib"); }
      catch { saved = false; }
      setLyricsStatus((result.instrumental ? "Faixa instrumental segundo o LRCLIB." : lines.length ? "Letra sincronizada · LRCLIB." : "Letra sem sincronização · LRCLIB.") + (saved ? "" : " Não foi possível salvar; disponível apenas nesta sessão."));
    } catch (error) {
      if (!controller.signal.aborted && lyricsIdentity.current === identity) setLyricsStatus(error instanceof Error ? error.message : "Falha ao buscar a letra.");
    } finally {
      if (lyricsRequest.current === controller && lyricsIdentity.current === identity) setLyricsBusy(false);
    }
  }
  async function loadLyrics(file?: File) {
    if (!file || !current || file.size > 250_000 || !file.name.toLowerCase().endsWith(".lrc")) {
      setLyricsStatus("Escolha um arquivo .lrc de até 250 KB."); return;
    }
    lyricsRequest.current?.abort();
    const controller = new AbortController(); lyricsRequest.current = controller;
    setLyricsBusy(false);
    const identity = key; const id = current.videoId;
    try {
      const text = await file.text();
      if (controller.signal.aborted || lyricsIdentity.current !== identity) return;
      const lines = parseLrc(text);
      if (!lines.length) { setLyricsStatus("O arquivo não contém linhas LRC válidas. A letra anterior foi preservada."); return; }
      localStorage.setItem(LYRIC_KEY + id, text);
      try { localStorage.setItem(LYRICS_SOURCE_KEY + id, "manual"); } catch { /* a letra manual permanece salva */ }
      setLyrics(lines); setPlainLyrics(""); setLyricsInstrumental(false); setLyricsSource("manual"); setFollowLyrics(true);
      setLyricsStatus(`Letra importada: ${lines.length} linhas sincronizadas.`);
    } catch {
      if (!controller.signal.aborted && lyricsIdentity.current === identity) setLyricsStatus("Não foi possível ler ou salvar a letra. A letra anterior foi preservada.");
    }
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
    setLoadingAudio(true);
    setRecoveryFor(null);
    setMessage("");
    // Não desloca a posição se a alternativa já estiver na fila.
    const alreadyInQueue = tracks.findIndex((song, i) => i !== index && song.videoId === replacement.videoId);
    if (alreadyInQueue >= 0) jumpTo(alreadyInQueue);
    else playTrack(replacement, updated);
  }
  function openFull() { setMini(true); setNowPlaying(true); setShowQueue(true); setShowExtras("lyrics"); }
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
    <div className={`bz32-shell ${showQueue ? "" : "bz32-no-queue"} ${showExtras === "lyrics" && nowPlaying ? "bz32-reading" : ""}`}>
      <div className="dv-v13-media bz32-media">
        <div className="bz32-media-surface">
          {trackIsLocal ? <div className="dv-player-video dv-v13-artwork bz32-artwork">
            {coverUrl && !coverBroken ? <img src={coverUrl} alt={`Capa de ${current.album || playingTitle}`} onError={() => setCoverBroken(true)} />
              : <div className="dv-v13-fallback"><Music2 size={56} /><span>ÁUDIO OFFLINE</span></div>}
          </div> : checking ? <div className="dv-player-video dv-v13-loading bz32-loading">Verificando biblioteca local...</div>
            : <div className="dv-player-video dv-v13-video bz32-video" ref={ytMount} aria-label="Vídeo do YouTube" />}
          {!trackIsLocal && !checking && recoveryOpen && <OnlinePlaybackRecovery key={key} videoId={current.videoId}
            title={current.title} artist={current.artist} reason={failedOnline || "O vídeo não está funcionando no player incorporado?"}
            onClose={() => { setOnlineFailure(null); setRecoveryFor(null); }} onChoose={chooseAlternative} onRetry={retryPlayback} />}
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
        {showExtras !== "none" && showExtras !== "lyrics" && <div className="bz32-extras">
          {showExtras === "crossfade" && <div className="bz32-extra-inner">
            <strong>Crossfade entre músicas locais</strong>
            <div className="bz32-setting"><label htmlFor="bz32-crossfade">Duração: {crossfadeSeconds ? `${crossfadeSeconds}s` : "desativado"}</label>
              <input id="bz32-crossfade" type="range" min={0} max={10} step={1} value={crossfadeSeconds} onChange={(e: ChangeEvent<HTMLInputElement>) => { const value = Number(e.target.value); cancelFade(); setCrossfadeSeconds(value); window.dispatchEvent(new CustomEvent("bztune-crossfade-change", { detail: value })); }} /></div>
            <small>Somente entre arquivos locais consecutivos. Desativado com Shuffle ou Repeat One.</small>
          </div>}
          {showExtras === "eq" && <div className="bz32-extra-inner"><strong>Equalizador · áudio offline</strong>
            {(["Graves", "Médios", "Agudos"] as const).map((title, i) => <label className="bz32-eq-line" key={title}>{title}<input type="range" min={-12} max={12} step={1} value={eq[i]} onChange={(e: ChangeEvent<HTMLInputElement>) => adjustEq(i, Number(e.target.value))} disabled={!trackIsLocal} /><span>{eq[i] > 0 ? "+" : ""}{eq[i]} dB</span></label>)}
            <button type="button" onClick={() => void activateEqualizer()} disabled={!trackIsLocal}>Ativar equalizador</button>
          </div>}
          {showExtras === "history" && <div className="bz32-extra-inner"><strong>Ouvidas recentemente</strong>
            {historyItems.length ? historyItems.slice(0, 12).map(h => <div className="bz32-history" key={h.videoId}>{h.title}<small> · {h.artist}</small></div>) : <p>Ainda sem histórico.</p>}
            <button type="button" onClick={() => { setHistoryItems([]); removeStorage(HISTORY_KEY); }}>Limpar histórico</button>
          </div>}
        </div>}
        {!trackIsLocal && !checking && playableOnline && <button type="button" className="bz-online-help" onClick={() => { setNowPlaying(true); setMini(true); setRecoveryFor(key); }}>
          Vídeo não reproduz? Ver alternativas
        </button>}
        {(loadingAudio || audioFailure || checking) && <div className="bz32-recovery-status" role={audioFailure ? "alert" : "status"}>
          <span>{audioFailure || (checking ? "Verificando biblioteca local..." : (localUrl ? "Carregando áudio..." : "Carregando player online..."))}</span>
          {audioFailure && <button type="button" onClick={retryPlayback}>Tentar reprodução novamente</button>}
        </div>}
        {message && <p className="dv-player-error bz32-error" role="status">{message} {!trackIsLocal && playableOnline && <a href={`https://www.youtube.com/watch?v=${encodeURIComponent(current.videoId)}`} target="_blank" rel="noopener noreferrer">Abrir no YouTube</a>}</p>}
        <p className="bz32-key-help">Espaço: Play/Pause · Ctrl + ←/→: anterior/próxima · M: mute · Esc: minimizar</p>
      </div>
      {nowPlaying && showExtras === "lyrics" && <section className="bz-lyrics-panel" aria-label="Letras da música">
        <header className="bz-lyrics-heading">
          <div><span className="bz-lyrics-eyebrow">ACOMPANHE A MÚSICA</span><h3>Letra<span className="bz-lyrics-dot">.</span></h3></div>
          <div className="bz-lyrics-toolbar">
            <button type="button" className="bz-lyrics-refresh" disabled={lyricsBusy} onClick={() => void searchLyrics()} aria-label="Buscar no LRCLIB" title="Buscar novamente no LRCLIB">
              {lyricsBusy ? <LoaderCircle size={18} className="bz-lyrics-spinner" /> : <RefreshCw size={18} />}
            </button>
            <details className="bz-lyrics-options" key={key}>
              <summary aria-label="Opções da letra" title="Opções da letra"><MoreHorizontal size={21} /></summary>
              <div className="bz-lyrics-options-menu">
                <button type="button" onClick={() => lrcInput.current?.click()}><Upload size={15} /> Importar LRC</button>
                <button type="button" disabled={!readStorage(LYRIC_KEY + current.videoId)} onClick={() => chooseLyricsSource("manual")}>Usar LRC importado</button>
                <button type="button" disabled={!readStorage(LYRICS_CACHE_KEY + current.videoId)} onClick={() => chooseLyricsSource("lrclib")}>Usar LRCLIB salvo</button>
                <fieldset className="bz-lyrics-timing" disabled={!lyrics.length}>
                  <legend>Sincronização da letra</legend>
                  <div className="bz-lyrics-timing-row">
                    <button type="button" aria-label="Adiantar letra 100 ms" title="Mostrar o verso 100 ms antes" disabled={!lyrics.length || lyricsDelayMs <= -MAX_LYRIC_DELAY_MS} onClick={() => adjustLyricsDelay(lyricsDelayMs - LYRIC_DELAY_STEP_MS)}>−100</button>
                    <output aria-label="Ajuste da letra" aria-live="polite">{lyricsDelayMs > 0 ? "+" : ""}{lyricsDelayMs} ms</output>
                    <button type="button" aria-label="Atrasar letra 100 ms" title="Mostrar o verso 100 ms depois" disabled={!lyrics.length || lyricsDelayMs >= MAX_LYRIC_DELAY_MS} onClick={() => adjustLyricsDelay(lyricsDelayMs + LYRIC_DELAY_STEP_MS)}>+100</button>
                  </div>
                  <button type="button" disabled={!lyrics.length || lyricsDelayMs === 0} onClick={() => adjustLyricsDelay(0)}>Restaurar sincronização</button>
                  <p>{lyrics.length ? "Negativo adianta · positivo atrasa. O áudio permanece na mesma posição." : "Disponível para letras sincronizadas."}</p>
                  {timingFailureKey === timingKey && <p role="status">Ajuste aplicado nesta sessão. Não foi possível salvar; use o aviso de armazenamento para tentar novamente.</p>}
                </fieldset>
                <small>A busca envia título, artista, álbum e duração ao LRCLIB. Letras salvas ficam disponíveis offline.</small>
              </div>
            </details>
          </div>
        </header>
        <input ref={lrcInput} type="file" accept=".lrc,text/plain" hidden onChange={(e: ChangeEvent<HTMLInputElement>) => { void loadLyrics(e.target.files?.[0]); e.target.value = ""; }} />
        <div className="bz-lyrics-caption"><span>{lyricsInstrumental ? "Instrumental" : lyrics.length ? `Sincronizada${lyricsDelayMs ? ` · ${lyricsDelayMs > 0 ? "+" : ""}${lyricsDelayMs} ms` : ""}` : plainLyrics ? "Texto completo" : "Letras"}</span><span>{current.artist}</span></div>
        <div className={`bz-lyrics-reader ${!lyrics.length ? "bz-lyrics-plain" : ""}`} ref={lyricsViewport} tabIndex={0} role="region" aria-label="Texto da letra" onWheel={() => setFollowLyrics(false)} onTouchMove={() => setFollowLyrics(false)} onKeyDown={event => { if (["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End"].includes(event.key)) setFollowLyrics(false); }}>
          {lyrics.length ? lyrics.map((line, i) => <p key={i} className={i === activeLine ? "bz-lyric-active" : i < activeLine ? "bz-lyric-past" : ""}>{line.text || "♪"}</p>)
            : plainLyrics ? plainLyrics.split(/\n\s*\n/).map((verse, i) => <p key={i}>{verse}</p>)
            : <div className="bz-lyrics-empty">{lyricsBusy ? <LoaderCircle size={30} className="bz-lyrics-spinner" /> : <ScrollText size={32} />}<strong>{lyricsBusy ? "Encontrando as palavras…" : lyricsInstrumental ? "Só a música." : "Ainda sem letra por aqui."}</strong><p>{lyricsBusy ? "Buscando a letra no LRCLIB." : lyricsInstrumental ? "Esta faixa foi identificada como instrumental." : "Tente buscar novamente ou importe um arquivo LRC nas opções."}</p></div>}
        </div>
        <footer className="bz-lyrics-footer">
          <p role="status">{lyricsStatus}</p>
          {!!lyrics.length && <button type="button" className={followLyrics ? "is-following" : ""} onClick={() => setFollowLyrics(value => !value)} aria-pressed={followLyrics}>{followLyrics ? "Acompanhando" : "Acompanhar letra"}</button>}
        </footer>
      </section>}
      {showQueue && <aside className="bz32-queue" aria-label="Fila de reprodução">
        <div className="bz32-queue-heading"><div><strong>Fila de reprodução</strong><span>{tracks.length} música(s)</span></div>
          <button type="button" title="Ocultar fila" aria-label="Ocultar fila" onClick={() => setShowQueue(false)}><X size={18} /></button></div>
        <p className="bz32-queue-hint">Arrasta para mudar a ordem. As setas também funcionam.</p>
        <QueuePicker />
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
        onCanPlay={() => { if (deck !== activeDeck.current) return; setLoadingAudio(false); if (playingRef.current && audioEls.current[deck]?.paused) playLocal(audioEls.current[deck]!); }}
        onPlaying={() => { if (deck === activeDeck.current) { setLoadingAudio(false); reportPlayback(current, true, "local"); } }}
        onPause={() => { if (deck === activeDeck.current) reportPlayback(current, false, "local"); }}
        onWaiting={() => { if (deck === activeDeck.current) { setLoadingAudio(true); reportPlayback(current, false, "local"); } }}
        onTimeUpdate={() => onDeckTimeUpdate(deck)}
        onEnded={() => onDeckEnded(deck)}
        onError={() => { if (deck === activeDeck.current && trackIsLocal && audioEls.current[deck]?.getAttribute("src")) failLocal(audioEls.current[deck]?.error?.code === 4 ? "Este arquivo não pôde ser reproduzido. Verifique o formato ou importe uma cópia válida." : "Não foi possível carregar o arquivo de áudio. Verifique se ele ainda está disponível e tente novamente."); }} />)}
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
      {(loadingAudio || audioFailure || failedOnline || checking) && <span className="bz32-mini-error" role={audioFailure || failedOnline ? "alert" : "status"}>
        {audioFailure || failedOnline || (checking ? "Verificando biblioteca local..." : (localUrl ? "Carregando áudio..." : "Carregando player online..."))}
        {(audioFailure || failedOnline) && <button type="button" onClick={retryPlayback}>Tentar reprodução novamente</button>}
      </span>}
      {message && !audioFailure && !failedOnline && !loadingAudio && !checking && <span className="bz32-mini-error" role="status">{message}</span>}
    </div>}
  </section>;
}
