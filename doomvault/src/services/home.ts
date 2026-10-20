import { API, type StoredTrack } from "../utils/music-utils";
import { playlists, type Playlist } from "./playlists";

export type HomePlaylist = Pick<Playlist, "id" | "name" | "count" | "coverUrl">;

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Resposta inválida.");
  return value as Record<string, unknown>;
}
function text(value: unknown): string {
  if (typeof value !== "string") throw new Error("Resposta inválida.");
  return value;
}
function cover(value: unknown): string | null | undefined {
  if (value == null) return value;
  return text(value);
}
export async function loadRecentTracks(signal: AbortSignal): Promise<StoredTrack[]> {
  const response = await fetch(`${API}/api/library/tracks`, { signal });
  if (!response.ok) throw new Error(`Erro HTTP ${response.status}`);
  const data = record(await response.json());
  if (!Array.isArray(data.tracks)) throw new Error("Resposta inválida.");
  return data.tracks.map((item: unknown) => {
    const track = record(item);
    return { id: text(track.id), title: text(track.title), artist: text(track.artist),
      audioUrl: text(track.audioUrl), coverUrl: cover(track.coverUrl) };
  }).slice(0, 8);
}
export async function loadHomePlaylists(signal: AbortSignal): Promise<HomePlaylist[]> {
  const data = record(await playlists.list(signal));
  if (!Array.isArray(data.playlists)) throw new Error("Resposta inválida.");
  return data.playlists.map((item: unknown) => {
    const playlist = record(item);
    if (typeof playlist.count !== "number" || !Number.isSafeInteger(playlist.count) || playlist.count < 0) {
      throw new Error("Resposta inválida.");
    }
    return { id: text(playlist.id), name: text(playlist.name), count: playlist.count,
      coverUrl: cover(playlist.coverUrl) };
  }).slice(0, 6);
}
