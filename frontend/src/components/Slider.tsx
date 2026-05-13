import { InfoIcon } from './InfoIcon'
import styles from './Slider.module.css'

interface Props {
  label: string
  hint?: string
  /** Optional InfoIcon tooltip next to the label (replaces hint when set). */
  info?: string
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
  label, hint, info, value, onChange,
  step = 0.05, max = 1, markerAt, warningOverMarker, intense
}: Props) {
  const pct = Math.round(value * 100)
  const fillPct = Math.round((value / max) * 100)
  const markerPct = markerAt !== undefined ? Math.round((markerAt / max) * 100) : null
  const showWarning =
    markerAt !== undefined && warningOverMarker && value > markerAt
  // Tiered fill colour for the intense (curviness) slider. Bands by % of the
  // displayed value (0..200%): green ≤50, yellow ≤100, red beyond.
  const fillColor = intense
    ? (pct <= 50 ? '#16a34a' : pct <= 100 ? '#eab308' : '#dc2626')
    : undefined
  const atMax = intense && value >= max

  const wrapClasses = [
    styles.wrap,
    intense ? styles.intense : '',
    atMax ? styles.glow : ''
  ].filter(Boolean).join(' ')

  return (
    <div
      className={wrapClasses}
      style={fillColor ? { '--fill-color': fillColor } as React.CSSProperties : undefined}
    >
      <div className={styles.head}>
        <span className={styles.label}>
          {label}
          {info && <InfoIcon text={info} />}
        </span>
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
