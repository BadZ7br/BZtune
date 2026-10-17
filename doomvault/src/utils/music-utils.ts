import type { PlayerTrack } from "../player/PlayerContext";
export const API = "http://127.0.0.1:5000";
export type MusicAlbumLite = { id: string; title: string; artist: string; year: string | number | null; cover: string | null };
export type WebTrack = { video_id: string | null; title: string; number?: number; duration?: string | null; artist?: string; cover?: string | null };
export type StoredTrack = { id: string; title: string; artist: string; filename?: string; coverUrl?: string | null; audioUrl: string; bytes?: number };
export function videoIdValid(id: string | null | undefined): id is string { return typeof id === "string" && /^[a-zA-Z0-9_-]{11}$/.test(id); }
export function fullUrl(url: string | null | undefined): string | undefined {
  if (!url) return undefined;
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  return `${API}${url.startsWith("/") ? "" : "/"}${url}`;
}
export function coverProxy(title: string, artist: string, cover: string | null | undefined) {
  return `${API}/api/cover?${new URLSearchParams({ title, artist, url: cover || "" })}`;
}
export function fromWebTrack(track: WebTrack, artist: string, album?: string, cover?: string | null): PlayerTrack | null {
  if (!videoIdValid(track.video_id)) return null;
  return { videoId: track.video_id, title: track.title, artist: track.artist || artist, album: album || null, cover: coverProxy(album || track.title, artist, cover || track.cover) };
}
export function fromLocal(track: StoredTrack): PlayerTrack {
  return {
    videoId: `library:${track.id}`, title: track.title, artist: track.artist,
    audioUrl: fullUrl(track.audioUrl), cover: fullUrl(track.coverUrl) || null
  };
}
