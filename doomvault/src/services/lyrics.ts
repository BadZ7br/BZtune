import { apiFetch } from "./api-fetch";
export type LyricLine = { time: number; text: string };
export type LyricsResult = { source: "LRCLIB"; instrumental: boolean; syncedLyrics: string; plainLyrics: string };
export const LYRICS_CACHE_KEY = "bztune-lyrics-v1:";
export function isLyricsResult(value: unknown): value is LyricsResult {
  if (!value || typeof value !== "object") return false;
  const data = value as Record<string, unknown>;
  return data.source === "LRCLIB" && typeof data.instrumental === "boolean"
    && [data.syncedLyrics, data.plainLyrics].every(text => typeof text === "string" && new TextEncoder().encode(text).length <= 250_000);
}
export function parseLrc(source: string): LyricLine[] {
  const lines: LyricLine[] = [];
  const offset = Number(source.match(/\[offset:([+-]?\d+)\]/i)?.[1] || 0) / 1000;
  for (const row of source.split(/\r?\n/)) {
    const stamps = [...row.matchAll(/\[(\d{1,3}):([0-5]\d)(?:\.(\d{1,3}))?\]/g)];
    const text = row.replace(/\[[^\]]*\]/g, "").trim();
    for (const stamp of stamps) {
      const time = Number(stamp[1]) * 60 + Number(stamp[2]) + Number((stamp[3] || "0").padEnd(3, "0")) / 1000 - offset;
      lines.push({ time: Math.max(0, time), text });
    }
  }
  return lines.sort((a, b) => a.time - b.time);
}
export async function fetchLyrics(track: { title: string; artist: string; album?: string | null }, duration: number, signal: AbortSignal): Promise<LyricsResult> {
  const params = new URLSearchParams({ track_name: track.title, artist_name: track.artist });
  if (track.album) params.set("album_name", track.album);
  if (Number.isFinite(duration) && duration >= 1 && duration <= 3600) params.set("duration", String(duration));
  const response = await apiFetch(`http://127.0.0.1:5000/api/lyrics?${params}`, { signal }, 20000);
  const data: unknown = await response.json();
  if (!response.ok) throw new Error((data as { error?: string })?.error || "Não foi possível buscar a letra.");
  if (!isLyricsResult(data)) throw new Error("Resposta de letras inválida.");
  return data;
}
