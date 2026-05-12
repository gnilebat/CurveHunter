import { useEffect, useState } from 'react'
import { Modal } from './Modal'
import { useLocale } from '../i18n/LocaleProvider'
import styles from './Modal.module.css'

interface Props {
  open: boolean
  title: string
  label: string
  initialValue?: string
  confirmLabel?: string
  onCancel: () => void
  onConfirm: (value: string) => void
}

export function PromptDialog({
  open, title, label, initialValue = '', confirmLabel,
  onCancel, onConfirm
}: Props) {
  const { t } = useLocale()
  const [value, setValue] = useState(initialValue)

  useEffect(() => { if (open) setValue(initialValue) }, [open, initialValue])

  return (
    <Modal open={open} onClose={onCancel} title={title}>
      <div className={styles.field}>
        <label>{label}</label>
        <input
          className={styles.input}
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && value.trim()) onConfirm(value.trim())
          }}
        />
      </div>
      <div className={styles.actions}>
        <button className={styles.btn} onClick={onCancel}>{t('save.cancel')}</button>
        <button
          className={`${styles.btn} ${styles.primaryBtn}`}
          onClick={() => value.trim() && onConfirm(value.trim())}
          disabled={!value.trim()}
        >
          {confirmLabel ?? t('save.save')}
        </button>
      </div>
    </Modal>
  )
}
