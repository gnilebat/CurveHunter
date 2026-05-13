import { useState, useCallback, useEffect, useRef } from 'react'
import { ApiError, fetchRoute, type RoundTripParams } from '../api/client'
import { DEFAULT_ROUTE_OPTIONS } from '../types'
import { getJSON, setJSON } from '../lib/storage'
import type { Waypoint, RouteResult, RouteOptions, AlternativeRoute } from '../types'

const ROUTE_DEBOUNCE_MS = 450

const OPTIONS_KEY = 'curvehunter.routeOptions'
const ROUND_TRIP_KEY = 'curvehunter.roundTrip'

export interface RoundTripState {
  enabled: boolean
  distanceKm: number
  seed?: number
}

const DEFAULT_ROUND_TRIP: RoundTripState = { enabled: false, distanceKm: 80 }

export interface RouteError {
  key: string
  vars?: Record<string, string | number>
}

function classifyRouteError(err: unknown): RouteError {
  if (err instanceof ApiError) {
    if (err.status === 0) return { key: 'errors.network' }
    if (err.status === 404) {
      const d = err.detail as { message?: string; point_index?: number } | null
      if (d && typeof d === 'object') {
        if (typeof d.point_index === 'number') {
          return { key: 'errors.pointOutOfCoverage', vars: { n: d.point_index + 1 } }
        }
        if (typeof d.message === 'string' && /point/i.test(d.message)) {
          return { key: 'errors.pointOutOfCoverageUnknown' }
        }
      }
      return { key: 'errors.noRouteFound' }
    }
    if (err.status >= 500) return { key: 'errors.serverBusy' }
  }
  return { key: 'errors.routingFailed' }
}

