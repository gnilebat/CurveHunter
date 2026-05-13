import { useCallback, useEffect, useState } from 'react'
import { getJSON, setJSON, newId, requestPersistentStorage } from '../lib/storage'
import type { RouteOptions } from '../types'

export interface CustomPreset {
  v: 1
  id: string
  name: string
  options: RouteOptions
  createdAt: number
}

const KEY = 'curvehunter.customPresets'

// Module-level store + listeners so every useCustomPresets() consumer stays
// in sync after any mutation.
let store: CustomPreset[] = getJSON<CustomPreset[]>(KEY, [])
const listeners = new Set<() => void>()

function setStore(updater: (prev: CustomPreset[]) => CustomPreset[]): void {
  store = updater(store)
  setJSON(KEY, store)
  listeners.forEach(l => l())
}

export function useCustomPresets() {
  const [presets, setPresets] = useState<CustomPreset[]>(store)

  useEffect(() => {
    const onUpdate = () => setPresets(store)
    listeners.add(onUpdate)
    onUpdate()
    return () => { listeners.delete(onUpdate) }
  }, [])

  useEffect(() => { requestPersistentStorage() }, [])

  const save = useCallback((name: string, options: RouteOptions) => {
    const entry: CustomPreset = {
      v: 1, id: newId(), name: name.trim() || 'Preset',
      options, createdAt: Date.now()
    }
    setStore(prev => [...prev, entry])
    return entry.id
  }, [])

  const remove = useCallback((id: string) => {
    setStore(prev => prev.filter(p => p.id !== id))
  }, [])

  const rename = useCallback((id: string, name: string) => {
    setStore(prev => prev.map(p => p.id === id ? { ...p, name: name.trim() || p.name } : p))
  }, [])

  return { presets, save, remove, rename }
}
