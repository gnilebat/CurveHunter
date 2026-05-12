import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { getEngine, type TTSEngineId } from './engines'

const ENABLED_KEY = 'curvehunter.voice.enabled'
const ENGINE_KEY = 'curvehunter.voice.engine'

function loadEnabled(): boolean {
  try { return localStorage.getItem(ENABLED_KEY) !== 'false' } catch { return true }
}
function loadEngine(): TTSEngineId {
  try {
    const v = localStorage.getItem(ENGINE_KEY)
    if (v === 'web' || v === 'piper') return v
  } catch { /* ignore */ }
  return 'web'
}

export interface UseTTS {
  enabled: boolean
  setEnabled: (on: boolean) => void
  engineId: TTSEngineId
  setEngineId: (id: TTSEngineId) => void
  available: boolean
  speak: (text: string, lang: string) => void
  cancel: () => void
}

export function useTTS(): UseTTS {
  const [enabled, setEnabledState] = useState<boolean>(loadEnabled)
  const [engineId, setEngineIdState] = useState<TTSEngineId>(loadEngine)
  const engineRef = useRef(getEngine(engineId))

  useEffect(() => {
    engineRef.current.cancel()
    engineRef.current = getEngine(engineId)
  }, [engineId])

  // Cancel any speech when disabled flips off, and on unmount.
  useEffect(() => {
    if (!enabled) engineRef.current.cancel()
  }, [enabled])
  useEffect(() => () => { engineRef.current.cancel() }, [])

  const setEnabled = useCallback((on: boolean) => {
    setEnabledState(on)
    try { localStorage.setItem(ENABLED_KEY, on ? 'true' : 'false') } catch { /* ignore */ }
  }, [])

  const setEngineId = useCallback((id: TTSEngineId) => {
    setEngineIdState(id)
    try { localStorage.setItem(ENGINE_KEY, id) } catch { /* ignore */ }
  }, [])

  const speak = useCallback((text: string, lang: string) => {
    if (!enabled) return
    engineRef.current.speak(text, lang)
  }, [enabled])

  const cancel = useCallback(() => {
    engineRef.current.cancel()
  }, [])

  const available = useMemo(() => engineRef.current.isAvailable(), [engineId])

  return { enabled, setEnabled, engineId, setEngineId, available, speak, cancel }
}
