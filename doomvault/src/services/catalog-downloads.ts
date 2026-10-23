import { apiFetch } from "./api-fetch";
import { providerError, readDownloadBatch, readDownloadStart } from "./player-contracts";
import type { DownloadBatch } from "./player-contracts";

const API = "http://127.0.0.1:5000";
export type DownloadRequest = { artist: string; title: string; kind: "track" | "release"; albumId?: string | null; videoId?: string | null };
type DownloadState = { batchId: string | null; batch: DownloadBatch | null; submitting: boolean; message: string; noticeAt: number };
const idle: DownloadState = { batchId: null, batch: null, submitting: false, message: "", noticeAt: 0 };
const tasks = new Map<string, DownloadState>();
const listeners = new Set<() => void>();

export function downloadIdentity(request: DownloadRequest): string {
  if (request.kind === "track" && request.videoId) return JSON.stringify(["track", request.videoId]);
  if (request.kind === "release" && request.albumId) return JSON.stringify(["release", request.albumId]);
  return JSON.stringify([request.kind, request.artist.trim().toLocaleLowerCase(), request.title.trim().toLocaleLowerCase()]);
}
export function downloadSnapshot(identity: string): DownloadState { return tasks.get(identity) ?? idle; }
export function subscribeDownloads(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }
function update(identity: string, patch: Partial<DownloadState>) {
  tasks.set(identity, { ...downloadSnapshot(identity), ...patch });
  for (const listener of listeners) listener();
}

// Tasks belong to the application session, not to a button or the displayed track.
async function poll(identity: string, batchId: string): Promise<void> {
  try {
    const response = await apiFetch(`${API}/api/library/auto-download/${encodeURIComponent(batchId)}`, { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const result = readDownloadBatch(await response.json(), batchId);
    const terminal = result.status === "complete" || result.status === "partial" || result.status === "error";
    update(identity, { batch: result, message: "", batchId: terminal ? null : batchId, noticeAt: terminal ? Date.now() : 0 });
    if (result.status === "complete" || result.status === "partial") {
      window.dispatchEvent(new Event("doomvault-library-updated"));
    }
  } catch {
    update(identity, { message: "Não foi possível consultar o andamento do download.", noticeAt: Date.now() });
  }
  if (downloadSnapshot(identity).batchId === batchId) window.setTimeout(() => void poll(identity, batchId), 1200);
}

export async function startCatalogDownload(request: DownloadRequest): Promise<void> {
  const identity = downloadIdentity(request), current = downloadSnapshot(identity);
  if (current.submitting || current.batchId || current.batch?.status === "complete") return;
  update(identity, { submitting: true, batch: null, message: "", noticeAt: 0 });
  try {
    const response = await apiFetch(`${API}/api/library/auto-download`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(request) });
    const payload: unknown = await response.json();
    if (!response.ok) throw new Error(providerError(payload, "Falha ao iniciar download."));
    const batchId = readDownloadStart(payload);
    update(identity, { batchId, submitting: false });
    void poll(identity, batchId);
  } catch (problem) {
    update(identity, { submitting: false, message: problem instanceof Error ? problem.message : "Não foi possível iniciar o download.", noticeAt: Date.now() });
  }
}
