import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { moveQueueItem, removeQueueItem, remapMovedIndex } from "./queue-utils";

export type PlayerTrack = {
  videoId: string;
  title: string;
  artist: string;
  cover?: string | null;
  album?: string | null;
  audioUrl?: string;
};
export type RepeatMode = "off" | "all" | "one";
export type PlayerValue = {
  tracks: PlayerTrack[];
  index: number;
  current: PlayerTrack | null;
  isPlaying: boolean;
  shuffle: boolean;
  repeat: RepeatMode;
  replayToken: number;
  volume: number;
  muted: boolean;
  playTrack: (track: PlayerTrack, tracks?: PlayerTrack[]) => void;
  addToQueue: (track: PlayerTrack) => void;
  jumpTo: (at: number) => void;
  reorderQueue: (from: number, to: number) => void;
  removeFromQueue: (at: number) => void;
  next: () => void;
  previous: () => void;
  onTrackEnded: () => void;
  toggleShuffle: () => void;
  cycleRepeat: () => void;
  setPlaying: (playing: boolean) => void;
  setVolume: (value: number) => void;
  toggleMute: () => void;
  clearQueue: () => void;
};

const Context = createContext<PlayerValue | null>(null);
const STATE_KEY = "doomvault-player-state-v11";
const VOLUME_KEY = "bztune-player-volume-v13";

type Persisted = { tracks: PlayerTrack[]; index: number; shuffle: boolean; repeat: RepeatMode };
function restoreState(): Persisted {
  try {
    const raw = JSON.parse(localStorage.getItem(STATE_KEY) || "null") as Partial<Persisted> | null;
    if (!raw || !Array.isArray(raw.tracks)) throw Error("state");
    const tracks = raw.tracks.filter((t): t is PlayerTrack =>
      !!t && typeof t.videoId === "string" && typeof t.title === "string" && typeof t.artist === "string").slice(0, 500);
    const safeIndex = Number.isFinite(raw.index) ? Math.trunc(raw.index!) : -1;
    return {
      tracks,
      index: Math.max(-1, Math.min(tracks.length - 1, safeIndex)),
      shuffle: raw.shuffle === true,
      repeat: raw.repeat === "one" || raw.repeat === "all" ? raw.repeat : "off",
    };
  } catch { return { tracks: [], index: -1, shuffle: false, repeat: "off" }; }
}
function restoreVolume() {
  try {
    const data = JSON.parse(localStorage.getItem(VOLUME_KEY) || "null") as { volume?: number; muted?: boolean } | null;
    return { volume: Math.max(0, Math.min(100, Number.isFinite(data?.volume) ? data!.volume! : 80)), muted: data?.muted === true };
  } catch { return { volume: 80, muted: false }; }
}

