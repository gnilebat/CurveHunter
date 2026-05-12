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

export function useSavedPlaces() {
  const [places, setPlaces] = useState<SavedPlace[]>(() => getJSON<SavedPlace[]>(KEY, []))

  useEffect(() => { setJSON(KEY, places) }, [places])
  useEffect(() => { requestPersistentStorage() }, [])

  const save = useCallback((name: string, lat: number, lng: number) => {
    const entry: SavedPlace = {
      v: 1, id: newId(), name: name.trim() || 'Place',
      lat, lng, createdAt: Date.now()
    }
    setPlaces(prev => [entry, ...prev])
    return entry.id
  }, [])

  const remove = useCallback((id: string) => {
    setPlaces(prev => prev.filter(p => p.id !== id))
  }, [])

  const rename = useCallback((id: string, name: string) => {
    setPlaces(prev => prev.map(p => p.id === id ? { ...p, name: name.trim() || p.name } : p))
  }, [])

  return { places, save, remove, rename }
}
