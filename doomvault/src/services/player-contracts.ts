export type AlternativeTrack = { videoId: string; title: string; artist: string; album?: string | null; cover?: string | null };
export type DownloadBatch = { id: string; status: "searching" | "downloading" | "complete" | "partial" | "error"; total: number; completed: number; errors: string[]; warnings?: string[]; linked?: number; skipped?: number; current_title?: string | null; current?: { downloaded?: number; total?: number | null; status?: string } | null };
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const count = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
const textList = (value: unknown) => Array.isArray(value) && value.every(item => typeof item === "string");
export function providerError(value: unknown, fallback: string): string {
  return object(value) && typeof value.error === "string" && value.error.trim() ? value.error : fallback;
}
export function readAlternatives(value: unknown): AlternativeTrack[] {
  if (!object(value) || !Array.isArray(value.tracks) || value.tracks.length > 100 || value.tracks.some(row => !object(row)
    || typeof row.videoId !== "string" || !/^[a-zA-Z0-9_-]{11}$/.test(row.videoId)
    || typeof row.title !== "string" || !row.title.trim() || typeof row.artist !== "string"
    || (row.album != null && typeof row.album !== "string") || (row.cover != null && typeof row.cover !== "string"))) {
    throw new Error("Resposta inválida das alternativas de reprodução. Tente buscar novamente.");
  }
  return value.tracks as AlternativeTrack[];
}
export function readDownloadStart(value: unknown): string {
  if (!object(value) || typeof value.id !== "string" || !/^[a-zA-Z0-9_-]{1,128}$/.test(value.id)) {
    throw new Error("Resposta inválida ao iniciar o download. Confira a biblioteca antes de tentar novamente.");
  }
  return value.id;
}
export function readDownloadBatch(value: unknown, expectedId: string): DownloadBatch {
  if (!object(value) || value.id !== expectedId || typeof value.status !== "string"
    || !["searching", "downloading", "complete", "partial", "error"].includes(value.status)
    || !count(value.total) || !count(value.completed) || value.completed > value.total || !textList(value.errors)
    || (value.warnings !== undefined && !textList(value.warnings))
    || (value.linked !== undefined && !count(value.linked)) || (value.skipped !== undefined && !count(value.skipped))
    || (value.current_title != null && typeof value.current_title !== "string")
    || (value.current != null && (!object(value.current)
      || (value.current.downloaded !== undefined && !count(value.current.downloaded))
      || (value.current.total != null && !count(value.current.total))
      || (value.current.status !== undefined && typeof value.current.status !== "string")))) {
    throw new Error("Resposta inválida do andamento do download.");
  }
  return value as DownloadBatch;
}
