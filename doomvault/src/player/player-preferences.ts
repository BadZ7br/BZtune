export type ListenItem = { videoId: string; title: string; artist: string; playedAt: number };
export function restoreHistory(value: unknown): ListenItem[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  return value.filter((row): row is ListenItem => {
    if (!row || typeof row !== "object" || typeof row.videoId !== "string" || !row.videoId.trim()
      || typeof row.title !== "string" || typeof row.artist !== "string"
      || typeof row.playedAt !== "number" || !Number.isFinite(row.playedAt) || row.playedAt < 0
      || !Number.isFinite(new Date(row.playedAt).getTime()) || seen.has(row.videoId)) return false;
    seen.add(row.videoId);
    return true;
  }).slice(0, 50);
}
export function restoreEqualizer(value: unknown): number[] {
  if (!Array.isArray(value) || value.length !== 3) return [0, 0, 0];
  return value.map(gain => typeof gain === "number" && Number.isFinite(gain) ? Math.max(-12, Math.min(12, Math.round(gain))) : 0);
}
