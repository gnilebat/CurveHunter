import { useState, useCallback } from 'react'
import { fetchRoute } from '../api/client'
import type { Waypoint, RouteResult } from '../types'

export function useRoute() {
  const [start, setStart] = useState<Waypoint | null>(null)
  const [end, setEnd] = useState<Waypoint | null>(null)
  const [route, setRoute] = useState<RouteResult | null>(null)
  const [preferCurvy, setPreferCurvy] = useState(true)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const planRoute = useCallback(async (s: Waypoint, e: Waypoint) => {
    setLoading(true)
    setError(null)
    try {
      const result = await fetchRoute(s, e, preferCurvy)
      setRoute(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Routing failed')
      setRoute(null)
    } finally {
      setLoading(false)
    }
  }, [preferCurvy])

  const updateStart = useCallback((wp: Waypoint) => {
    setStart(wp)
    setRoute(null)
  }, [])

  const updateEnd = useCallback((wp: Waypoint) => {
    setEnd(wp)
    setRoute(null)
    if (start) planRoute(start, wp)
  }, [start, planRoute])

  const clearRoute = useCallback(() => {
    setStart(null)
    setEnd(null)
    setRoute(null)
    setError(null)
  }, [])

  const retry = useCallback(() => {
    if (start && end) planRoute(start, end)
  }, [start, end, planRoute])

  return {
    start, end, route, loading, error, preferCurvy,
    setStart: updateStart,
    setEnd: updateEnd,
    setPreferCurvy,
    clearRoute,
    retry
  }
}
