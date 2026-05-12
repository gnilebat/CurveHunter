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

export function useCustomPresets() {
  const [presets, setPresets] = useState<CustomPreset[]>(() =>
    getJSON<CustomPreset[]>(KEY, [])
  )

  useEffect(() => { setJSON(KEY, presets) }, [presets])
  useEffect(() => { requestPersistentStorage() }, [])

  const save = useCallback((name: string, options: RouteOptions) => {
    const entry: CustomPreset = {
      v: 1, id: newId(), name: name.trim() || 'Preset',
      options, createdAt: Date.now()
    }
    setPresets(prev => [...prev, entry])
    return entry.id
  }, [])

  const remove = useCallback((id: string) => {
    setPresets(prev => prev.filter(p => p.id !== id))
  }, [])

  const rename = useCallback((id: string, name: string) => {
    setPresets(prev => prev.map(p => p.id === id ? { ...p, name: name.trim() || p.name } : p))
  }, [])

  return { presets, save, remove, rename }
}
