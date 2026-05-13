import type { Waypoint, RouteOptions } from '../types'

interface SharedRoutePayload {
  v: 1
  wps: Waypoint[]
  opts: RouteOptions
}

// Compact base64url. Handles non-ASCII place names via UTF-8 round-trip.
function b64UrlEncode(bytes: string): string {
  return btoa(bytes)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}
function b64UrlDecode(token: string): string {
  const padded = token.replace(/-/g, '+').replace(/_/g, '/')
  return atob(padded)
}

/** Serialise a route into an opaque base64url token. */
export function encodeRoute(wps: Waypoint[], opts: RouteOptions): string {
  const payload: SharedRoutePayload = { v: 1, wps, opts }
  const json = JSON.stringify(payload)
  // unescape(encodeURIComponent(...)) turns the UTF-8 string into a binary
  // string of single-byte chars that btoa can consume.
  return b64UrlEncode(unescape(encodeURIComponent(json)))
}

/** Parse a base64url token back into a SharedRoutePayload. Null on any error. */
export function decodeRoute(token: string): SharedRoutePayload | null {
  try {
    const binary = b64UrlDecode(token)
    const json = decodeURIComponent(escape(binary))
    const obj = JSON.parse(json) as SharedRoutePayload
    if (obj.v !== 1 || !Array.isArray(obj.wps)) return null
    // Minimal shape validation — drop bogus entries.
    obj.wps = obj.wps.filter(w =>
      w && typeof w.lat === 'number' && typeof w.lng === 'number' && typeof w.name === 'string'
    )
    if (obj.wps.length < 2) return null
    return obj
  } catch {
    return null
  }
}

/** Full URL pointing at the current origin/path with this route as `?r=...`. */
export function buildShareUrl(wps: Waypoint[], opts: RouteOptions): string {
  const token = encodeRoute(wps, opts)
  const url = new URL(window.location.href)
  url.search = `?r=${token}`
  url.hash = ''
  return url.toString()
}
