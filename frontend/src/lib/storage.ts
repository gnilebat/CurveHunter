// Thin typed wrappers over localStorage + a once-per-session call to mark the
// origin as "persistent" so the browser is less likely to evict our saved
// routes / presets / places under storage pressure.

export function getJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    if (raw === null) return fallback
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

export function setJSON<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Quota exceeded or storage unavailable — drop silently so the UI keeps working.
  }
}

export function removeKey(key: string): void {
  try { localStorage.removeItem(key) } catch { /* ignore */ }
}

let persistRequested = false
export async function requestPersistentStorage(): Promise<void> {
  if (persistRequested) return
  persistRequested = true
  if (typeof navigator === 'undefined' || !navigator.storage?.persist) return
  try { await navigator.storage.persist() } catch { /* ignore */ }
}

export function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `id_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}
