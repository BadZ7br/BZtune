const pending = new Map<string, string | null>();
function notify() { window.dispatchEvent(new Event("bztune-storage-status")); }
export function readStorage(key: string): string | null {
  if (pending.has(key)) return pending.get(key)!;
  try { return localStorage.getItem(key); } catch { return null; }
}
export function isStoragePending(key: string): boolean { return pending.has(key); }
function persist(key: string, value: string | null): boolean {
  try {
    if (value === null) localStorage.removeItem(key); else localStorage.setItem(key, value);
    pending.delete(key);
    return true;
  } catch { pending.set(key, value); return false; }
}
export function writeStorage(key: string, value: string): boolean {
  const result = persist(key, value); notify(); return result;
}
export function removeStorage(key: string): boolean {
  const result = persist(key, null); notify(); return result;
}
export function unsavedStorage(): boolean { return pending.size > 0; }
export function retryStorage(): boolean {
  for (const [key, value] of pending) persist(key, value);
  notify(); return pending.size === 0;
}

/** A consistent session snapshot: pending values replace stale disk values; removals stay removed.
 * Reading failures must propagate so an incomplete snapshot is never presented as a full backup.
 */
export function snapshotStorage(storage: Storage = localStorage): Map<string, string> {
  const values = new Map<string, string>();
  for (let index = 0; index < storage.length; index++) {
    const key = storage.key(index);
    if (key === null) throw new Error("Não foi possível ler todas as configurações para exportar.");
    const value = storage.getItem(key);
    if (value !== null) values.set(key, value);
  }
  for (const [key, value] of pending) {
    if (value === null) values.delete(key); else values.set(key, value);
  }
  return values;
}
