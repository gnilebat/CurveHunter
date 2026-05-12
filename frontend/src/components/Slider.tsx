import styles from './Slider.module.css'

interface Props {
  label: string
  hint?: string
  value: number       // 0..max
  onChange: (v: number) => void
  step?: number
  max?: number        // default 1
  /** Optional marker on the track where the slider crosses into "extended" territory (e.g. 1.0 on a 0..2 slider). */
  markerAt?: number
  /** Optional warning shown only when value > markerAt. */
  warningOverMarker?: string
  /** Apply a fun colour-shifting fill and a pulsing glow past the marker. */
  intense?: boolean
}

export function Slider({
  label, hint, value, onChange,
  step = 0.05, max = 1, markerAt, warningOverMarker, intense
}: Props) {
  const pct = Math.round(value * 100)
  const fillPct = Math.round((value / max) * 100)
  const markerPct = markerAt !== undefined ? Math.round((markerAt / max) * 100) : null
  const showWarning =
    markerAt !== undefined && warningOverMarker && value > markerAt
  const isHot = intense && markerAt !== undefined && value > markerAt
  const intensity = intense ? Math.min(1, value / max) : 0
  // 0 at the marker, ramps to 1 at max. Drives animation intensity past 100%.
  const hotIntensity =
    intense && markerAt !== undefined && max > markerAt
      ? Math.min(1, Math.max(0, (value - markerAt) / (max - markerAt)))
      : 0

  const wrapClasses = [
    styles.wrap,
    intense ? styles.intense : '',
    isHot ? styles.hot : ''
  ].filter(Boolean).join(' ')

  return (
    <div
      className={wrapClasses}
      style={{
        '--intensity': intensity,
        '--hot-intensity': hotIntensity
      } as React.CSSProperties}
    >
      <div className={styles.head}>
        <span className={styles.label}>{label}</span>
        <span className={styles.value}>{pct}%</span>
      </div>
      <div className={styles.trackWrap}>
        <input
          type="range"
          min={0}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className={styles.range}
          style={{ '--pct': `${fillPct}%` } as React.CSSProperties}
        />
        {markerPct !== null && (
          <span
            className={styles.marker}
            style={{ left: `${markerPct}%` }}
            aria-hidden
          />
        )}
      </div>
      {hint && !showWarning && <p className={styles.hint}>{hint}</p>}
      {showWarning && <p className={styles.warning}>⚠ {warningOverMarker}</p>}
    </div>
  )
}
