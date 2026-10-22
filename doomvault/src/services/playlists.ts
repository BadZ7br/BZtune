import { contracts, readResponse } from "./response-contracts";
import { RequestDeadlineError, withRequestDeadline } from "./request-deadline";
import { API } from "../utils/music-utils";

export type PlaylistEntry = {
  id: string; source: "web" | "local"; videoId: string; title: string;
  artist: string; album?: string | null; cover?: string | null;
  audioUrl?: string | null; trackId?: string | null;
};
export type Playlist = {
  id: string; name: string; description: string; created_at: string;
  coverUrl?: string | null; count: number; tracks: PlaylistEntry[];
};
export type TrackInput = {
  track_id?: string; video_id?: string; title?: string; artist?: string;
  album?: string; cover?: string | null;
};
type PlaylistResult = { playlist: Playlist };
type Request =
  | { action: "list" }
  | { action: "create"; name: string; description: string }
  | { action: "update"; id: string; name?: string; description?: string }
  | { action: "delete"; id: string }
  | { action: "add_track"; id: string; track: TrackInput }
  | { action: "add_tracks"; id: string; tracks: TrackInput[] }
  | { action: "remove_entry"; id: string; entry_id: string }
  | { action: "reorder"; id: string; entry_ids: string[] };

export class PlaylistError extends Error {
  constructor(message: string, public readonly status: number, public readonly uncertain = false) {
    super(message);
    this.name = "PlaylistError";
  }
}

type Invoke = <T>(command: string, args: { request: Request }) => Promise<T>;

// A timed-out IPC cannot be cancelled. Keep writes blocked until it settles AND
// a fresh validated list is read. HTTP also needs reconciliation after an uncertain write.
let activeWrite = false;
let uncertainWrite: { settled: boolean } | null = null;
const uncertainMessage = () => uncertainWrite
  ? uncertainWrite.settled
    ? "O resultado da última alteração não foi confirmado. Atualize as playlists e confira o resultado antes de repetir."
    : "A última alteração ainda está pendente. Atualize as playlists após a conclusão; não repita a operação."
  : "";

async function bounded<T>(write: boolean, work: (signal: AbortSignal) => Promise<T>, signal?: AbortSignal): Promise<T> {
  if (signal?.aborted) throw new PlaylistError("Operação cancelada.", 499);
  if (write && (activeWrite || uncertainWrite)) throw new PlaylistError(
    uncertainMessage() || "Já existe uma alteração de playlist em andamento. Aguarde a conclusão.", 409, true);
  const operation = { settled: false };
  if (write) activeWrite = true;
  try {
    return await withRequestDeadline(async deadlineSignal => {
      try { return await work(deadlineSignal); }
      finally { operation.settled = true; }
    }, signal);
  } catch (cause) {
    if (write && !(cause instanceof PlaylistError)) uncertainWrite = operation;
    if (cause instanceof RequestDeadlineError) throw new PlaylistError(
      write ? `A alteração não foi confirmada no prazo. ${uncertainMessage()}` : cause.message,
      cause.timedOut ? 408 : 499, write);
    if (cause instanceof PlaylistError) throw cause;
    throw new PlaylistError(write ? uncertainMessage() : "Não foi possível consultar as playlists. Tente novamente.", 503, write);
  } finally { if (write) activeWrite = false; }
}

/** Also used by cover uploads, which still belong to the local HTTP service. */
export function playlistHttp<T>(path: string, init: RequestInit = {}): Promise<T> {
  return bounded((init.method || "GET") !== "GET", async signal => {
    const response = await fetch(`${API}${path}`, { ...init, signal });
    const value = await response.json();
    if (!response.ok) throw new PlaylistError(typeof value?.error === "string" ? value.error : `Erro HTTP ${response.status}`, response.status);
    return value as T;
  }, init.signal || undefined);
}

/** Desktop commands never fall back to HTTP: a failed write must not run twice. */
async function request<T>(operation: Request, signal?: AbortSignal): Promise<T> {
  const bridge = (window as Window & { __TAURI__?: { core?: { invoke?: Invoke } } }).__TAURI__?.core;
  const invoke = bridge?.invoke;
  if (invoke) return bounded(operation.action !== "list", async () => {
    try { return await invoke<T>("native_playlists", { request: operation }); }
    catch (cause) {
      const error = cause as { error?: unknown; status?: unknown } | null;
      if (typeof error?.status !== "number") throw cause;
      throw new PlaylistError(typeof error?.error === "string" ? error.error : "Não foi possível acessar as playlists locais.", error.status);
    }
  }, signal);
  const encodedId = "id" in operation ? encodeURIComponent(operation.id) : "";
  let path = `/api/playlists${encodedId ? `/${encodedId}` : ""}`;
  let method = "GET";
  let body: unknown;
  switch (operation.action) {
    case "create": method = "POST"; body = { name: operation.name, description: operation.description }; break;
    case "update": method = "PATCH"; body = { name: operation.name, description: operation.description }; break;
    case "delete": method = "DELETE"; break;
    case "add_track": path += "/tracks"; method = "POST"; body = operation.track; break;
    case "add_tracks": path += "/tracks/bulk"; method = "POST"; body = { tracks: operation.tracks }; break;
    case "remove_entry": path += `/entries/${encodeURIComponent(operation.entry_id)}`; method = "DELETE"; break;
    case "reorder": path += "/order"; method = "PUT"; body = { entry_ids: operation.entry_ids }; break;
  }
  return playlistHttp<T>(path, {
    method, signal, ...(body === undefined ? {} : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
  });
}

export const playlists = {
  pendingMessage: uncertainMessage,
  list: async (signal?: AbortSignal) => {
    const pending = uncertainWrite;
    // The pending command must have settled BEFORE this read started.
    const canReconcile = !!pending?.settled && !activeWrite;
    const result = readResponse<{ playlists: Playlist[] }>(await request({ action: "list" }, signal), contracts.playlists, "playlists");
    if (canReconcile && uncertainWrite === pending && !activeWrite) uncertainWrite = null;
    return result;
  },
  create: (name: string, description = "") => request<PlaylistResult>({ action: "create", name, description }),
  update: (id: string, data: { name?: string; description?: string }) => request<PlaylistResult>({ action: "update", id, ...data }),
  remove: (id: string) => request<{ deleted: boolean }>({ action: "delete", id }),
  addTrack: (id: string, track: TrackInput) => request<PlaylistResult>({ action: "add_track", id, track }),
  addTracks: (id: string, tracks: TrackInput[]) => request<PlaylistResult & { added: number; duplicates: number; invalid: number }>({ action: "add_tracks", id, tracks }),
  removeEntry: (id: string, entry_id: string) => request<PlaylistResult & { deleted: boolean }>({ action: "remove_entry", id, entry_id }),
  reorder: (id: string, entry_ids: string[]) => request<PlaylistResult>({ action: "reorder", id, entry_ids }),
};
