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
/** Stored lyrics must contain readable content, or explicitly describe an instrumental. */
export function isUsableLyricsResult(value: unknown): value is LyricsResult {
  return isLyricsResult(value) && (value.instrumental || !!value.plainLyrics.trim()
    || parseLrc(value.syncedLyrics).some(line => !!line.text.trim()));
}
export function parseLrc(source: string): LyricLine[] {
  const rows = source.split(/\r\n?|\n/);
  let offsetMs = 0;
  // Offset is metadata only on its own row, never a tag inside the sung text.
  for (const row of rows) {
    const match = row.match(/^\s*\[offset:([+-]?\d+)\]\s*$/i);
    if (match && Number.isFinite(Number(match[1]))) { offsetMs = Number(match[1]); break; }
  }
  const lines: LyricLine[] = [];
  for (const row of rows) {
    let text = row.trimStart();
    const times = new Set<number>();
    // Only leading timestamps are syntax. Brackets elsewhere belong to the lyrics.
    for (;;) {
      const stamp = text.match(/^\[(\d{1,3}):([0-5]\d)(?:\.(\d{1,3}))?\]/);
      if (!stamp) break;
      const ms = Number(stamp[1]) * 60_000 + Number(stamp[2]) * 1000 + Number((stamp[3] || "0").padEnd(3, "0"));
      times.add(Math.max(0, ms - offsetMs));
      text = text.slice(stamp[0].length).trimStart();
    }
    for (const ms of times) lines.push({ time: ms / 1000, text: text.trim() });
  }
  const groups: LyricLine[] = [];
  for (const line of lines.sort((a, b) => a.time - b.time)) {
    const previous = groups[groups.length - 1];
    if (previous?.time === line.time) previous.text += `\n${line.text}`;
    else groups.push({ ...line });
  }
  return groups;
}
export const LYRIC_DELAY_STEP_MS = 100;
export const MAX_LYRIC_DELAY_MS = 30_000;
export function isLyricDelay(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && Math.abs(value) <= MAX_LYRIC_DELAY_MS && value % LYRIC_DELAY_STEP_MS === 0;
}
export function lyricDelayKey(videoId: string, playbackSource: "local" | "online", lyricsSource: "manual" | "lrclib"): string {
  return `bztune-lyrics-offset-v1:${playbackSource}:${lyricsSource}:${videoId}`;
}
/** Positive delay shows a verse later. Source LRC offsets have already been parsed. */
export function activeLyricLine(lines: LyricLine[], seconds: number, delayMs = 0): number {
  // Absorb double precision noise at an exact seek boundary (well below a microsecond).
  const positionMs = seconds * 1000 - delayMs + 1e-7;
  return lines.reduce((last, line, i) => line.time * 1000 <= positionMs ? i : last, -1);
}
/** Inverse of the highlight offset: LRC metadata offsets are already in line.time. */
export function lyricSeekPosition(line: LyricLine, delayMs: number, duration: number): number | null {
  if (!Number.isFinite(line.time) || line.time < 0 || !isLyricDelay(delayMs) || !Number.isFinite(duration) || duration <= 0) return null;
  const seconds = (Math.round(line.time * 1000) + delayMs) / 1000;
  return seconds > duration ? null : Math.max(0, seconds);
}
export async function fetchLyrics(track: { title: string; artist: string; album?: string | null }, duration: number, signal: AbortSignal): Promise<LyricsResult> {
  const params = new URLSearchParams({ track_name: track.title, artist_name: track.artist });
  if (track.album) params.set("album_name", track.album);
  if (Number.isFinite(duration) && duration >= 1 && duration <= 3600) params.set("duration", String(duration));
  const response = await apiFetch(`http://127.0.0.1:5000/api/lyrics?${params}`, { signal }, 20000);
  const data: unknown = await response.json();
  if (!response.ok) throw Object.assign(new Error((data as { error?: string })?.error || "Não foi possível buscar a letra."), { status: response.status });
  if (!isLyricsResult(data)) throw new Error("Resposta de letras inválida.");
  return data;
}

export type LyricsCandidate = LyricsResult & { id: number; trackName: string; artistName: string; albumName: string; duration: number | null };
export function isLyricsCandidate(value: unknown): value is LyricsCandidate {
  if (!isLyricsResult(value)) return false;
  const row = value as LyricsCandidate;
  return Number.isSafeInteger(row.id) && row.id > 0
    && (row.duration === null || typeof row.duration === "number" && Number.isFinite(row.duration) && row.duration >= 0 && row.duration <= 86400)
    && [row.trackName, row.artistName, row.albumName].every(text => typeof text === "string" && text.length <= 1000)
    && !!row.trackName.trim() && !!row.artistName.trim();
}
export async function searchLyricsVersions(track: { title: string; artist: string }, duration: number, signal: AbortSignal): Promise<LyricsCandidate[]> {
  const params = new URLSearchParams({ track_name: track.title, artist_name: track.artist });
  const response = await apiFetch(`http://127.0.0.1:5000/api/lyrics/search?${params}`, { signal }, 20000);
  const data = await response.json();
  if (!response.ok) throw new Error(data?.error || "Não foi possível buscar versões da letra.");
  if (!Array.isArray(data?.candidates) || data.candidates.length > 100 || !data.candidates.every(isLyricsCandidate)) throw new Error("Resposta de versões inválida.");
  const rows: LyricsCandidate[] = data.candidates;
  return [...rows].sort((a, b) => {
    if (a.duration === null) return b.duration === null ? 0 : 1;
    if (b.duration === null) return -1;
    return Number.isFinite(duration) && duration > 0 ? Math.abs(a.duration - duration) - Math.abs(b.duration - duration) : 0;
  });
}


