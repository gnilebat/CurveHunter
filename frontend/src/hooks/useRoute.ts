import { useState, useCallback, useEffect, useRef } from 'react'
import { fetchRoute } from '../api/client'
import type { Waypoint, RouteResult } from '../types'

export function useRoute() {
  const [start, setStart] = useState<Waypoint | null>(null)
  const [end, setEnd] = useState<Waypoint | null>(null)
  const [route, setRoute] = useState<RouteResult | null>(null)
  const [preferCurvy, setPreferCurvy] = useState(true)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const reqId = useRef(0)

  const planRoute = useCallback(async (s: Waypoint, e: Waypoint, curvy: boolean) => {
    const id = ++reqId.current
    setLoading(true)
    setError(null)
    try {
      const result = await fetchRoute(s, e, curvy)
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

  // Auto-route whenever both points or the curvy flag change
  useEffect(() => {
    if (start && end) {
      planRoute(start, end, preferCurvy)
    } else {
      setRoute(null)
    }
  }, [start, end, preferCurvy, planRoute])

  const updateStart = useCallback((wp: Waypoint | null) => { setStart(wp) }, [])
  const updateEnd = useCallback((wp: Waypoint | null) => { setEnd(wp) }, [])

  const swap = useCallback(() => {
    setStart(end)
    setEnd(start)
  }, [start, end])

  const clearAll = useCallback(() => {
    setStart(null)
    setEnd(null)
    setRoute(null)
    setError(null)
  }, [])

  const retry = useCallback(() => {
    if (start && end) planRoute(start, end, preferCurvy)
  }, [start, end, preferCurvy, planRoute])

  return {
    start, end, route, loading, error, preferCurvy,
    setStart: updateStart,
    setEnd: updateEnd,
    setPreferCurvy,
    swap,
    clearAll,
    retry
  }
}
