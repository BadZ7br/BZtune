import type { MusicAlbum } from "./api";
export type Artist = { id: string | null; name: string; image: string | null; type: "artist" };
export type Release = MusicAlbum & { release_type?: string | null; type: "album" };
export type Song = { id: string | null; title: string; artist: string; album: string | null; duration: string | null; duration_seconds: number | null; cover: string | null; type: "song" };
export type Payload = { query: string; corrected?: string | null; results: { artists: Artist[]; albums: Release[]; songs: Song[] } };
function object(value: unknown): value is Record<string, unknown> { return !!value && typeof value === "object" && !Array.isArray(value); }
function optionalText(value: unknown) { return value == null || typeof value === "string"; }
export function parseSearch(value: unknown): Payload {
  if (!object(value) || typeof value.query !== "string" || !optionalText(value.corrected) || !object(value.results)) throw new Error("A pesquisa retornou uma resposta inválida. Tente novamente.");
  const { artists, albums, songs } = value.results;
  if (!Array.isArray(artists) || !Array.isArray(albums) || !Array.isArray(songs)
    || artists.some(item => !object(item) || !optionalText(item.id) || typeof item.name !== "string" || !optionalText(item.image))
    || albums.some(item => !object(item) || typeof item.id !== "string" || typeof item.title !== "string" || typeof item.artist !== "string" || !optionalText(item.cover) || !optionalText(item.release_type) || (item.year != null && typeof item.year !== "string" && (typeof item.year !== "number" || !Number.isFinite(item.year))))
    || songs.some(item => !object(item) || !optionalText(item.id) || typeof item.title !== "string" || typeof item.artist !== "string" || !optionalText(item.album) || !optionalText(item.duration) || !optionalText(item.cover))) {
    throw new Error("A pesquisa retornou uma resposta inválida. Tente novamente.");
  }
  return value as Payload;
}
