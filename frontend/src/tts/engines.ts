// TTS engine abstraction. Currently only WebSpeechTTS is implemented; PiperTTS
// is a stub so the rest of the app can be wired against the interface today
// and a Piper (or any other) engine can be plugged in later without changes.

export type TTSEngineId = 'web' | 'piper'

export interface TTSEngine {
  readonly id: TTSEngineId
  isAvailable(): boolean
  speak(text: string, lang: string): void
  cancel(): void
}

class WebSpeechTTS implements TTSEngine {
  readonly id: TTSEngineId = 'web'

  isAvailable(): boolean {
    return typeof window !== 'undefined' && 'speechSynthesis' in window
  }

  private pickVoice(lang: string): SpeechSynthesisVoice | null {
    const voices = window.speechSynthesis.getVoices()
    if (voices.length === 0) return null
    const exact = voices.find(v => v.lang.toLowerCase() === lang.toLowerCase())
    if (exact) return exact
    const prefix = lang.split('-')[0].toLowerCase()
    return voices.find(v => v.lang.toLowerCase().startsWith(prefix)) ?? null
  }

  speak(text: string, lang: string): void {
    if (!this.isAvailable() || !text) return
    const u = new SpeechSynthesisUtterance(text)
    u.lang = lang
    const v = this.pickVoice(lang)
    if (v) u.voice = v
    u.rate = 1.0
    u.pitch = 1.0
    window.speechSynthesis.speak(u)
  }

  cancel(): void {
    if (this.isAvailable()) window.speechSynthesis.cancel()
  }
}

// Placeholder so the engine selector is forward-compatible. When you swap in a
// real Piper integration (WASM in-browser, or a backend endpoint), only this
// class changes — nothing else in the app needs to know.
class PiperTTS implements TTSEngine {
  readonly id: TTSEngineId = 'piper'
  isAvailable(): boolean { return false }
  speak(_text: string, _lang: string): void { /* not implemented yet */ }
  cancel(): void { /* not implemented yet */ }
}

const engines: Record<TTSEngineId, TTSEngine> = {
  web: new WebSpeechTTS(),
  piper: new PiperTTS()
}

export function getEngine(id: TTSEngineId): TTSEngine {
  return engines[id]
}
