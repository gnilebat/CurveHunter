import styles from './Slider.module.css'
import { InfoIcon } from './InfoIcon'

interface Props {
  label: string
  hint?: string
  tooltip?: string   // shown as an info-icon next to the label instead of a hint line
  value: number
  steps: number[]
  formatValue: (v: number) => string
  onChange: (v: number) => void
}

export function StepSlider({ label, hint, tooltip, value, steps, formatValue, onChange }: Props) {
  const idx = Math.max(0, steps.indexOf(value))
  const pct = Math.round((idx / (steps.length - 1)) * 100)
  return (
    <div className={styles.wrap}>
      <div className={styles.head}>
        <span className={styles.label}>
          {label}
          {tooltip && <span className={styles.labelIcon}><InfoIcon text={tooltip} /></span>}
        </span>
        <span className={styles.value}>{formatValue(value)}</span>
      </div>
      <input
        type="range"
        min={0}
        max={steps.length - 1}
        step={1}
        value={idx}
        onChange={(e) => onChange(steps[Number(e.target.value)])}
        className={styles.range}
        style={{ '--pct': `${pct}%` } as React.CSSProperties}
      />
      {hint && !tooltip && <p className={styles.hint}>{hint}</p>}
    </div>
  )
}
