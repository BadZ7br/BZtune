import { isLyricDelay, isLyricsResult } from "./lyrics";
/** Validate the entire import before touching persistent state. */
const tabs = ["home", "search", "recommendations", "categories", "collection", "favorites", "library", "playlists", "discovery", "stats", "maintenance", "system"];
function object(value: unknown): value is Record<string, unknown> { return !!value && typeof value === "object" && !Array.isArray(value); }
function track(value: unknown): boolean {
  return object(value) && ["videoId", "title", "artist"].every(key => typeof value[key] === "string")
    && ["audioUrl", "cover", "album"].every(key => value[key] == null || typeof value[key] === "string")
    && (value.preferredSource == null || ["auto", "local", "online"].includes(String(value.preferredSource)));
}
function preferences(value: unknown): boolean {
  if (!object(value)) return false;
  const choices: Record<string, readonly string[]> = {
    theme: ["dark", "midnight", "light", "system"], density: ["compact", "normal", "spacious"],
    fontSize: ["small", "medium", "large"], corners: ["square", "soft", "round"],
    startPage: ["last", "home", "explore", "library", "system"],
  };
  const flags = ["transparency", "animations", "shadows", "sidebarGlow", "focusRings", "autoUpdates"];
  return Object.entries(value).every(([key, entry]) => key === "accent" ? typeof entry === "string" && /^#[0-9a-f]{6}$/i.test(entry)
    : choices[key] ? typeof entry === "string" && choices[key].includes(entry)
    : flags.includes(key) && typeof entry === "boolean");
}
function valid(key: string, raw: string): boolean {
  if (/^bztune-lyrics-offset-v1:(local|online):(manual|lrclib):.{1,250}$/.test(key)) return isLyricDelay(JSON.parse(raw));
  if (/^bztune-lyrics-source-v1:.{1,250}$/.test(key)) return raw === "manual" || raw === "lrclib";
  if (/^bztune-lyrics-v1:.{1,250}$/.test(key)) return isLyricsResult(JSON.parse(raw));
  if (key === "bztune-library-query") return raw.length <= 10000;
  if (key === "bztune-library-view") return ["tracks", "albums", "artists"].includes(raw);
  if (key === "bztune-library-sort") return ["count", "title", "artist"].includes(raw);
  if (key === "doomvault-last-tab") return tabs.includes(raw);
  if (/^doomvault-lrc-v11:.{1,250}$/.test(key)) return raw.length <= 1024 * 1024;
  const value: unknown = JSON.parse(raw);
  switch (key) {
    case "doomvault-favorites": case "doomvault-collection": return Array.isArray(value) && value.every(x => typeof x === "string");
    case "doomvault-api-albums": return Array.isArray(value) && value.every(x => object(x) && ["id", "title", "artist"].every(k => typeof x[k] === "string") && (x.cover == null || typeof x.cover === "string") && (x.year == null || typeof x.year === "string" || (typeof x.year === "number" && Number.isFinite(x.year))));
    case "bztune-settings-v1": return preferences(value);
    case "doomvault-player-state-v11": return object(value) && Array.isArray(value.tracks) && value.tracks.length <= 500 && value.tracks.every(track)
      && Number.isInteger(value.index) && Number(value.index) >= -1 && Number(value.index) < value.tracks.length
      && typeof value.shuffle === "boolean" && ["off", "all", "one"].includes(String(value.repeat));
    case "bztune-player-volume-v13": return object(value) && typeof value.volume === "number" && value.volume >= 0 && value.volume <= 100 && typeof value.muted === "boolean";
    case "bztune-crossfade-v13": return typeof value === "number" && value >= 0 && value <= 10;
    case "bztune-mini-v131": return typeof value === "boolean";
    case "doomvault-eq-v11": return Array.isArray(value) && value.length === 3 && value.every(x => typeof x === "number" && x >= -12 && x <= 12);
    case "doomvault-resume-position-v11": return object(value) && typeof value.videoId === "string" && typeof value.seconds === "number" && value.seconds >= 0;
    case "doomvault-listening-history-v11": return Array.isArray(value) && value.length <= 50 && value.every(x => track(x) && object(x) && typeof x.playedAt === "number");
    default: return false;
  }
}
export function parseBrowserBackup(value: unknown): [string, string][] {
  if (!object(value) || value.format !== "bztune-browser-settings-v1" || !object(value.settings)) throw new Error("Formato de configurações inválido.");
  const entries = Object.entries(value.settings);
  if (!entries.length || entries.some(([key, raw]) => { try { return typeof raw !== "string" || !valid(key, raw); } catch { return true; } })) {
    throw new Error("O arquivo contém configurações desconhecidas ou inválidas. Nenhuma alteração foi aplicada.");
  }
  return entries as [string, string][];
}
export function applyBrowserBackup(entries: [string, string][], storage: Storage): void {
  const before = entries.map(([key]) => [key, storage.getItem(key)] as const);
  try { for (const [key, value] of entries) storage.setItem(key, value); }
  catch {
    let restored = true;
    for (const [key, value] of before) {
      try { if (value === null) storage.removeItem(key); else storage.setItem(key, value); }
      catch { restored = false; }
    }
    throw new Error(restored ? "Não foi possível gravar. As configurações anteriores foram restauradas." : "A gravação e parte da recuperação falharam. Mantenha o JSON original e tente novamente quando o armazenamento estiver disponível.");
  }
}
