import { useState, useRef, useCallback } from 'react'
import styles from './InfoIcon.module.css'

interface Props {
  text: string
}

export function InfoIcon({ text }: Props) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null)
  const iconRef = useRef<HTMLSpanElement>(null)

  const show = useCallback(() => {
    const r = iconRef.current?.getBoundingClientRect()
    if (r) setPos({ x: r.left + r.width / 2, y: r.top })
  }, [])

  const hide = useCallback(() => setPos(null), [])

  return (
    <>
      <span
        ref={iconRef}
        className={styles.wrap}
        tabIndex={0}
        aria-label={text}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
      >
        <span className={styles.icon} aria-hidden>i</span>
      </span>

      {pos && (
        <span
          className={styles.tooltip}
          role="tooltip"
          style={{ left: pos.x, top: pos.y }}
        >
          {text}
        </span>
      )}
    </>
  )
}
