import { useState, useCallback, useEffect, useRef } from 'react'
import { fetchRoute } from '../api/client'
import { DEFAULT_ROUTE_OPTIONS } from '../types'
import type { Waypoint, RouteResult, RouteOptions } from '../types'

const ROUTE_DEBOUNCE_MS = 450

export function useRoute() {
  const [waypoints, setWaypointsState] = useState<(Waypoint | null)[]>([null, null])
  const [route, setRoute] = useState<RouteResult | null>(null)
  const [options, setOptionsState] = useState<RouteOptions>(DEFAULT_ROUTE_OPTIONS)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const reqId = useRef(0)

  const planRoute = useCallback(async (pts: Waypoint[], opts: RouteOptions) => {
    const id = ++reqId.current
    setLoading(true)
    setError(null)
    try {
      const result = await fetchRoute(pts, opts)
      if (id === reqId.current) setRoute(result)
    } catch (err) {
      if (id === reqId.current) {
        setError(err instanceof Error ? err.message : 'Routing failed')
        setRoute(null)
      }
    } finally {
      if (id === reqId.current) setLoading(false)
    }
  }, [])

  // Debounced auto-route: only fires when all waypoints are set
  useEffect(() => {
    const allSet = waypoints.length >= 2 && waypoints.every((w): w is Waypoint => w !== null)
    if (!allSet) { setRoute(null); return }
    const timer = setTimeout(() => planRoute(waypoints as Waypoint[], options), ROUTE_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [waypoints, options, planRoute])

  const setWaypoint = useCallback((idx: number, wp: Waypoint | null) => {
    setWaypointsState(prev => prev.map((p, i) => (i === idx ? wp : p)))
  }, [])

  const insertWaypointBefore = useCallback((idx: number) => {
    setWaypointsState(prev => [...prev.slice(0, idx), null, ...prev.slice(idx)])
  }, [])

  const insertWaypointAfter = useCallback((idx: number) => {
    setWaypointsState(prev => [...prev.slice(0, idx + 1), null, ...prev.slice(idx + 1)])
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

  const retry = useCallback(() => {
    const allSet = waypoints.length >= 2 && waypoints.every((w): w is Waypoint => w !== null)
    if (allSet) planRoute(waypoints as Waypoint[], options)
  }, [waypoints, options, planRoute])

  return {
    waypoints, route, loading, error, options,
    setWaypoint,
    insertWaypointBefore, insertWaypointAfter, removeWaypoint,
    setOption, setOptions,
    swap, clearAll, retry
  }
}
