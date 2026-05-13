import { useEffect, useState } from 'react'
import { useT } from '../i18n/LocaleProvider'

const DISMISS_KEY = 'curvehunter.pwa.installDismissed'

// Captured beforeinstallprompt event. Browsers don't publish a type for it,
// so we describe the bits we use.
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export function InstallPrompt() {
  const t = useT()
  const [evt, setEvt] = useState<BeforeInstallPromptEvent | null>(null)
  const [hidden, setHidden] = useState<boolean>(() => {
    try { return localStorage.getItem(DISMISS_KEY) === 'true' } catch { return false }
  })

  useEffect(() => {
    if (hidden) return
    const onPrompt = (e: Event) => {
      e.preventDefault()
      setEvt(e as BeforeInstallPromptEvent)
    }
    const onInstalled = () => {
      setEvt(null)
      setHidden(true)
      try { localStorage.setItem(DISMISS_KEY, 'true') } catch { /* ignore */ }
    }
    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [hidden])

  if (hidden || !evt) return null

  const install = async () => {
    try {
      await evt.prompt()
      const { outcome } = await evt.userChoice
      if (outcome === 'dismissed') dismiss()
    } catch { /* user cancelled */ }
    setEvt(null)
  }

  const dismiss = () => {
    setHidden(true)
    setEvt(null)
    try { localStorage.setItem(DISMISS_KEY, 'true') } catch { /* ignore */ }
  }

  return (
    <div
      role="dialog"
      aria-label={t('pwa.title')}
      style={{
        position: 'fixed',
        left: 12, right: 12, bottom: 'max(12px, env(safe-area-inset-bottom))',
        zIndex: 100,
        background: 'var(--bg)',
        color: 'var(--text)',
        border: '1px solid var(--border)',
        borderRadius: 14,
        boxShadow: '0 10px 30px var(--shadow-strong)',
        padding: '12px 14px',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        maxWidth: 480,
        margin: '0 auto'
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 2 }}>
          {t('pwa.title')}
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.35 }}>
          {t('pwa.body')}
        </div>
      </div>
      <button
        onClick={dismiss}
        style={{
          background: 'transparent', border: 'none',
          color: 'var(--text-muted)', cursor: 'pointer',
          fontSize: 13, padding: '6px 10px'
        }}
      >
        {t('pwa.dismiss')}
      </button>
      <button
        onClick={install}
        style={{
          background: 'var(--accent)', color: '#fff',
          border: 'none', borderRadius: 8,
          padding: '8px 14px', fontSize: 13, fontWeight: 700,
          cursor: 'pointer', flexShrink: 0
        }}
      >
        {t('pwa.install')}
      </button>
    </div>
  )
}
