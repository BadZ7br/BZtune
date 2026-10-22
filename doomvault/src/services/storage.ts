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
