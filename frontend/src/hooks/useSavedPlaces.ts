import { useCallback, useEffect, useState } from 'react'
import { getJSON, setJSON, newId, requestPersistentStorage } from '../lib/storage'

export interface SavedPlace {
  v: 1
  id: string
  name: string
  lat: number
  lng: number
  createdAt: number
}

const KEY = 'curvehunter.savedPlaces'

// Module-level store + listener set so every component that calls
// useSavedPlaces sees the same data. Without this, each hook instance kept
// its own React state and a `save` in one component left other components
// (e.g. SearchInput) unaware until reload.
let store: SavedPlace[] = getJSON<SavedPlace[]>(KEY, [])
const listeners = new Set<() => void>()

function setStore(updater: (prev: SavedPlace[]) => SavedPlace[]): void {
  store = updater(store)
  setJSON(KEY, store)
  listeners.forEach(l => l())
}

export function useSavedPlaces() {
  const [places, setPlaces] = useState<SavedPlace[]>(store)

  useEffect(() => {
    const onUpdate = () => setPlaces(store)
    listeners.add(onUpdate)
    // In case the store changed between this component's render and the
    // listener attaching, resync once.
    onUpdate()
    return () => { listeners.delete(onUpdate) }
  }, [])

  useEffect(() => { requestPersistentStorage() }, [])

  const save = useCallback((name: string, lat: number, lng: number) => {
    const entry: SavedPlace = {
      v: 1, id: newId(), name: name.trim() || 'Place',
      lat, lng, createdAt: Date.now()
    }
    setStore(prev => [entry, ...prev])
    return entry.id
  }, [])

  const remove = useCallback((id: string) => {
    setStore(prev => prev.filter(p => p.id !== id))
  }, [])

  const rename = useCallback((id: string, name: string) => {
    setStore(prev => prev.map(p => p.id === id ? { ...p, name: name.trim() || p.name } : p))
  }, [])

  return { places, save, remove, rename }
}