export type LyricsResolution = { result: LyricsResult; candidates?: never } | { result?: never; candidates: LyricsCandidate[] };
function recordingTitle(title: string): string {
  return title.replace(/\s*[([]\s*(?:\d{4}\s*[-–—]?\s*)?remaster(?:ed)?(?:\s*[-–—]?\s*\d{4})?\s*[)\]]\s*$/i, "")
    .replace(/\s*[-–—]\s*(?:\d{4}\s*[-–—]?\s*)?remaster(?:ed)?(?:\s*[-–—]?\s*\d{4})?\s*$/i, "").trim();
}
function comparable(text: string): string {
  return text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}
function versionMarkers(text: string): string {
  const normalized = comparable(text);
  const markers = [
    ["live", /\b(?:live|ao vivo)\b/],
    ["acoustic", /\b(?:acoustic|acustic[oa]s?|unplugged)\b/],
    ["demo", /\bdemo\b/],
    ["remix", /\b(?:remix|remistura)\b/],
    ["karaoke", /\bkaraoke\b/],
    ["instrumental", /\binstrumental\b/],
  ] as const;
  return markers.filter(([, pattern]) => pattern.test(normalized)).map(([marker]) => marker).join("|");
}
function titleVersion(title: string): string {
  // Version annotations, not words in the song name (e.g. "Live Forever").
  const annotations = [...title.matchAll(/\(([^)]*)\)|\[([^\]]*)\]/g)].map(match => match[1] || match[2]);
  annotations.push(...title.split(/\s+[-–—]\s+/).slice(1));
  return versionMarkers(annotations.join(" "));
}
/** Conservative fallback: never choose a different artist, live variant or unknown duration automatically. */
export function matchingLyricsVersion(track: { title: string; artist: string; album?: string | null }, duration: number, rows: LyricsCandidate[]): LyricsCandidate | null {
  if (!Number.isFinite(duration) || duration < 1) return null;
  const album = comparable(track.album || "");
  const matches = rows.filter((row): row is LyricsCandidate & { duration: number } => row.duration !== null && row.duration > 0
    && comparable(recordingTitle(row.trackName)) === comparable(recordingTitle(track.title))
    && comparable(row.artistName) === comparable(track.artist)
    && titleVersion(row.trackName) === titleVersion(track.title)
    && versionMarkers(row.albumName) === versionMarkers(track.album || "")
    && (!row.instrumental || titleVersion(track.title).split("|").includes("instrumental"))
    && Math.abs(row.duration - duration) <= 2
    && !!(row.instrumental || parseLrc(row.syncedLyrics).length || row.plainLyrics.trim()));
  const rank = (row: LyricsCandidate) => (album && comparable(row.albumName) === album ? 100 : 0) + (parseLrc(row.syncedLyrics).length ? 10 : 0);
  matches.sort((a, b) => rank(b) - rank(a) || Math.abs(a.duration - duration) - Math.abs(b.duration - duration) || a.id - b.id);
  return matches[0] || null;
}
export async function resolveLyrics(track: { title: string; artist: string; album?: string | null }, duration: number | (() => number), signal: AbortSignal): Promise<LyricsResolution> {
  const currentDuration = () => typeof duration === "function" ? duration() : duration;
  try {
    const result = await fetchLyrics(track, currentDuration(), signal);
    if (signal.aborted) throw new Error("Busca cancelada.");
    if (result.instrumental || parseLrc(result.syncedLyrics).length || result.plainLyrics.trim()) return { result };
  } catch (error) {
    if (signal.aborted || (error as { status?: number })?.status === 400) throw error;
  }
  if (signal.aborted) throw new Error("Busca cancelada.");
  const candidates = await searchLyricsVersions({ title: recordingTitle(track.title), artist: track.artist }, currentDuration(), signal);
  if (signal.aborted) throw new Error("Busca cancelada.");
  const result = matchingLyricsVersion(track, currentDuration(), candidates);
  if (result) return { result };
  if (!candidates.length) throw new Error("Nenhuma letra encontrada no LRCLIB para esta música.");
  return { candidates };
}
