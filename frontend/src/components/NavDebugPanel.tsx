import { useLocale } from '../i18n/LocaleProvider'
import styles from './NavDebugPanel.module.css'

interface Props {
  traveledM: number
  totalM: number
  playing: boolean
  speedKmh: number
  onSetTraveled: (m: number) => void
  onSetSpeed: (kmh: number) => void
  onPlayToggle: () => void
  onStep: () => void
  onNextTurn: () => void
  onReset: () => void
  onClose: () => void
}

function formatKm(m: number): string {
  return m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`
}

export function NavDebugPanel({
  traveledM, totalM, playing, speedKmh,
  onSetTraveled, onSetSpeed, onPlayToggle, onStep, onNextTurn, onReset, onClose
}: Props) {
  const { t } = useLocale()
  const pct = totalM > 0 ? Math.round((traveledM / totalM) * 100) : 0

  return (
    <div className={styles.wrap} role="region" aria-label={t('nav.debug.title')}>
      <div className={styles.head}>
        <span className={styles.title}>{t('nav.debug.title')}</span>
        <button className={styles.iconBtn} onClick={onClose} aria-label={t('nav.debug.close')}>×</button>
      </div>

      <div className={styles.row}>
        <button className={styles.primaryBtn} onClick={onPlayToggle}>
          {playing ? `⏸ ${t('nav.debug.pause')}` : `▶ ${t('nav.debug.play')}`}
        </button>
        <button className={styles.btn} onClick={onStep}>{t('nav.debug.step')}</button>
        <button className={styles.btn} onClick={onNextTurn}>{t('nav.debug.nextTurn')}</button>
        <button className={styles.btn} onClick={onReset}>{t('nav.debug.reset')}</button>
      </div>

      <label className={styles.field}>
        <span className={styles.fieldLabel}>
          {t('nav.debug.position')} — {pct}% ({formatKm(traveledM)} / {formatKm(totalM)})
        </span>
        <input
          type="range"
          min={0}
          max={Math.max(1, totalM)}
          step={1}
          value={Math.min(traveledM, totalM)}
          onChange={(e) => onSetTraveled(Number(e.target.value))}
          className={styles.range}
        />
      </label>

      <label className={styles.field}>
        <span className={styles.fieldLabel}>{t('nav.debug.speed')} — {speedKmh} km/h</span>
        <input
          type="range"
          min={10}
          max={200}
          step={5}
          value={speedKmh}
          onChange={(e) => onSetSpeed(Number(e.target.value))}
          className={styles.range}
        />
      </label>
    </div>
  )
}
