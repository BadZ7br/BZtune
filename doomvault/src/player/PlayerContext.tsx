import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { PlayerTrack, RepeatMode } from "../types/music";
export type { PlayerTrack, RepeatMode } from "../types/music";
type PlayerValue = {
  shuffle: boolean;
  repeat: RepeatMode;
  toggleShuffle: () => void;
  cycleRepeat: () => void;
  onTrackEnded: () => void;
  replayToken: number;
  tracks: PlayerTrack[];
  index: number;
  current: PlayerTrack | null;
  isPlaying: boolean;
  playTrack: (track: PlayerTrack, tracks?: PlayerTrack[]) => void;
  addToQueue: (track: PlayerTrack) => void;
  next: () => void;
  previous: () => void;
  setPlaying: (playing: boolean) => void;
  clearQueue: () => void;
};

const Context = createContext<PlayerValue | null>(null);
const STATE_KEY = "doomvault-player-state-v11";
function restoreState(): { tracks: PlayerTrack[]; index: number; shuffle: boolean; repeat: RepeatMode } {
  try {
    const raw = JSON.parse(localStorage.getItem(STATE_KEY) || "null") as Partial<{
      tracks: PlayerTrack[]; index: number; shuffle: boolean; repeat: RepeatMode;
    }> | null;
    if (!raw || !Array.isArray(raw.tracks)) throw new Error();
    const tracks = raw.tracks.filter((t): t is PlayerTrack =>
      typeof t?.videoId === "string" && typeof t.title === "string" && typeof t.artist === "string")
      .slice(0, 500).map(track => ({
        ...track,
        source: track.source === "local" || track.source === "web"
          ? track.source : track.audioUrl ? "local" : "web",
      }));
    return {
      tracks,
      index: Math.max(-1, Math.min(tracks.length - 1, Math.trunc(raw.index ?? -1))),
      shuffle: raw.shuffle === true,
      repeat: raw.repeat === "one" || raw.repeat === "all" ? raw.repeat : "off",
    };
  } catch { return { tracks: [], index: -1, shuffle: false, repeat: "off" }; }
}


export function PlayerProvider({ children }: { children: ReactNode }) {
  const [initial] = useState(restoreState);
  const [tracks, setTracks] = useState<PlayerTrack[]>(initial.tracks);
  const [index, setIndex] = useState(initial.index);
  const [isPlaying, setPlaying] = useState(false);
  const [shuffle, setShuffle] = useState(initial.shuffle);
  const [repeat, setRepeat] = useState<RepeatMode>(initial.repeat);
  useEffect(() => {
    try { localStorage.setItem(STATE_KEY, JSON.stringify({ tracks, index, shuffle, repeat })); } catch { /* storage cheio */ }
  }, [tracks, index, shuffle, repeat]);
  const history = useRef<number[]>([]);
  const shuffledPlayed = useRef<Set<number>>(new Set());
  const toggleShuffle = useCallback(() => setShuffle(x => !x), []);
  const cycleRepeat = useCallback(() => setRepeat(x => x === "off" ? "all" : x === "all" ? "one" : "off"), []);

  const playTrack = useCallback((track: PlayerTrack, playlist?: PlayerTrack[]) => {
    const list = (playlist?.length ? playlist : [track]).map(item => ({
      ...item,
      source: item.source || (item.audioUrl ? "local" : "web"),
    }));
    const found = list.findIndex(item => item.videoId === track.videoId);
    setTracks(list);
    history.current = [];
    shuffledPlayed.current = new Set([found >= 0 ? found : 0]);
    setIndex(found >= 0 ? found : 0);
    setPlaying(true);
  }, []);

  const addToQueue = useCallback((track: PlayerTrack) => {
    const normalized = { ...track, source: track.source || (track.audioUrl ? "local" : "web") };
    setTracks(old => old.some(item => item.videoId === normalized.videoId) ? old : [...old, normalized]);
  }, []);

  const goNext = useCallback((ended: boolean) => {
    if (!tracks.length || index < 0) return;
    if (ended && repeat === "one") {
      // Reinicia a mesma faixa: o player observa o contador abaixo.
      setReplayToken(x => x + 1);
      setPlaying(true);
      return;
    }
    if (shuffle && tracks.length > 1) {
      let choices = tracks.map((_, i) => i).filter(i => i !== index && !shuffledPlayed.current.has(i));
      if (!choices.length) {
        if (repeat !== "all") { setPlaying(false); return; }
        shuffledPlayed.current = new Set([index]);
        choices = tracks.map((_, i) => i).filter(i => i !== index);
      }
      const target = choices[Math.floor(Math.random() * choices.length)];
      shuffledPlayed.current.add(target);
      history.current.push(index);
      setIndex(target);
      setPlaying(true);
    } else if (index + 1 < tracks.length) {
      history.current.push(index);
      setIndex(index + 1);
      setPlaying(true);
    } else if (repeat === "all") {
      history.current.push(index);
      setIndex(0);
      setReplayToken(x => x + 1);
      setPlaying(true);
    } else setPlaying(false);
  }, [tracks, index, repeat, shuffle]);
  const [replayToken, setReplayToken] = useState(0);
  const next = useCallback(() => goNext(false), [goNext]);
  const onTrackEnded = useCallback(() => goNext(true), [goNext]);
  const previous = useCallback(() => {
    const prior = history.current.pop();
    if (prior !== undefined) { setIndex(prior); setPlaying(true); }
    else if (index > 0) { setIndex(index - 1); setPlaying(true); }
    else setReplayToken(x => x + 1);
  }, [index]);
  const clearQueue = useCallback(() => { setTracks([]); setIndex(-1); setPlaying(false); history.current = []; shuffledPlayed.current.clear(); }, []);
  const current = index >= 0 ? tracks[index] ?? null : null;
  const value = useMemo(() => ({
    tracks, index, current, isPlaying, playTrack, addToQueue,
    next, previous, setPlaying, clearQueue, shuffle, repeat, toggleShuffle, cycleRepeat, onTrackEnded, replayToken,
  }), [tracks, index, current, isPlaying, playTrack, addToQueue, next, previous, clearQueue, shuffle, repeat, toggleShuffle, cycleRepeat, onTrackEnded, replayToken]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function usePlayer() {
  const context = useContext(Context);
  if (!context) throw new Error("usePlayer precisa estar dentro de PlayerProvider");
  return context;
}
