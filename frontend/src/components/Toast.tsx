import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react'
import styles from './Toast.module.css'

// Lightweight transient-feedback toasts. Confirms otherwise-silent actions —
// saving a place/route/preset, exporting GPX, copying a share link. Messages
// are passed in already-localised (callers use useT()).

interface ToastItem { id: number; message: string }
type ToastFn = (message: string) => void

const ToastContext = createContext<ToastFn | null>(null)
const DURATION_MS = 3000

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])
  const nextId = useRef(0)

  const toast = useCallback<ToastFn>((message) => {
    const id = nextId.current++
    setItems(prev => [...prev, { id, message }])
    setTimeout(() => {
      setItems(prev => prev.filter(t => t.id !== id))
    }, DURATION_MS)
  }, [])

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div className={styles.wrap} role="status" aria-live="polite">
        {items.map(t => (
          <div key={t.id} className={styles.toast}>{t.message}</div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast(): ToastFn {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>')
  return ctx
}
