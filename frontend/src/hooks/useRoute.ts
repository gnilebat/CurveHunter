import { useState, useCallback, useEffect, useRef } from 'react'
import { fetchRoute } from '../api/client'
import { DEFAULT_ROUTE_OPTIONS } from '../types'
import type { Waypoint, RouteResult, RouteOptions } from '../types'

const ROUTE_DEBOUNCE_MS = 450

export function useRoute() {
  const [start, setStart] = useState<Waypoint | null>(null)
  const [end, setEnd] = useState<Waypoint | null>(null)
  const [route, setRoute] = useState<RouteResult | null>(null)
  const [options, setOptionsState] = useState<RouteOptions>(DEFAULT_ROUTE_OPTIONS)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const reqId = useRef(0)

  const planRoute = useCallback(async (s: Waypoint, e: Waypoint, opts: RouteOptions) => {
    const id = ++reqId.current
    setLoading(true)
    setError(null)
    try {
      const result = await fetchRoute(s, e, opts)
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

  // Debounced auto-route: triggers on start/end/options change
  useEffect(() => {
    if (!start || !end) { setRoute(null); return }
    const timer = setTimeout(() => planRoute(start, end, options), ROUTE_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [start, end, options, planRoute])

  const setOption = useCallback(<K extends keyof RouteOptions>(key: K, value: RouteOptions[K]) => {
    setOptionsState(prev => ({ ...prev, [key]: value }))
  }, [])

  const setOptions = useCallback((opts: RouteOptions) => setOptionsState(opts), [])

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
    if (start && end) planRoute(start, end, options)
  }, [start, end, options, planRoute])

  return {
    start, end, route, loading, error, options,
    setStart, setEnd,
    setOption, setOptions,
    swap, clearAll, retry
  }
}
