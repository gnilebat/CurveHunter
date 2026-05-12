import { useEffect, useRef } from 'react'

// Keep the screen awake while `active` is true. The Wake Lock API is released
// automatically by the browser when the page is hidden, so we re-acquire on
// visibility change. No-op on browsers that don't support it.
export function useWakeLock(active: boolean): void {
  const sentinelRef = useRef<WakeLockSentinel | null>(null)

  useEffect(() => {
    if (!active) return
    if (typeof navigator === 'undefined' || !('wakeLock' in navigator)) return

    let cancelled = false

    const acquire = async () => {
      try {
        const s = await navigator.wakeLock.request('screen')
        if (cancelled) { s.release().catch(() => { /* ignore */ }); return }
        sentinelRef.current = s
        s.addEventListener('release', () => {
          if (sentinelRef.current === s) sentinelRef.current = null
        })
      } catch {
        // Permission denied or context lost — silently ignore.
      }
    }

    const onVisibility = () => {
      if (document.visibilityState === 'visible' && !sentinelRef.current) {
        acquire()
      }
    }

    acquire()
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVisibility)
      const s = sentinelRef.current
      sentinelRef.current = null
      if (s) s.release().catch(() => { /* ignore */ })
    }
  }, [active])
}
