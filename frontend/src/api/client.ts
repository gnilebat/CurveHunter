import type { RouteResult, RouteSegment, RouteOptions, SearchResult, Waypoint } from '../types'

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

interface RouteApiResponse {
  geometry: GeoJSON.LineString
  distance_m: number
  duration_s: number
  ascent_m: number
  descent_m: number
  curvature_score: number | null
  segments: { coordinates: number[][]; score: number; length_km: number; is_urban: boolean; is_highway: boolean }[]
  instructions: {
    text: string
    distance_m: number
    duration_s: number
    sign: number
    street_name: string | null
    interval: [number, number]
  }[]
  ignored_urban: boolean
}

export async function fetchRoute(
  start: Waypoint,
  end: Waypoint,
  opts: RouteOptions
): Promise<RouteResult> {
  const r = await apiFetch<RouteApiResponse>('/route', {
    method: 'POST',
    body: JSON.stringify({
      start,
      end,
      options: {
        curviness: opts.curviness,
        avoid_motorways: opts.avoidMotorways,
        avoid_trunks: opts.avoidTrunks,
        avoid_urban: opts.avoidUrban,
        ignore_urban_curves: opts.ignoreUrbanCurves
      }
    })
  })
  const segments: RouteSegment[] = r.segments.map(s => ({
    coordinates: s.coordinates,
    score: s.score,
    lengthKm: s.length_km,
    isUrban: s.is_urban,
    isHighway: s.is_highway
  }))
  return {
    geometry: r.geometry,
    distanceM: r.distance_m,
    durationS: r.duration_s,
    ascentM: r.ascent_m,
    descentM: r.descent_m,
    curvatureScore: r.curvature_score,
    segments,
    instructions: r.instructions.map(i => ({
      text: i.text,
      distanceM: i.distance_m,
      durationS: i.duration_s,
      sign: i.sign,
      streetName: i.street_name,
      interval: i.interval
    }))
  }
}

export async function searchPlaces(query: string): Promise<SearchResult[]> {
  const q = encodeURIComponent(query)
  return apiFetch<SearchResult[]>(`/search?q=${q}`)
}
