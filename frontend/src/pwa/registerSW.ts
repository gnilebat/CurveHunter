// Register the app's service worker in production builds. No-op during
// `vite dev` so the SW can't accidentally cache stale Vite assets while
// developing.
export function registerSW(): void {
  if (!('serviceWorker' in navigator)) return
  if (import.meta.env.DEV) return
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Registration may fail on http (non-localhost) or in private mode —
      // silent failure is fine, the app still works without offline support.
    })
  })
}
