import { useEffect, type ReactNode } from 'react'
import styles from './Modal.module.css'

interface Props {
  open: boolean
  onClose: () => void
  title?: string
  children: ReactNode
  width?: number
  /** Close on backdrop click. Defaults to true. Set false for forms where an
      accidental click outside would discard user input. */
  dismissOnBackdrop?: boolean
}

export function Modal({
  open, onClose, title, children, width = 360, dismissOnBackdrop = true
}: Props) {
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      className={styles.backdrop}
      onClick={dismissOnBackdrop ? onClose : undefined}
    >
      <div
        className={styles.card}
        style={{ width }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        {title && (
          <div className={styles.head}>
            <span className={styles.title}>{title}</span>
            <button className={styles.closeBtn} onClick={onClose} aria-label="Close">×</button>
          </div>
        )}
        <div className={styles.body}>{children}</div>
      </div>
    </div>
  )
}
