import type { RouteResult, SearchResult, Waypoint } from '../types'

const BASE = '/api'

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...init
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`API error ${res.status}: ${text}`)
  }
  return res.json()
}

export async function fetchRoute(
  start: Waypoint,
  end: Waypoint,
  preferCurvy: boolean
): Promise<RouteResult> {
  return apiFetch<RouteResult>('/route', {
    method: 'POST',
    body: JSON.stringify({ start, end, prefer_curvy: preferCurvy })
  })
}

export async function searchPlaces(query: string): Promise<SearchResult[]> {
  const q = encodeURIComponent(query)
  return apiFetch<SearchResult[]>(`/search?q=${q}`)
}
