import type { RouteResult, RouteSegment, RouteOptions, SearchResult, Waypoint } from '../types'

const BASE = '/api'

export class ApiError extends Error {
  status: number
  detail: unknown
  constructor(status: number, detail: unknown) {
    super(`API ${status}`)
    this.status = status
    this.detail = detail
  }
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response
  try {
    res = await fetch(`${BASE}${path}`, {
      headers: { 'Content-Type': 'application/json' },
      ...init
    })
  } catch {
    throw new ApiError(0, null)  // network failure
  }
  if (!res.ok) {
    let detail: unknown = null
    try { detail = (await res.json()).detail } catch { /* non-JSON body */ }
    throw new ApiError(res.status, detail)
  }
  return res.json()
}

interface RouteApiResponse {
  geometry: GeoJSON.LineString
  distance_m: number
  duration_s: number
  ascent_m: number
  descent_m: number
  motorway_m: number
  trunk_m: number
  curvature_score: number | null
  segments: { coordinates: number[][]; score: number; length_km: number; is_urban: boolean; is_highway: boolean; is_below_speed: boolean }[]
  instructions: {
    text: string
    distance_m: number
    duration_s: number
    sign: number
    street_name: string | null
    interval: [number, number]
  }[]
  ignored_urban: boolean
  max_speed_per_vertex: number[]
}

export interface RoundTripParams {
  distanceKm: number
  seed?: number
}

export async function fetchRoute(
  waypoints: Waypoint[],
  opts: RouteOptions,
  roundTrip?: RoundTripParams
): Promise<RouteResult> {
  const r = await apiFetch<RouteApiResponse>('/route', {
    method: 'POST',
    body: JSON.stringify({
      waypoints,
      options: {
        curviness: opts.curviness,
        avoid_motorways: opts.avoidMotorways,
        avoid_trunks: opts.avoidTrunks,
        avoid_urban: opts.avoidUrban,
        ignore_urban_curves: opts.ignoreUrbanCurves,
        min_curve_speed: opts.minCurveSpeed,
        avoid_unpaved: opts.avoidUnpaved
      },
      ...(roundTrip
        ? { round_trip: { distance_km: roundTrip.distanceKm, seed: roundTrip.seed ?? null } }
        : {})
    })
  })
  const segments: RouteSegment[] = r.segments.map(s => ({
    coordinates: s.coordinates,
    score: s.score,
    lengthKm: s.length_km,
    isUrban: s.is_urban,
    isHighway: s.is_highway,
    isBelowSpeed: s.is_below_speed
  }))
  return {
    geometry: r.geometry,
    distanceM: r.distance_m,
    durationS: r.duration_s,
    ascentM: r.ascent_m,
    descentM: r.descent_m,
    motorwayM: r.motorway_m,
    trunkM: r.trunk_m,
    curvatureScore: r.curvature_score,
    segments,
    instructions: r.instructions.map(i => ({
      text: i.text,
      distanceM: i.distance_m,
      durationS: i.duration_s,
      sign: i.sign,
      streetName: i.street_name,
      interval: i.interval
    })),
    maxSpeedPerVertex: r.max_speed_per_vertex ?? []
  }
}

export async function searchPlaces(query: string): Promise<SearchResult[]> {
  const q = encodeURIComponent(query)
  return apiFetch<SearchResult[]>(`/search?q=${q}`)
}
