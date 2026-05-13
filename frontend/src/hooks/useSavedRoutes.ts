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

// Module-level store + listeners so every useSavedRoutes() consumer stays in
// sync after any mutation.
let store: SavedRoute[] = getJSON<SavedRoute[]>(KEY, [])
const listeners = new Set<() => void>()

function setStore(updater: (prev: SavedRoute[]) => SavedRoute[]): void {
  store = updater(store)
  setJSON(KEY, store)
  listeners.forEach(l => l())
}

export function useSavedRoutes() {
  const [routes, setRoutes] = useState<SavedRoute[]>(store)

  useEffect(() => {
    const onUpdate = () => setRoutes(store)
    listeners.add(onUpdate)
    onUpdate()
    return () => { listeners.delete(onUpdate) }
  }, [])

  useEffect(() => { requestPersistentStorage() }, [])

  const save = useCallback((name: string, waypoints: Waypoint[], options: RouteOptions) => {
    const entry: SavedRoute = {
      v: 1, id: newId(), name: name.trim() || 'Route',
      waypoints, options, createdAt: Date.now()
    }
    setStore(prev => [entry, ...prev])
    return entry.id
  }, [])

  const remove = useCallback((id: string) => {
    setStore(prev => prev.filter(r => r.id !== id))
  }, [])

  const rename = useCallback((id: string, name: string) => {
    setStore(prev => prev.map(r => r.id === id ? { ...r, name: name.trim() || r.name } : r))
  }, [])

  return { routes, save, remove, rename }
}
