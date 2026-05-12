import { useEffect, useState } from 'react'

// Treat any portrait viewport up to ~1024 px wide as "mobile" (phones, phablets,
// tablets in portrait). Landscape always keeps the side-panel layout regardless
// of width, since horizontal space is the limiting axis there.
const QUERY = '(orientation: portrait) and (max-width: 1024px)'

function read(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false
  return window.matchMedia(QUERY).matches
}

export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState<boolean>(read)

  useEffect(() => {
    const mql = window.matchMedia(QUERY)
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches)
    mql.addEventListener?.('change', handler)
    return () => mql.removeEventListener?.('change', handler)
  }, [])

  return isMobile
}