export function PlayerProvider({ children }: { children: ReactNode }) {
  const [initial] = useState(restoreState);
  const [queue, setQueue] = useState({ tracks: initial.tracks, index: initial.index });
  const queueRef = useRef(queue);
  queueRef.current = queue;
  const [isPlaying, setPlaying] = useState(false); // Não dar autoplay na abertura do app.
  const [shuffle, setShuffle] = useState(initial.shuffle);
  const [repeat, setRepeat] = useState<RepeatMode>(initial.repeat);
  const [replayToken, setReplayToken] = useState(0);
  const [savedVolume] = useState(restoreVolume);
  const [volume, setVolumeState] = useState(savedVolume.volume);
  const [muted, setMuted] = useState(savedVolume.muted);
  const history = useRef<number[]>([]);
  const shuffledPlayed = useRef<Set<number>>(new Set());
  const { tracks, index } = queue;
  const current = index >= 0 ? tracks[index] ?? null : null;

  useEffect(() => {
    try { localStorage.setItem(STATE_KEY, JSON.stringify({ tracks, index, shuffle, repeat })); } catch { /* quota */ }
  }, [tracks, index, shuffle, repeat]);
  useEffect(() => {
    try { localStorage.setItem(VOLUME_KEY, JSON.stringify({ volume, muted })); } catch { /* quota */ }
  }, [volume, muted]);

  const setVolume = useCallback((value: number) => {
    if (!Number.isFinite(value)) return;
    setVolumeState(Math.max(0, Math.min(100, Math.round(value))));
    setMuted(false);
  }, []);
  const toggleMute = useCallback(() => setMuted(v => !v), []);
  const toggleShuffle = useCallback(() => { history.current = []; shuffledPlayed.current.clear(); setShuffle(s => !s); }, []);
  const cycleRepeat = useCallback(() => setRepeat(r => r === "off" ? "all" : r === "all" ? "one" : "off"), []);

  const playTrack = useCallback((track: PlayerTrack, playlist?: PlayerTrack[]) => {
    const list = playlist?.length ? playlist : [track];
    const found = list.findIndex(t => t.videoId === track.videoId && (t.audioUrl || "") === (track.audioUrl || ""));
    const target = found >= 0 ? found : 0;
    queueRef.current = { tracks: [...list], index: target };
    setQueue(queueRef.current);
    history.current = [];
    shuffledPlayed.current = new Set([target]);
    setPlaying(true);
  }, []);
  const addToQueue = useCallback((track: PlayerTrack) => {
    const q = queueRef.current;
    if (q.tracks.some(t => t.videoId === track.videoId && (t.audioUrl || "") === (track.audioUrl || ""))) return;
    const next = { tracks: [...q.tracks, track], index: q.index < 0 ? 0 : q.index };
    queueRef.current = next;
    setQueue(next);
    if (q.index < 0) setPlaying(false);
  }, []);
  const jumpTo = useCallback((at: number) => {
    const q = queueRef.current;
    if (!Number.isInteger(at) || at < 0 || at >= q.tracks.length) return;
    if (at !== q.index) {
      history.current.push(q.index);
      shuffledPlayed.current.add(at);
      queueRef.current = { ...q, index: at };
      setQueue(queueRef.current);
    }
    setPlaying(true);
  }, []);
  const reorderQueue = useCallback((from: number, to: number) => {
    const q = queueRef.current;
    const moved = moveQueueItem(q, from, to);
    if (moved === q) return;
    history.current = history.current.map(i => remapMovedIndex(i, from, to));
    shuffledPlayed.current = new Set([...shuffledPlayed.current].map(i => remapMovedIndex(i, from, to)));
    queueRef.current = moved;
    setQueue(moved);
  }, []);
  const removeFromQueue = useCallback((at: number) => {
    const q = queueRef.current;
    const removed = removeQueueItem(q, at);
    if (removed === q) return;
    history.current = history.current.filter(i => i !== at).map(i => i > at ? i - 1 : i);
    shuffledPlayed.current = new Set([...shuffledPlayed.current].filter(i => i !== at).map(i => i > at ? i - 1 : i));
    queueRef.current = removed;
    setQueue(removed);
    if (!removed.tracks.length) setPlaying(false);
  }, []);

  const goNext = useCallback((ended: boolean) => {
    const { tracks: list, index: at } = queueRef.current;
    if (!list.length || at < 0) return;
    if (ended && repeat === "one") {
      setReplayToken(t => t + 1);
      setPlaying(true);
      return;
    }
    let target = -1;
    if (shuffle && list.length > 1) {
      let choices = list.map((_, i) => i).filter(i => i !== at && !shuffledPlayed.current.has(i));
      if (!choices.length && repeat === "all") {
        shuffledPlayed.current = new Set([at]);
        choices = list.map((_, i) => i).filter(i => i !== at);
      }
      if (choices.length) target = choices[Math.floor(Math.random() * choices.length)];
    } else if (at + 1 < list.length) target = at + 1;
    else if (repeat === "all") target = 0;
    if (target < 0) { setPlaying(false); return; }
    history.current.push(at);
    shuffledPlayed.current.add(target);
    queueRef.current = { tracks: list, index: target };
    setQueue(queueRef.current);
    if (target === at) setReplayToken(t => t + 1);
    setPlaying(true);
  }, [repeat, shuffle]);
  const next = useCallback(() => goNext(false), [goNext]);
  const onTrackEnded = useCallback(() => goNext(true), [goNext]);
  const previous = useCallback(() => {
    const q = queueRef.current;
    const old = history.current.pop();
    const to = old !== undefined && old >= 0 && old < q.tracks.length ? old : q.index > 0 ? q.index - 1 : q.index;
    if (to < 0) return;
    if (to === q.index) setReplayToken(t => t + 1);
    else { queueRef.current = { ...q, index: to }; setQueue(queueRef.current); }
    setPlaying(true);
  }, []);
  const clearQueue = useCallback(() => {
    queueRef.current = { tracks: [], index: -1 };
    setQueue(queueRef.current);
    setPlaying(false);
    history.current = [];
    shuffledPlayed.current.clear();
  }, []);

  // Atalhos globais: não interferir ao digitar, em botões ou em campos de texto.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (!queueRef.current.tracks.length || event.defaultPrevented || event.repeat || event.altKey || event.metaKey) return;
      const target = event.target as HTMLElement | null;
      if (target?.isContentEditable || target?.closest("input,textarea,select,button,[contenteditable='true'],[role='textbox']")) return;
      if (event.ctrlKey && event.key === "ArrowRight") { event.preventDefault(); next(); }
      else if (event.ctrlKey && event.key === "ArrowLeft") { event.preventDefault(); previous(); }
      else if (!event.ctrlKey && event.code === "Space") { event.preventDefault(); setPlaying(p => !p); }
      else if (!event.ctrlKey && event.key.toLowerCase() === "m") { event.preventDefault(); toggleMute(); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [next, previous, toggleMute]);

  const value = useMemo<PlayerValue>(() => ({
    tracks, index, current, isPlaying, shuffle, repeat, replayToken, volume, muted,
    playTrack, addToQueue, jumpTo, reorderQueue, removeFromQueue,
    next, previous, onTrackEnded, toggleShuffle, cycleRepeat, setPlaying, setVolume, toggleMute, clearQueue,
  }), [tracks, index, current, isPlaying, shuffle, repeat, replayToken, volume, muted, playTrack, addToQueue,
    jumpTo, reorderQueue, removeFromQueue, next, previous, onTrackEnded, toggleShuffle, cycleRepeat, setVolume, toggleMute, clearQueue]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function usePlayer() {
  const context = useContext(Context);
  if (!context) throw new Error("usePlayer precisa estar dentro de PlayerProvider");
  return context;
}
