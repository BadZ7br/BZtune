/** Biblioteca híbrida BZtune 1.4.4: leitura compartilhada, sem criar cópias nem editar playlists. */
import { useCallback, useEffect, useState } from "react";
import type { PlayerTrack } from "../player/PlayerContext";
import { API, fullUrl, videoIdValid } from "../utils/music-utils";

export type AvailableLocalTrack = {
  id: string;
  title: string;
  artist: string;
  album?: string | null;
  albumId?: string | null;
  audioUrl: string;
  coverUrl?: string | null;
  sourceIds?: string[];
  filename?: string;
};
export type LocalMatch = {
  track: AvailableLocalTrack;
  confidence: "source-id" | "album" | "title-only";
};
export type AvailabilityState = "loading" | "ready" | "error";

function norm(value: string | null | undefined): string {
  return (value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/** Resultado por ID da origem tem prioridade; o nome sozinho é apenas indício, não identidade. */
export function matchLocalTracks(
  remote: Pick<PlayerTrack, "videoId" | "title" | "artist" | "album">,
  library: readonly AvailableLocalTrack[],
): LocalMatch[] {
  const exactId = videoIdValid(remote.videoId) ? library.filter(item =>
    Array.isArray(item.sourceIds) && item.sourceIds.includes(remote.videoId)
  ) : [];
  if (exactId.length) return exactId.map(track => ({ track, confidence: "source-id" as const }));

  const byName = library.filter(t => norm(t.title) === norm(remote.title) && norm(t.artist) === norm(remote.artist));
  if (!byName.length) return [];
  const albumKey = norm(remote.album);
  return byName.map(track => ({
    track,
    confidence: albumKey && norm(track.album) === albumKey ? "album" as const : "title-only" as const,
  })).sort((a, b) => {
    const rank = (kind: LocalMatch["confidence"]) => kind === "album" ? 0 : 1;
    return rank(a.confidence) - rank(b.confidence);
  });
}

export function confirmedLocalMatch(matches: readonly LocalMatch[]): LocalMatch | null {
  const certain = matches.filter(m => m.confidence !== "title-only");
  return certain.length === 1 ? certain[0] : null;
}

export function withLocalSource(web: PlayerTrack, local: AvailableLocalTrack): PlayerTrack {
  return {
    ...web,
    preferredSource: "local",
    audioUrl: fullUrl(local.audioUrl),
    cover: fullUrl(local.coverUrl) || web.cover,
  };
}
export function withOnlineSource(web: PlayerTrack): PlayerTrack {
  return { ...web, preferredSource: "online", audioUrl: undefined };
}

export function localReleaseCount(library: readonly AvailableLocalTrack[], artist: string, album: string): number {
  const artistKey = norm(artist);
  const albumKey = norm(album);
  if (!artistKey || !albumKey) return 0;
  return library.filter(item => norm(item.artist) === artistKey && norm(item.album) === albumKey).length;
}

const TTL = 20_000;
let cached: AvailableLocalTrack[] = [];
let fetchedAt = 0;
let lastError = false;
let inflight: Promise<AvailableLocalTrack[]> | null = null;
const listeners = new Set<() => void>();
function notify() { for (const fn of listeners) fn(); }
async function fetchLocal(force = false): Promise<AvailableLocalTrack[]> {
  if (!force && fetchedAt && Date.now() - fetchedAt < TTL && !lastError) return cached;
  if (inflight) return inflight;
  inflight = (async () => {
    const response = await fetch(`${API}/api/library/tracks`, { cache: "no-store" });
    if (!response.ok) throw new Error(`Biblioteca indisponível (${response.status})`);
    const data = await response.json() as { tracks?: AvailableLocalTrack[] };
    if (!Array.isArray(data.tracks)) throw new Error("Formato inesperado da biblioteca");
    cached = data.tracks;
    fetchedAt = Date.now();
    lastError = false;
    notify();
    return cached;
  })().catch((error: unknown) => { lastError = true; notify(); throw error; })
    .finally(() => { inflight = null; });
  return inflight;
}

export function useLibraryAvailability() {
  const [tracks, setTracks] = useState<AvailableLocalTrack[]>(cached);
  const [status, setStatus] = useState<AvailabilityState>(fetchedAt && !lastError ? "ready" : "loading");
  const refresh = useCallback(async (force = false) => {
    try { const result = await fetchLocal(force); setTracks(result); setStatus("ready"); }
    catch { setStatus("error"); }
  }, []);
  useEffect(() => {
    const changed = () => { setTracks(cached); setStatus(lastError ? "error" : "ready"); };
    const focused = () => { if (document.visibilityState === "visible") void refresh(false); };
    const updated = () => { void refresh(true); };
    listeners.add(changed);
    window.addEventListener("focus", focused);
    window.addEventListener("doomvault-library-updated", updated);
    void refresh(false);
    return () => {
      listeners.delete(changed);
      window.removeEventListener("focus", focused);
      window.removeEventListener("doomvault-library-updated", updated);
    };
  }, [refresh]);
  return { tracks, status, refresh };
}