export function useRoute() {
  const [waypoints, setWaypointsState] = useState<(Waypoint | null)[]>([null, null])
  const [route, setRoute] = useState<RouteResult | null>(null)
  // Restore the user's last preset / option tweaks and round-trip toggle so
  // reloading the page doesn't reset them. The seed is intentionally dropped
  // — a fresh visit shouldn't replay the exact previous round trip geometry.
  const [options, setOptionsState] = useState<RouteOptions>(
    () => getJSON<RouteOptions>(OPTIONS_KEY, DEFAULT_ROUTE_OPTIONS)
  )
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<RouteError | null>(null)
  const [roundTrip, setRoundTripState] = useState<RoundTripState>(() => {
    const stored = getJSON<RoundTripState>(ROUND_TRIP_KEY, DEFAULT_ROUND_TRIP)
    return { ...stored, seed: undefined }
  })

  useEffect(() => { setJSON(OPTIONS_KEY, options) }, [options])
  useEffect(() => {
    // Don't persist the random seed — only the user-chosen toggle + distance.
    const { enabled, distanceKm } = roundTrip
    setJSON(ROUND_TRIP_KEY, { enabled, distanceKm } satisfies RoundTripState)
  }, [roundTrip])
  const reqId = useRef(0)

  const planRoute = useCallback(async (
    pts: Waypoint[],
    opts: RouteOptions,
    rt?: RoundTripParams
  ) => {
    const id = ++reqId.current
    setLoading(true)
    setError(null)
    try {
      const result = await fetchRoute(pts, opts, rt)
      if (id === reqId.current) setRoute(result)
    } catch (err) {
      if (id === reqId.current) {
        setError(classifyRouteError(err))
        setRoute(null)
      }
    } finally {
      if (id === reqId.current) setLoading(false)
    }
  }, [])

  // Debounced auto-route. In round-trip mode we just need the start waypoint;
  // in point-to-point mode we need every waypoint set.
  useEffect(() => {
    if (roundTrip.enabled) {
      const start = waypoints[0]
      if (!start) { setRoute(null); return }
      const timer = setTimeout(
        () => planRoute([start], options, { distanceKm: roundTrip.distanceKm, seed: roundTrip.seed }),
        ROUTE_DEBOUNCE_MS
      )
      return () => clearTimeout(timer)
    }
    const allSet = waypoints.length >= 2 && waypoints.every((w): w is Waypoint => w !== null)
    if (!allSet) {
      // Keep the previously computed route on screen while the user is still
      // filling in a newly-added Zwischenziel — only clear it when neither
      // endpoint is set (the user has effectively reset the plan).
      const start = waypoints[0]
      const end = waypoints[waypoints.length - 1]
      if (!start && !end) setRoute(null)
      return
    }
    const timer = setTimeout(() => planRoute(waypoints as Waypoint[], options), ROUTE_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [waypoints, options, roundTrip, planRoute])

  const setWaypoint = useCallback((idx: number, wp: Waypoint | null) => {
    setWaypointsState(prev => prev.map((p, i) => (i === idx ? wp : p)))
  }, [])

  const insertWaypointBefore = useCallback((idx: number) => {
    setWaypointsState(prev => [...prev.slice(0, idx), null, ...prev.slice(idx)])
  }, [])

  const insertWaypointAfter = useCallback((idx: number) => {
    setWaypointsState(prev => [...prev.slice(0, idx + 1), null, ...prev.slice(idx + 1)])
  }, [])

  // Insert a populated waypoint at index 0 (existing waypoints shift right).
  // Used by the off-route "navigate to start" action.
  const prependWaypoint = useCallback((wp: Waypoint) => {
    setWaypointsState(prev => [wp, ...prev])
  }, [])

  // Insert a populated waypoint at an arbitrary index (existing items shift).
  // Used when the user drags the route line to add a via point.
  const insertWaypointAt = useCallback((idx: number, wp: Waypoint) => {
    setWaypointsState(prev => {
      const clamped = Math.min(Math.max(idx, 0), prev.length)
      return [...prev.slice(0, clamped), wp, ...prev.slice(clamped)]
    })
  }, [])

  const removeWaypoint = useCallback((idx: number) => {
    setWaypointsState(prev => (prev.length > 2 ? prev.filter((_, i) => i !== idx) : prev))
  }, [])

  const setOption = useCallback(<K extends keyof RouteOptions>(key: K, value: RouteOptions[K]) => {
    setOptionsState(prev => ({ ...prev, [key]: value }))
  }, [])

  const setOptions = useCallback((opts: RouteOptions) => setOptionsState(opts), [])

  const swap = useCallback(() => {
    setWaypointsState(prev => [...prev].reverse())
  }, [])

  const clearAll = useCallback(() => {
    setWaypointsState([null, null])
    setRoute(null)
    setError(null)
  }, [])

  // Replace waypoints and options atomically (used when loading a saved route).
  // Single-tick state update — no race between option set and auto-router.
  const loadRoute = useCallback((wps: Waypoint[], opts: RouteOptions) => {
    setWaypointsState(wps.length >= 2 ? wps : [...wps, null])
    setOptionsState(opts)
    setRoute(null)
    setError(null)
  }, [])

  const retry = useCallback(() => {
    if (roundTrip.enabled && waypoints[0]) {
      planRoute([waypoints[0]], options, { distanceKm: roundTrip.distanceKm, seed: roundTrip.seed })
      return
    }
    const allSet = waypoints.length >= 2 && waypoints.every((w): w is Waypoint => w !== null)
    if (allSet) planRoute(waypoints as Waypoint[], options)
  }, [waypoints, options, roundTrip, planRoute])

  // Swap a saved alternative into the primary slot, demoting the current
  // primary to the alternatives array. Pure state swap — does not refetch.
  const selectAlternative = useCallback((idx: number) => {
    setRoute(prev => {
      if (!prev) return prev
      if (idx < 0 || idx >= prev.alternatives.length) return prev
      const chosen = prev.alternatives[idx]
      const demoted: AlternativeRoute = {
        geometry: prev.geometry,
        distanceM: prev.distanceM,
        durationS: prev.durationS,
        ascentM: prev.ascentM,
        descentM: prev.descentM,
        motorwayM: prev.motorwayM,
        trunkM: prev.trunkM,
        curvatureScore: prev.curvatureScore,
        segments: prev.segments,
        instructions: prev.instructions,
        maxSpeedPerVertex: prev.maxSpeedPerVertex
      }
      const newAlts = [
        ...prev.alternatives.slice(0, idx),
        demoted,
        ...prev.alternatives.slice(idx + 1)
      ]
      return { ...chosen, alternatives: newAlts }
    })
  }, [])

  const setRoundTrip = useCallback((rt: Partial<RoundTripState>) => {
    setRoundTripState(prev => ({ ...prev, ...rt }))
  }, [])

  const reshuffleRoundTrip = useCallback(() => {
    setRoundTripState(prev => ({ ...prev, seed: Math.floor(Math.random() * 1_000_000) }))
  }, [])

  return {
    waypoints, route, loading, error, options, roundTrip,
    setWaypoint,
    insertWaypointBefore, insertWaypointAfter, removeWaypoint,
    setOption, setOptions,
    setRoundTrip, reshuffleRoundTrip,
    selectAlternative,
    swap, clearAll, loadRoute, prependWaypoint, insertWaypointAt, retry
  }
}
