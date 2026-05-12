import { Modal } from './Modal'
import { useLocale } from '../i18n/LocaleProvider'
import styles from './Modal.module.css'

interface Props {
  open: boolean
  title: string
  message: string
  confirmLabel?: string
  destructive?: boolean
  onCancel: () => void
  onConfirm: () => void
}

export function ConfirmDialog({
  open, title, message, confirmLabel, destructive,
  onCancel, onConfirm
}: Props) {
  const { t } = useLocale()
  return (
    <Modal open={open} onClose={onCancel} title={title}>
      <p className={styles.msg}>{message}</p>
      <div className={styles.actions}>
        <button className={styles.btn} onClick={onCancel}>{t('save.cancel')}</button>
        <button
          className={`${styles.btn} ${destructive ? styles.dangerBtn : styles.primaryBtn}`}
          onClick={onConfirm}
        >
          {confirmLabel ?? t('save.confirm')}
        </button>
      </div>
    </Modal>
  )
}
