import { useCallback, useEffect, useState } from 'react'
import { getJSON, setJSON, newId, requestPersistentStorage } from '../lib/storage'
import type { Waypoint, RouteOptions } from '../types'

export interface SavedRoute {
  v: 1
  id: string
  name: string
  waypoints: Waypoint[]
  options: RouteOptions
  createdAt: number
}

const KEY = 'curvehunter.savedRoutes'

export function useSavedRoutes() {
  const [routes, setRoutes] = useState<SavedRoute[]>(() => getJSON<SavedRoute[]>(KEY, []))

  useEffect(() => { setJSON(KEY, routes) }, [routes])
  useEffect(() => { requestPersistentStorage() }, [])

  const save = useCallback((name: string, waypoints: Waypoint[], options: RouteOptions) => {
    const entry: SavedRoute = {
      v: 1, id: newId(), name: name.trim() || 'Route',
      waypoints, options, createdAt: Date.now()
    }
    setRoutes(prev => [entry, ...prev])
    return entry.id
  }, [])

  const remove = useCallback((id: string) => {
    setRoutes(prev => prev.filter(r => r.id !== id))
  }, [])

  const rename = useCallback((id: string, name: string) => {
    setRoutes(prev => prev.map(r => r.id === id ? { ...r, name: name.trim() || r.name } : r))
  }, [])

  return { routes, save, remove, rename }
}
